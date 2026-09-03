"""Fixed-parameter M5 research audit. Synthetic/CSV bars are NOT real ticks."""
import argparse
import hashlib
import html
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

import numpy as np
import pandas as pd
from advanced_backtest_engine import AdvancedBacktestEngine

def generate_realistic_gold_data(days: int = 365, timeframe_mins: int = 5) -> pd.DataFrame:
    """
    Generates synthetic XAUUSD bars for an engine smoke test.
    """
    print(f"[*] Generating {days} days of synthetic XAUUSD M{timeframe_mins} data...")
    bars_per_day = (24 * 60) // timeframe_mins
    total_bars = days * bars_per_day

    start_ts = int(datetime(2025, 1, 1, 0, 0, 0, tzinfo=timezone.utc).timestamp() * 1000)
    step_ms = timeframe_mins * 60 * 1000

    timestamps = [start_ts + (i * step_ms) for i in range(total_bars)]
    price = 2650.0

    opens, highs, lows, closes, volumes = [], [], [], [], []
    np.random.seed(42791)

    for i, ts in enumerate(timestamps):
        dt = datetime.fromtimestamp(ts / 1000.0, tz=timezone.utc)
        hour = dt.hour

        if hour >= 0 and hour < 7:
            # Asian Session
            vol = 0.60
            drift = np.sin(i / 12.0) * 0.20
            base_vol_lots = np.random.uniform(50, 150)
        elif hour >= 7 and hour < 12:
            # London Session
            vol = 1.80
            drift = np.random.choice([-1.2, 1.2], p=[0.48, 0.52])
            base_vol_lots = np.random.uniform(300, 800)
        elif hour >= 12 and hour < 17:
            # NY Session / Overlap
            vol = 2.40
            drift = np.random.choice([-1.5, 1.6], p=[0.47, 0.53])
            base_vol_lots = np.random.uniform(500, 1200)
        else:
            vol = 0.80
            drift = -0.10
            base_vol_lots = np.random.uniform(80, 200)

        macro_cycle = np.sin(i / 1500.0) * 0.40
        noise = np.random.normal(0, vol)

        if np.random.rand() < 0.0035:
            vol *= 3.5
            noise *= 3.0
            base_vol_lots *= 6.0

        o = price
        c = o + drift + macro_cycle + noise
        h = max(o, c) + abs(np.random.normal(0, vol * 0.6))
        l = min(o, c) - abs(np.random.normal(0, vol * 0.6))

        price = max(2000.0, c)

        opens.append(round(o, 2))
        highs.append(round(h, 2))
        lows.append(round(l, 2))
        closes.append(round(c, 2))
        volumes.append(round(base_vol_lots, 1))

    df = pd.DataFrame({
        "timestamp": timestamps,
        "open": opens,
        "high": highs,
        "low": lows,
        "close": closes,
        "volume": volumes,
    })
    return df



def load_broker_csv(path: str, utc_offset_hours: float | None = None) -> pd.DataFrame:
    """Read MT5 tab-separated bar export or normalized OHLCV CSV.
    MT5 date/time exports use broker server time; require an explicit UTC offset.
    Export periods spanning a DST change must be normalized to UTC beforehand.
    """
    frame = pd.read_csv(path, sep=None, engine="python")
    frame.columns = [str(c).strip().strip("<>").lower() for c in frame.columns]
    if "timestamp" in frame:
        numeric = pd.to_numeric(frame["timestamp"], errors="coerce")
        if numeric.isna().any(): raise ValueError("timestamp must be UTC Unix seconds or milliseconds")
        frame["timestamp"] = (numeric * (1000 if numeric.max() < 1e11 else 1)).astype("int64")
    elif "date" in frame and "time" in frame:
        if utc_offset_hours is None:
            raise ValueError("MT5 DATE/TIME requires --broker-utc-offset-hours; do not assume server time is UTC")
        dates = pd.to_datetime(frame["date"].astype(str) + " " + frame["time"].astype(str), utc=True, errors="raise")
        dates = dates - pd.Timedelta(hours=utc_offset_hours)
        # Explicit unit conversion works with pandas datetime64[us] as well as [ns].
        frame["timestamp"] = dates.astype("datetime64[ms, UTC]").astype("int64")
    else:
        raise ValueError("CSV needs timestamp or MT5 <DATE>/<TIME> columns")
    if "volume" not in frame:
        frame["volume"] = frame["tickvol"] if "tickvol" in frame else 0.
    required = ["timestamp", "open", "high", "low", "close", "volume"]
    if any(c not in frame for c in required): raise ValueError("CSV is missing OHLCV columns")
    for column in required + (["spread"] if "spread" in frame else []):
        frame[column] = pd.to_numeric(frame[column], errors="raise")
        if not np.isfinite(frame[column].to_numpy()).all(): raise ValueError(f"Invalid values in {column}")
    if len(frame) < 900: raise ValueError("Need at least 900 completed M5 bars for H1 warmup")
    if not (frame["timestamp"].diff().dropna() > 0).all(): raise ValueError("Timestamps must be ordered and unique")
    if (frame["timestamp"] % 300_000 != 0).any(): raise ValueError("Expected UTC-aligned M5 candles")
    if ((frame["timestamp"].diff().dropna() < 300_000)).any(): raise ValueError("Input is finer than M5; resample first")
    if (frame["timestamp"] + 300_000 > int(datetime.now(timezone.utc).timestamp()*1000)).any():
        raise ValueError("Future or still-forming candles are not allowed")
    if (frame[["open", "high", "low", "close"]] <= 0).any().any() or (frame["volume"] < 0).any():
        raise ValueError("Prices must be positive and volume nonnegative")
    if ((frame["low"] > frame[["open","close"]].min(axis=1)) | (frame["high"] < frame[["open","close"]].max(axis=1))).any():
        raise ValueError("OHLC envelope is invalid")
    if "spread" in frame and (frame["spread"] < 0).any(): raise ValueError("Spread must be nonnegative")
    return frame.reset_index(drop=True)


def rolling_walk_forward_analysis(df: pd.DataFrame, window_bars=7000, step_bars=7000) -> Dict[str, Any]:
    """Non-overlapping fixed-parameter windows, NOT parameter optimization."""
    if step_bars < window_bars: raise ValueError("Overlapping evaluation folds are not allowed")
    folds = []
    for start in range(0, len(df)-window_bars+1, step_bars):
        result = AdvancedBacktestEngine().run(df.iloc[start:start+window_bars].reset_index(drop=True))
        folds.append({k: result[k] for k in ("total_trades", "win_rate", "profit_factor", "net_profit", "max_drawdown_pct")})
    enough = len(folds) >= 5 and all(f["total_trades"] >= 30 for f in folds)
    std = float(np.std([f["win_rate"] for f in folds])) if folds else None
    threshold_pass = enough and std <= 8 and all(f["profit_factor"] > 1.2 and f["net_profit"] > 0 and f["max_drawdown_pct"] <= 5 for f in folds)
    return {"folds": folds, "sample_sufficient": enough, "win_rate_std": std, "diagnostic_pass": threshold_pass,
            "live_validated": False, "method": "Non-overlapping fixed-parameter evaluation; no optimization"}


def write_reports(frame, metrics, split_results, folds, source, output_dir):
    output = Path(output_dir)
    output.mkdir(parents=True, exist_ok=True)
    config_bytes = Path("strategy_config.json").read_bytes()
    compact = {k: v for k, v in metrics.items() if k not in ("trades", "equity_curve", "timestamps")}
    manifest = {"source": source, "bars": len(frame), "config_sha256": hashlib.sha256(config_bytes).hexdigest(),
                "first_utc": pd.to_datetime(frame.timestamp.iloc[0], unit="ms", utc=True).isoformat(),
                "last_utc": pd.to_datetime(frame.timestamp.iloc[-1], unit="ms", utc=True).isoformat(),
                "live_validated": False, "metrics": compact, "folds": folds}
    # Strict JSON: infinity is displayed as null, never a fabricated numeric PF.
    def sanitize(value):
        if isinstance(value, dict): return {str(k): sanitize(v) for k,v in value.items()}
        if isinstance(value, (list, tuple)): return [sanitize(v) for v in value]
        if isinstance(value, (float, np.floating)) and not math.isfinite(value): return None
        if isinstance(value, np.generic): return value.item()
        return value
    (output / "safe_scalper_validation.json").write_text(json.dumps(sanitize(manifest), indent=2, allow_nan=False)+"\n")

    rows = []
    for label, result in [("Earlier 70% (fixed settings)", split_results[0]), ("Later 30% (fixed settings)", split_results[1]), ("Full dataset", metrics)]:
        rows.append(f"| {label} | {result['total_trades']} | {result['profit_factor']:.2f} | {result['net_profit']:.2f} | {result['max_drawdown_pct']:.2f}% |")
    report = f"""# SafeScalper research audit — NOT LIVE VALIDATED

Source: **{source['label']}**. {len(frame):,} completed M5 bars.
Period: {manifest['first_utc']} → {manifest['last_utc']}.
Config SHA-256: {manifest['config_sha256']}

| Evaluation | Trades | Profit factor | Net P/L (USD model) | Mark-to-market DD |
|---|---:|---:|---:|---:|
{chr(10).join(rows)}

## Validation boundary

- This is a bar-based software/research test, not broker real-tick validation.
- Synthetic results do not measure a real trading edge. Imported OHLCV also lacks intra-bar tick order.
- SL is checked before TP on ambiguous bars; stop gaps use the adverse opening price.
- Spread, fixed slippage and round-trip commission are modeled; missing historical news is NOT reconstructed.
- Server/news/calendar behavior, broker fills and exact MetaEditor indicator seeding need Windows MT5 verification.
- Real-account execution remains blocked regardless of these metrics.

## Fixed-parameter rolling windows

{len(folds['folds'])} non-overlapping windows; no parameter search or optimization.
Sufficient sample (at least 5 windows, 30 trades each): **{folds['sample_sufficient']}**.
Win-rate standard deviation: **{folds['win_rate_std'] if folds['win_rate_std'] is not None else 'unavailable'}**.
Diagnostic thresholds passed: **{folds['diagnostic_pass']}**. This is never permission for live trading.

## Small-account caution

Minimum lot, commission and spread can consume a large part of a small risk budget.
Native MT5 account-currency profit/margin calculations remain mandatory before demo submission.
No profitability or account-growth claim is made by this report.
"""
    (output / "safe_scalper_backtest_audit.md").write_text(report)
    # Small, auditable HTML report with correctly distributed equity points.
    curve = metrics["equity_curve"]
    sample_indices = np.linspace(0, len(curve)-1, min(300, len(curve))).astype(int)
    lo, hi = min(curve), max(curve)
    points = " ".join(f"{idx/max(len(curve)-1,1)*900:.2f},{190-(curve[idx]-lo)/max(hi-lo,1e-9)*160:.2f}" for idx in sample_indices)
    page = f"""<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>SafeScalper · Research audit</title><style>body{{font:14px/1.6 system-ui;background:#0b1019;color:#e2e8f0;max-width:1100px;margin:40px auto;padding:24px}}pre{{white-space:pre-wrap;overflow-wrap:anywhere}}svg{{width:100%;background:#111b2a;border-radius:16px}}h1{{color:#fbbf24}}</style>
<h1>Research only · Live execution NOT validated</h1><svg role="img" aria-label="Mark-to-market equity curve" viewBox="0 0 900 220"><polyline fill="none" stroke="#60a5fa" stroke-width="2" points="{points}"/></svg><pre>{html.escape(report)}</pre></html>"""
    (output / "safe_scalper_backtest_report.html").write_text(page)
    print(f"[OK] Reports written to {output.resolve()} — live_validated=false")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv", help="Broker-exported M5 OHLCV CSV/TSV")
    parser.add_argument("--broker-utc-offset-hours", type=float)
    parser.add_argument("--days", type=int, default=365, help="Synthetic smoke-test duration when --csv is absent")
    parser.add_argument("--skip-folds", action="store_true")
    parser.add_argument("--output-dir", default="reports")
    args = parser.parse_args()
    if args.csv:
        frame = load_broker_csv(args.csv, args.broker_utc_offset_hours)
        source = {"label": "Imported broker OHLCV — NOT real ticks", "path": str(Path(args.csv).resolve()), "sha256": hashlib.sha256(Path(args.csv).read_bytes()).hexdigest()}
    else:
        if not 7 <= args.days <= 3650: parser.error("--days must be 7–3650")
        frame = generate_realistic_gold_data(args.days)
        source = {"label": "SYNTHETIC smoke test — no broker market-data evidence", "seed": 42791}
    split = int(len(frame)*.7)
    earlier = AdvancedBacktestEngine().run(frame.iloc[:split].reset_index(drop=True))
    later = AdvancedBacktestEngine().run(frame.iloc[split:].reset_index(drop=True))
    full = AdvancedBacktestEngine().run(frame)
    folds = rolling_walk_forward_analysis(frame) if not args.skip_folds else {"folds": [], "sample_sufficient": False, "win_rate_std": None, "diagnostic_pass": False, "live_validated": False}
    write_reports(frame, full, (earlier, later), folds, source, args.output_dir)


if __name__ == "__main__":
    main()
