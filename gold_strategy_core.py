"""SafeScalperPro-only signal engine used by the offline backtester."""

import math
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd


class MarketRegime(str, Enum):
    TRENDING_BULL = "TRENDING_BULL"
    TRENDING_BEAR = "TRENDING_BEAR"
    RANGING = "RANGING"
    NEWS_SPIKE = "NEWS_SPIKE"


@dataclass
class Signal:
    symbol: str
    side: str
    entry: float
    sl: float
    tp: float
    rr_ratio: float
    confluence_score: int
    regime: MarketRegime
    setup_name: str
    reason: str
    order_flow: str
    timestamp: int
    bar_index: int
    volume_lots: float
    risk_usd: float
    timeframe_align: str


class SignalGenerator:
    """Evaluates only the seven SafeScalperPro gates on completed bars."""

    def __init__(self, config: Dict[str, Any]):
        self.cfg = config
        self.safe = config["safe_scalper_pro"]
        self.instrument = config["instrument"]

    def prepare_dataframe(self, frame: pd.DataFrame) -> pd.DataFrame:
        d = frame.copy()
        if d.empty:
            raise ValueError("At least one completed OHLCV candle is required")
        fast, slow = int(self.safe["ema_fast"]), int(self.safe["ema_slow"])
        atr_period, rsi_period = int(self.safe["atr_period"]), int(self.safe["rsi_period"])
        lookback = int(self.safe["breakout_lookback"])
        d["safe_ema_fast"] = d["close"].ewm(span=fast, adjust=False).mean()
        d["safe_ema_slow"] = d["close"].ewm(span=slow, adjust=False).mean()
        tr = pd.concat([d["high"] - d["low"], (d["high"] - d["close"].shift()).abs(), (d["low"] - d["close"].shift()).abs()], axis=1).max(axis=1)
        d["safe_atr"] = tr.ewm(alpha=1.0 / atr_period, adjust=False).mean()
        delta = d["close"].diff().fillna(0.0)
        gain = delta.clip(lower=0).ewm(alpha=1.0 / rsi_period, adjust=False).mean()
        loss = (-delta.clip(upper=0)).ewm(alpha=1.0 / rsi_period, adjust=False).mean()
        rs = gain / loss.replace(0, np.nan)
        d["safe_rsi"] = (100 - 100 / (1 + rs)).fillna(pd.Series(np.where(gain > 0, 100.0, 50.0), index=d.index))
        d["safe_breakout_high"] = d["high"].shift(1).rolling(lookback, min_periods=lookback).max()
        d["safe_breakout_low"] = d["low"].shift(1).rolling(lookback, min_periods=lookback).min()
        timestamps = pd.to_datetime(d["timestamp"], unit="ms" if float(d["timestamp"].iloc[-1]) > 1e10 else "s", utc=True)
        close_series = pd.Series(d["close"].to_numpy(), index=pd.DatetimeIndex(timestamps))
        hourly = close_series.resample("1h").last()
        # A gap/partial hour is not valid H1 evidence. This is an M5-only system.
        hourly = hourly.where(close_series.resample("1h").count() == 12).dropna()
        h1 = pd.DataFrame({
            "fast": hourly.ewm(span=int(self.safe["mtf_ema_fast"]), min_periods=int(self.safe["mtf_ema_slow"]) + 2, adjust=False).mean(),
            "slow": hourly.ewm(span=int(self.safe["mtf_ema_slow"]), min_periods=int(self.safe["mtf_ema_slow"]) + 2, adjust=False).mean(),
        })
        # At the close of 10:55 M5, hour 10:00 is now complete and usable.
        h1.index = h1.index + pd.Timedelta(hours=1)
        hour_keys = pd.DatetimeIndex(timestamps + pd.Timedelta(minutes=5)).floor("h")
        d["safe_mtf_fast"] = h1["fast"].reindex(hour_keys).to_numpy()
        d["safe_mtf_slow"] = h1["slow"].reindex(hour_keys).to_numpy()
        return d

    def _effective_points(self, points: float) -> float:
        if self.safe.get("auto_adjust_two_digit_gold", True) and int(self.instrument.get("digits", 2)) == 2 and self.instrument["symbol"].startswith("XAU"):
            return points / 10.0
        return points

    def evaluate_bar(self, df: pd.DataFrame, idx: int, account_balance: float = 500.0) -> Optional[Signal]:
        minimum = max(int(self.safe["ema_slow"]) + 5, int(self.safe["atr_period"]) + 5, int(self.safe["breakout_lookback"]) + 5)
        if idx < minimum:
            return None
        row, previous = df.iloc[idx], df.iloc[idx - 1]
        stamp = int(row.get("timestamp", idx))
        dt = datetime.fromtimestamp(stamp / 1000 if stamp > 1e10 else stamp, tz=timezone.utc)
        if dt.weekday() >= 5 or not (int(self.safe["session_start_hour_utc"]) <= dt.hour < int(self.safe["session_end_hour_utc"])):
            return None
        if self.safe.get("avoid_friday", True) and dt.weekday() == 4 and dt.hour >= int(self.safe["friday_cutoff_hour_utc"]):
            return None

        fast, slow, volatility = float(row.safe_ema_fast), float(row.safe_ema_slow), float(row.safe_atr)
        momentum, high, low, close = float(row.safe_rsi), float(row.safe_breakout_high), float(row.safe_breakout_low), float(row.close)
        h1_fast, h1_slow = float(row.safe_mtf_fast), float(row.safe_mtf_slow)
        checks = [fast, slow, volatility, momentum, high, low] + ([h1_fast, h1_slow] if self.safe["use_mtf"] else [])
        if any(not math.isfinite(value) for value in checks):
            return None
        separation = abs(fast - slow) >= volatility * float(self.safe["trend_strength_atr"])
        buffer = volatility * float(self.safe["breakout_buffer_atr"])
        buy = all([fast > slow, separation, close > fast and close > slow, close > high - buffer and float(previous.close) <= high, self.safe["rsi_buy_min"] <= momentum <= self.safe["rsi_buy_max"], close > float(previous.close), not self.safe["use_mtf"] or h1_fast > h1_slow])
        sell = all([fast < slow, separation, close < fast and close < slow, close < low + buffer and float(previous.close) >= low, self.safe["rsi_sell_min"] <= momentum <= self.safe["rsi_sell_max"], close < float(previous.close), not self.safe["use_mtf"] or h1_fast < h1_slow])
        if not buy and not sell:
            return None

        point, contract = float(self.instrument["point_value"]), float(self.instrument["contract_size"])
        stop_points, target_points = self._effective_points(float(self.safe["stop_loss_points"])), self._effective_points(float(self.safe["take_profit_points"]))
        spread_points = float(row.get("spread", self.cfg["execution_costs"]["spread_points_standard"]))
        if spread_points > float(self.safe["max_spread_points"]) or spread_points / stop_points * 100 > float(self.safe["max_spread_to_stop_percent"]):
            return None
        stop_distance, target_distance = stop_points * point, target_points * point
        risk_budget = account_balance * float(self.safe["risk_percent"]) / 100
        costs = self.cfg["execution_costs"]
        loss_per_lot = (stop_distance + (spread_points / 2 + float(costs["slippage_points_standard"])) * point) * contract + float(costs["commission_per_lot_round_turn"])
        raw_lots = risk_budget / max(loss_per_lot, 1e-12)
        leverage = float(self.instrument.get("leverage", 100))
        margin_cap_lots = account_balance * float(self.safe["max_margin_percent"]) / 100 * leverage / max(close * contract, 1e-12)
        step, minimum_lot = float(self.instrument["volume_step"]), float(self.instrument["volume_min"])
        lots = math.floor(min(raw_lots, margin_cap_lots, float(self.instrument["volume_max"])) / step + 1e-9) * step
        if lots + 1e-12 < minimum_lot:
            return None
        actual_risk = lots * loss_per_lot
        side = "LONG" if buy else "SHORT"
        regime = MarketRegime.TRENDING_BULL if buy else MarketRegime.TRENDING_BEAR
        return Signal(
            symbol=self.instrument["symbol"], side=side, entry=close,
            sl=close - stop_distance if buy else close + stop_distance,
            tp=close + target_distance if buy else close - target_distance,
            rr_ratio=target_distance / stop_distance, confluence_score=100, regime=regime,
            setup_name="SAFE_SCALPER_PRO_7_GATE", reason=f"All seven gates aligned · EMA {fast:.2f}/{slow:.2f} · RSI {momentum:.1f}",
            order_flow="MOMENTUM_CONFIRMED", timestamp=stamp, bar_index=idx, volume_lots=round(lots, 8),
            risk_usd=actual_risk, timeframe_align="H1_M5_ALIGNED" if self.safe["use_mtf"] else "M5_ONLY",
        )
