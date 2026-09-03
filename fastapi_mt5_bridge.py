"""SafeScalper MT5 bridge. Read-only by default; real-account orders are blocked.

Demo execution requires TF_ENABLE_DEMO_ORDERS=1 on the terminal host.
No retry after order_send: an ambiguous response is durably quarantined.
"""
import hashlib
import json
import math
import os
import secrets
import sqlite3
import sys
import threading
import time
from collections import defaultdict
from contextlib import asynccontextmanager, contextmanager
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field
from broker_lifecycle import BrokerLifecycle, init_schema

try:
    import MetaTrader5 as mt5
    MT5_AVAILABLE = True
except ImportError:
    MT5_AVAILABLE = False

    class MockMT5:
        """Read-only synthetic adapter. Never pretends to execute an order."""
        ORDER_TYPE_BUY, ORDER_TYPE_SELL = 0, 1
        ORDER_FILLING_FOK, ORDER_FILLING_IOC, ORDER_FILLING_RETURN = 0, 1, 2
        TRADE_ACTION_DEAL, ORDER_TIME_GTC, TRADE_RETCODE_DONE = 1, 0, 10009

        def initialize(self): return True
        def shutdown(self): pass
        def account_info(self):
            return SimpleNamespace(login=777888, server="SYNTHETIC-MOCK", balance=500.0,
                                   equity=500.0, margin_free=500.0, currency="USD", trade_mode=0)
        def symbol_info(self, symbol):
            if not symbol.startswith("XAUUSD"): return None
            return SimpleNamespace(digits=2, visible=True, filling_mode=1, trade_exemode=2,
                volume_min=.01, volume_max=100., volume_step=.01, point=.01,
                trade_stops_level=0, trade_freeze_level=0, trade_tick_size=.01,
                trade_tick_value=1., trade_contract_size=100.)
        def symbol_select(self, symbol, visible): return True
        def symbol_info_tick(self, symbol):
            return SimpleNamespace(ask=2650.50, bid=2650.20, time=int(time.time()))
        def order_calc_profit(self, side, symbol, volume, entry, exit):
            return (1 if side == 0 else -1) * (exit - entry) * volume * 100
        def order_calc_margin(self, side, symbol, volume, price): return price * volume
        def positions_get(self): return ()
        def orders_get(self): return ()
        def history_deals_get(self, start, end): return ()
        def copy_rates_from_pos(self, symbol, timeframe, start, count):
            seconds = int(timeframe) * 60
            last = int(time.time()) // seconds * seconds - start * seconds
            result = []
            for i in range(count - 1, -1, -1):
                stamp = last - i * seconds
                base = 2650 + math.sin(stamp / seconds / 11) * 2.5
                result.append(dict(time=stamp, open=base, high=base + .45, low=base - .45,
                                   close=base + math.sin(stamp / seconds) * .18, tick_volume=50))
            return result

    mt5 = MockMT5()

ROOT = Path(__file__).resolve().parent
CONFIG = json.loads((ROOT / "strategy_config.json").read_text())
SAFE = CONFIG["safe_scalper_pro"]
EXECUTION = CONFIG["execution"]
DB = os.getenv("TF_DATABASE_PATH", str(ROOT / "trading_system.db"))
SECRET = os.getenv("TF_WEBHOOK_SECRET", "").strip() or secrets.token_urlsafe(32)
ENABLE_DEMO_ORDERS = os.getenv("TF_ENABLE_DEMO_ORDERS") == "1"
START_MANAGEMENT_WORKER = True
MANAGEMENT_STATE = {"healthy": False, "last_tick": 0., "account_id": "", "last_error": "Management worker has not started"}
MT5_LOCK = threading.RLock()
RATE_LOCK = threading.Lock()
_request_history = defaultdict(list)
TIMEFRAME_MINUTES = {"1m": 1, "5m": 5, "15m": 15, "30m": 30, "1h": 60, "4h": 240}
TIMEFRAME_MAP = {key: getattr(mt5, "TIMEFRAME_" + {"1h": "H1", "4h": "H4"}.get(key, "M" + str(value)), value)
                 for key, value in TIMEFRAME_MINUTES.items()}


def utcnow():
    return datetime.now(timezone.utc)


@contextmanager
def get_db():
    conn = sqlite3.connect(DB, timeout=10)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    with get_db() as conn:
        conn.execute("PRAGMA journal_mode=WAL")
        # Separate versioned tables preserve the legacy journal without trusting its state.
        conn.execute("""CREATE TABLE IF NOT EXISTS safe_requests (
            account TEXT NOT NULL, signal_id TEXT NOT NULL, fingerprint TEXT NOT NULL,
            day TEXT NOT NULL, status TEXT NOT NULL, receipt TEXT,
            PRIMARY KEY(account, signal_id))""")
        conn.execute("""CREATE TABLE IF NOT EXISTS safe_risk (
            account TEXT PRIMARY KEY, peak REAL NOT NULL, day TEXT NOT NULL,
            daily_locked INTEGER NOT NULL DEFAULT 0, drawdown_locked INTEGER NOT NULL DEFAULT 0)""")
        init_schema(conn)


def enforce_rate_limit(request: Request):
    ip = request.client.host if request.client else "unknown"
    now = time.monotonic()
    with RATE_LOCK:
        # Bound memory for expired peers as well as this peer.
        for peer in list(_request_history):
            _request_history[peer] = [t for t in _request_history[peer] if now - t < 60]
            if not _request_history[peer]: del _request_history[peer]
        if len(_request_history[ip]) >= 120:
            raise HTTPException(429, "Rate limit exceeded (120 requests/minute)")
        _request_history[ip].append(now)


def require_auth(authorization):
    token = authorization[7:] if authorization and authorization.startswith("Bearer ") else ""
    if not token or not secrets.compare_digest(token, SECRET):
        raise HTTPException(401, "Valid Bearer token required")


def connected_account():
    if not mt5.initialize():
        raise HTTPException(503, "MT5 initialization failed")
    account = mt5.account_info()
    if account is None:
        raise HTTPException(503, "MT5 account unavailable")
    return account


def finite(value, name, positive=False):
    try:
        number = float(value)
    except (ValueError, TypeError):
        raise HTTPException(503, f"{name} unavailable")
    if not math.isfinite(number) or (number <= 0 if positive else number < 0):
        raise HTTPException(503, f"{name} invalid")
    return number


def account_key(account):
    return f"{account.server}:{account.login}"


def account_mode(account):
    return "DEMO" if getattr(account, "trade_mode", -1) == 0 else "REAL" if getattr(account, "trade_mode", -1) == 2 else "UNKNOWN"


def demo_authorized(account):
    return MT5_AVAILABLE and ENABLE_DEMO_ORDERS and account_mode(account) == "DEMO"


def execution_enabled(account):
    return demo_authorized(account) and MANAGEMENT_STATE["healthy"] and \
        MANAGEMENT_STATE["account_id"] == account_key(account) and \
        0 <= time.time() - MANAGEMENT_STATE["last_tick"] <= 10


def resolve_symbol(requested):
    # Exact broker symbol is sent back to the client; no proxy instruments.
    for symbol in [requested, requested + "m", requested + ".pro", requested + ".ecn", requested + "_i", requested + ".pc"]:
        info = mt5.symbol_info(symbol)
        if info:
            if not info.visible and not mt5.symbol_select(symbol, True):
                raise HTTPException(503, "Cannot select broker symbol")
            return symbol, info
    raise HTTPException(404, f"Broker symbol {requested} unavailable")


def read_news_status():
    terminal = getattr(mt5, "terminal_info", lambda: None)()
    common_path = getattr(terminal, "commondata_path", "")
    locked = {"available": False, "locked": True, "label": "Native calendar unavailable — fail closed"}
    if not common_path: return locked
    try:
        data = json.loads((Path(common_path) / "Files" / "TradingFlow_NewsGuard.json").read_text(encoding="utf-8-sig"))
        age = time.time() - float(data["updated_epoch"])
        if not math.isfinite(age) or not -5 <= age <= 180 or type(data["locked"]) is not bool:
            return {**locked, "label": "Calendar heartbeat stale or invalid — fail closed"}
        if data.get("minutes_before", -1) < EXECUTION["news_minutes_before"] or data.get("minutes_after", -1) < EXECUTION["news_minutes_after"]:
            return {**locked, "label": "Calendar safety window is too small — fail closed"}
        return {"available": True, "locked": data["locked"], "label": str(data.get("label", ""))[:240]}
    except (OSError, ValueError, KeyError, TypeError):
        return locked


def broker_snapshot(account=None):
    account = account or connected_account()
    balance = finite(account.balance, "balance", True)
    equity = finite(account.equity, "equity", True)
    now = utcnow()
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    positions, orders = mt5.positions_get(), mt5.orders_get()
    deals = mt5.history_deals_get(day_start, now)
    if positions is None or orders is None or deals is None:
        raise HTTPException(503, "Broker positions/orders/deal history unavailable — fail closed")
    def amount(d):
        return sum(float(getattr(d, k, 0)) for k in ("profit", "commission", "swap", "fee"))
    pnl = [amount(d) for d in deals]
    if any(not math.isfinite(n) for n in pnl):
        raise HTTPException(503, "Broker deal amounts invalid")
    # Reconstruct start-of-day balance including deposits/withdrawals. Losses cannot
    # be hidden by profits, deposits or a browser/server restart.
    start_balance = balance - sum(pnl)
    if start_balance <= 0:
        raise HTTPException(503, "Start-of-day balance unavailable")
    losses = sum(max(0, -amount(d)) for d in deals if getattr(d, "type", -1) in (0, 1))
    losses += max(0, balance - equity)
    entries = {getattr(d, "order", getattr(d, "ticket", 0)) for d in deals
               if getattr(d, "type", -1) in (0, 1) and getattr(d, "entry", -1) in (0, 2)}
    key, day = account_key(account), now.date().isoformat()
    with get_db() as conn:
        conn.execute("BEGIN IMMEDIATE")
        saved = conn.execute("SELECT * FROM safe_risk WHERE account=?", (key,)).fetchone()
        peak = max(equity, saved["peak"] if saved else equity)
        drawdown = max(0, (peak - equity) / peak * 100)
        daily_lock = bool(saved and saved["day"] == day and saved["daily_locked"]) or losses >= start_balance * SAFE["daily_loss_percent"] / 100
        dd_lock = bool(saved and saved["drawdown_locked"]) or drawdown >= SAFE["max_drawdown_pct"]
        conn.execute("INSERT OR REPLACE INTO safe_risk VALUES (?,?,?,?,?)", (key, peak, day, int(daily_lock), int(dd_lock)))
        unresolved = conn.execute("SELECT COUNT(*) FROM safe_requests WHERE account=? AND status IN ('SENDING','UNKNOWN')", (key,)).fetchone()[0]
        unresolved += conn.execute("SELECT COUNT(*) FROM safe_actions WHERE account=? AND status IN ('SENDING','UNKNOWN')", (key,)).fetchone()[0]
        reserved = conn.execute("SELECT COUNT(*) FROM safe_requests WHERE account=? AND day=? AND status != 'REJECTED'", (key, day)).fetchone()[0]
    return {
        "source": "MT5" if MT5_AVAILABLE else "MOCK", "account_id": key, "account_mode": account_mode(account),
        "execution_enabled": execution_enabled(account), "checked_at": int(time.time() * 1000),
        "balance": balance, "equity": equity, "currency": account.currency,
        "free_margin": finite(account.margin_free, "free margin"), "peak_equity": peak,
        "day_start_balance": start_balance, "daily_loss": losses, "daily_trades": max(len(entries), reserved),
        "drawdown_percent": drawdown, "halted": daily_lock or dd_lock or bool(unresolved),
        "halt_reason": "Unresolved broker submission — reconcile with broker evidence" if unresolved else "Maximum drawdown (latched)" if dd_lock else "Daily loss limit (latched)" if daily_lock else "",
        "positions": [{k: getattr(p, k, None) for k in ("ticket", "symbol", "type", "volume", "price_open", "price_current", "sl", "tp", "profit", "magic")} for p in positions],
        "pending_orders": len(orders),
        "deals": [{**{k: getattr(d, k, None) for k in ("ticket", "order", "position_id", "time", "symbol", "entry", "type", "volume", "price", "magic")}, "net": amount(d)} for d in deals][-100:],
    }


LIFECYCLE = BrokerLifecycle(sys.modules[__name__])


def management_loop(stop):
    """Host-owned worker; browser sessions never drive broker exits."""
    while not stop.is_set():
        try:
            result = LIFECYCLE.run_once()
            MANAGEMENT_STATE.update(healthy=True, last_tick=time.time(), last_error="", **result)
        except Exception as error:
            MANAGEMENT_STATE.update(healthy=False, last_error=str(getattr(error, "detail", "Management worker failed; inspect terminal"))[:240])
        stop.wait(1)


@asynccontextmanager
async def lifespan(app):
    init_db()
    if not os.getenv("TF_WEBHOOK_SECRET"):
        print("[!] TF_WEBHOOK_SECRET is unset. Set it on the host to authenticate; generated token is not logged.")
    print(f"[*] SafeScalper bridge: {'MT5' if MT5_AVAILABLE else 'SYNTHETIC MOCK'}; real-account execution BLOCKED.")
    stop = threading.Event()
    worker = None
    if START_MANAGEMENT_WORKER and MT5_AVAILABLE and ENABLE_DEMO_ORDERS:
        worker = threading.Thread(target=management_loop, args=(stop,), name="safe-demo-exits", daemon=True)
        worker.start()
    try:
        yield
    finally:
        stop.set()
        if worker: worker.join(timeout=3)
        MANAGEMENT_STATE.update(healthy=False, last_error="Bridge stopped")
        # Do not race shutdown against an SDK call still in progress.
        if not worker or not worker.is_alive(): mt5.shutdown()


app = FastAPI(title="SafeScalper — protected MT5 bridge", lifespan=lifespan)
app.add_middleware(CORSMiddleware,
    allow_origins=os.getenv("TF_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000,http://127.0.0.1:4173").split(","),
    allow_methods=["GET", "POST"], allow_headers=["Authorization", "Content-Type"])


@app.get("/health", dependencies=[Depends(enforce_rate_limit)])
def health(authorization: str | None = Header(None)):
    require_auth(authorization)
    with MT5_LOCK:
        account = connected_account()
        return {"mt5_connected": MT5_AVAILABLE, "authenticated": True,
                "source": "MT5" if MT5_AVAILABLE else "MOCK", "account_mode": account_mode(account),
                "execution_enabled": execution_enabled(account)}


@app.get("/account-state", dependencies=[Depends(enforce_rate_limit)])
def account_state(authorization: str | None = Header(None)):
    require_auth(authorization)
    with MT5_LOCK: return broker_snapshot()


@app.get("/symbol-spec/{requested}", dependencies=[Depends(enforce_rate_limit)])
def symbol_spec(requested: str, authorization: str | None = Header(None)):
    require_auth(authorization)
    with MT5_LOCK:
        account = connected_account()
        symbol, info = resolve_symbol(requested)
        tick = mt5.symbol_info_tick(symbol)
        if tick is None: raise HTTPException(503, "Quote unavailable")
        point = finite(info.point, "point", True)
        minimum = finite(info.volume_min, "minimum volume", True)
        # Take the more conservative side/account-currency native probe.
        losses = [finite(abs(mt5.order_calc_profit(side, symbol, 1., price, price + direction * 100 * point) or 0), "native loss", True)
                  for side, price, direction in [(0, tick.ask, -1), (1, tick.bid, 1)]]
        margins = [finite(mt5.order_calc_margin(side, symbol, minimum, price), "native margin", True)
                   for side, price in [(0, tick.ask), (1, tick.bid)]]
        return {"symbol": symbol, "source": "MT5" if MT5_AVAILABLE else "MOCK",
                "digits": info.digits, "point": point, "tick_size": finite(info.trade_tick_size, "tick size", True),
                "tick_value": finite(info.trade_tick_value, "tick value"), "contract_size": finite(info.trade_contract_size, "contract", True),
                "volume_min": minimum, "volume_max": finite(info.volume_max, "max volume", True), "volume_step": finite(info.volume_step, "volume step", True),
                "stops_level": info.trade_stops_level, "freeze_level": info.trade_freeze_level,
                "spread_points": (tick.ask - tick.bid) / point, "loss_per_lot_100_points": max(losses), "margin_per_min_lot": max(margins),
                "account": {"id": account_key(account), "mode": account_mode(account), "balance": account.balance, "equity": account.equity,
                            "free_margin": account.margin_free, "currency": account.currency},
                "execution_enabled": execution_enabled(account), "checked_at": int(time.time() * 1000),
                "warning": "Real-account orders blocked. Demo advanced exits require a healthy host worker; broker SL/TP remain server-held."}


@app.get("/bars/{requested}", dependencies=[Depends(enforce_rate_limit)])
def bars(requested: str, timeframe: str = "5m", limit: int = 900, authorization: str | None = Header(None)):
    require_auth(authorization)
    if timeframe not in TIMEFRAME_MAP: raise HTTPException(422, "Unsupported timeframe")
    with MT5_LOCK:
        connected_account()
        symbol, _ = resolve_symbol(requested)
        # Position zero is forming. Never place it into completed-candle history.
        rates = mt5.copy_rates_from_pos(symbol, TIMEFRAME_MAP[timeframe], 1, max(3, min(limit, 2400)))
        if rates is None or len(rates) == 0: raise HTTPException(503, "No completed broker bars")
        normalized = []
        for row in rates:
            stamp = int(row["time"]) * 1000
            normalized.append(dict(t=stamp, o=float(row["open"]), h=float(row["high"]), l=float(row["low"]), c=float(row["close"]), v=float(row["tick_volume"]), day=stamp // 86400000))
        return {"source": "MT5" if MT5_AVAILABLE else "MOCK", "symbol": symbol, "timeframe": timeframe, "closed_only": True, "bars": normalized}


@app.get("/news-status", dependencies=[Depends(enforce_rate_limit)])
def news_status(authorization: str | None = Header(None)):
    require_auth(authorization)
    with MT5_LOCK: return read_news_status()


class OrderPayload(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False, extra="forbid")
    ticker: str = Field(min_length=2, max_length=20, pattern=r"^[A-Za-z0-9_.\-]+$")
    action: Literal["BUY", "SELL"]
    qty: float = Field(gt=0, le=100)
    price: float = Field(gt=0, le=1e9)
    sl: float = Field(gt=0, le=1e9)
    tp: float = Field(gt=0, le=1e9)
    signal_id: str = Field(min_length=12, max_length=120)
    account_id: str = Field(min_length=3, max_length=200)
    source: Literal["mt5"]
    signal_time: int = Field(gt=0)
    expires_at: int = Field(gt=0)
    max_loss: float = Field(gt=0, le=1e6)
    max_margin_pct: float = Field(default=25, gt=0, le=25)
    magic: Literal[202503] = 202503


class OperatorPayload(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False, extra="forbid")
    operation_id: str = Field(min_length=16, max_length=100, pattern=r"^[A-Za-z0-9_-]+$")
    account_id: str = Field(min_length=3, max_length=200)
    confirm_account_id: str = Field(min_length=3, max_length=200)
    kind: Literal["ENTRY", "MANAGEMENT", "RESET_DRAWDOWN"]
    entity: str = Field(min_length=1, max_length=120)
    broker_ticket: int | None = Field(default=None, gt=0, le=9007199254740991)
    reason: str = Field(min_length=15, max_length=500, pattern=r".*\S.*")


@app.get("/lifecycle", dependencies=[Depends(enforce_rate_limit)])
def lifecycle_status(authorization: str | None = Header(None)):
    require_auth(authorization)
    return LIFECYCLE.status()


@app.post("/operator/reconcile", dependencies=[Depends(enforce_rate_limit)])
def reconcile(operation: OperatorPayload, authorization: str | None = Header(None)):
    require_auth(authorization)
    if operation.confirm_account_id != operation.account_id or len(operation.reason.strip()) < 15:
        raise HTTPException(422, "Type the exact account ID and provide a meaningful review reason")
    return LIFECYCLE.operator_action(operation)


def fingerprint(order):
    return hashlib.sha256(order.model_dump_json().encode()).hexdigest()


def verify_strategy_signal(order, symbol, equity):
    """Recompute the seven gates from terminal M5 bars; client labels are not proof."""
    import copy
    import pandas as pd
    from gold_strategy_core import SignalGenerator
    rates = mt5.copy_rates_from_pos(symbol, TIMEFRAME_MAP["5m"], 1, 904)
    if rates is None or len(rates) < 650:
        raise HTTPException(503, "Insufficient completed broker M5/H1 history")
    frame = pd.DataFrame(rates)
    frame["timestamp"] = frame["time"].astype("int64") * 1000
    frame = frame[frame["timestamp"] <= order.signal_time].tail(900).reset_index(drop=True)
    # Bind the calculation to the broker's actual instrument, not demo metadata.
    cfg = copy.deepcopy(CONFIG)
    info = mt5.symbol_info(symbol)
    cfg["instrument"].update(symbol=symbol, digits=info.digits, point_value=info.point,
                             contract_size=info.trade_contract_size, volume_min=info.volume_min,
                             volume_max=info.volume_max, volume_step=info.volume_step)
    generator = SignalGenerator(cfg)
    enriched = generator.prepare_dataframe(frame)
    indices = enriched.index[enriched["timestamp"] == order.signal_time].tolist()
    if len(indices) != 1:
        raise HTTPException(422, "Signal candle missing from completed broker history")
    signal = generator.evaluate_bar(enriched, indices[0], equity)
    expected = "LONG" if order.action == "BUY" else "SHORT"
    if signal is None or signal.side != expected:
        raise HTTPException(422, "Server seven-gate validation failed")


def existing_receipt(conn, key, order):
    existing = conn.execute("SELECT * FROM safe_requests WHERE account=? AND signal_id=?", (key, order.signal_id)).fetchone()
    if not existing: return None
    if existing["fingerprint"] != fingerprint(order):
        raise HTTPException(409, "Signal ID reused with different order payload")
    if existing["status"] == "FILLED": return json.loads(existing["receipt"])
    raise HTTPException(409, f"Signal already {existing['status']}; do not retry with a new ID. Reconcile in MT5.")


@app.post("/webhook", dependencies=[Depends(enforce_rate_limit)])
def place_order(order: OrderPayload, authorization: str | None = Header(None)):
    require_auth(authorization)
    with MT5_LOCK:
        account = connected_account()
        key = account_key(account)
        if order.account_id != key: raise HTTPException(409, "Broker account changed")
        if not execution_enabled(account):
            raise HTTPException(423, "Execution locked: real/mock accounts prohibited; demo orders require host opt-in and a healthy exit worker")
        with get_db() as conn:
            cached = existing_receipt(conn, key, order)
            if cached: return cached
        snapshot = broker_snapshot(account)
        if snapshot["halted"]: raise HTTPException(403, snapshot["halt_reason"])
        if snapshot["daily_trades"] >= SAFE["max_day_trades"]: raise HTTPException(403, "Daily trade cap")
        if snapshot["positions"] or snapshot["pending_orders"]: raise HTTPException(403, "One-position guard: account not flat")
        news = read_news_status()
        if not news["available"] or news["locked"]: raise HTTPException(403, news["label"])
        now = utcnow()
        now_ms = int(time.time() * 1000)
        if not (0 <= now_ms - order.signal_time <= 15 * 60_000 and now_ms < order.expires_at <= order.signal_time + 15 * 60_000):
            raise HTTPException(422, "Signal timestamp or expiry invalid")
        if now.weekday() >= 5 or not SAFE["session_start_hour_utc"] <= now.hour < SAFE["session_end_hour_utc"] or (now.weekday() == 4 and now.hour >= SAFE["friday_cutoff_hour_utc"]):
            raise HTTPException(403, "Session/Friday/weekend lock")
        symbol, info = resolve_symbol(order.ticker)
        if not symbol.startswith(CONFIG["system"]["symbol"]): raise HTTPException(422, "Only configured strategy symbol permitted")
        verify_strategy_signal(order, symbol, snapshot["equity"])
        tick = mt5.symbol_info_tick(symbol)
        if tick is None or not -2 <= time.time() - float(getattr(tick, "time", 0)) <= 15:
            raise HTTPException(503, "Quote missing or stale")
        point, tick_size = finite(info.point, "point", True), finite(info.trade_tick_size, "tick size", True)
        ask, bid = finite(tick.ask, "ask", True), finite(tick.bid, "bid", True)
        if ask < bid: raise HTTPException(503, "Crossed broker quote")
        buy = order.action == "BUY"
        entry, exit_quote = (ask, bid) if buy else (bid, ask)
        deviation = EXECUTION["max_deviation_points"]
        if abs(entry - order.price) > deviation * point: raise HTTPException(422, "Quote moved beyond configured deviation tolerance")
        minimum_distance = (max(info.trade_stops_level, info.trade_freeze_level) + EXECUTION["broker_stop_buffer_points"]) * point
        if buy:
            sl = math.floor(min(order.sl, exit_quote - minimum_distance) / tick_size + 1e-9) * tick_size
            tp = math.ceil(max(order.tp, exit_quote + minimum_distance) / tick_size - 1e-9) * tick_size
            direction_ok = order.sl < bid and order.tp > ask
        else:
            sl = math.ceil(max(order.sl, exit_quote + minimum_distance) / tick_size - 1e-9) * tick_size
            tp = math.floor(min(order.tp, exit_quote - minimum_distance) / tick_size + 1e-9) * tick_size
            direction_ok = order.sl > ask and order.tp < bid
        if not direction_ok or min(sl, tp) <= 0: raise HTTPException(422, "Protective prices no longer valid")
        spread_points = (ask - bid) / point
        if spread_points > SAFE["max_spread_points"] or (ask - bid) / abs(entry - sl) * 100 > SAFE["max_spread_to_stop_percent"]:
            raise HTTPException(403, "Spread cap or spread/stop cap exceeded")
        minimum, maximum, step = [finite(getattr(info, field), field, True) for field in ("volume_min", "volume_max", "volume_step")]
        volume = round(math.floor((min(order.qty, maximum) + 1e-12) / step) * step, 8)
        if order.qty < minimum or volume < minimum: raise HTTPException(422, "Minimum lot exceeds requested risk; never round upward")
        side = 0 if buy else 1
        adverse_entry = entry + (deviation * point if buy else -deviation * point)
        profit = mt5.order_calc_profit(side, symbol, volume, adverse_entry, sl)
        if profit is None or not math.isfinite(profit) or profit >= 0: raise HTTPException(503, "Native loss calculation failed")
        loss = -profit
        # Reserve known round-trip commissions; slippage/gaps can still exceed this estimate.
        costs = volume * CONFIG["execution_costs"]["commission_per_lot_round_turn"]
        budget = min(order.max_loss, snapshot["equity"] * min(SAFE["risk_percent"], 1) / 100)
        if loss + costs > budget + 1e-8: raise HTTPException(422, "Native loss plus commission exceeds approved risk")
        margin = finite(mt5.order_calc_margin(side, symbol, volume, entry), "native margin", True)
        if margin > min(snapshot["free_margin"], snapshot["equity"] * min(order.max_margin_pct, SAFE["max_margin_percent"]) / 100):
            raise HTTPException(422, "Native margin exceeds free margin/equity cap")
        # One supported fill policy; never retry another policy after submission.
        if info.filling_mode & 1: filling = mt5.ORDER_FILLING_FOK
        elif info.filling_mode & 2: filling = mt5.ORDER_FILLING_IOC
        elif getattr(info, "trade_exemode", -1) in (0, 1, 3): filling = mt5.ORDER_FILLING_RETURN
        else: raise HTTPException(422, "No supported filling mode")
        request = dict(action=mt5.TRADE_ACTION_DEAL, symbol=symbol, volume=volume, type=side,
                       price=entry, sl=round(sl, info.digits), tp=round(tp, info.digits), deviation=deviation,
                       magic=order.magic, comment="SAFE:" + hashlib.sha256(order.signal_id.encode()).hexdigest()[:20],
                       type_time=mt5.ORDER_TIME_GTC, type_filling=filling)
        checker = getattr(mt5, "order_check", None)
        check = checker(request) if checker else None
        if check is None: raise HTTPException(503, "OrderCheck unavailable")
        if check.retcode != 0: raise HTTPException(422, f"OrderCheck rejected ({check.retcode})")
        # Durable reservation before any side effect. Survives process death and
        # serializes multiple workers sharing this database. Never auto-expire it.
        with get_db() as conn:
            conn.execute("BEGIN IMMEDIATE")
            cached = existing_receipt(conn, key, order)
            if cached: return cached
            if conn.execute("SELECT 1 FROM safe_requests WHERE account=? AND status IN ('SENDING','UNKNOWN')", (key,)).fetchone():
                raise HTTPException(409, "Another submission is unresolved")
            count = conn.execute("SELECT COUNT(*) FROM safe_requests WHERE account=? AND day=? AND status != 'REJECTED'", (key, now.date().isoformat())).fetchone()[0]
            if count >= SAFE["max_day_trades"]: raise HTTPException(403, "Daily reserved-order cap")
            positions, orders = mt5.positions_get(), mt5.orders_get()
            if positions is None or orders is None or positions or orders: raise HTTPException(409, "Account is not confirmed flat")
            if conn.execute("SELECT 1 FROM safe_actions WHERE account=? AND status IN ('SENDING','UNKNOWN')", (key,)).fetchone():
                raise HTTPException(409, "A management submission is unresolved")
            policy = {**SAFE, "point": point, "tick_size": tick_size,
                      "broker_stop_buffer_points": EXECUTION["broker_stop_buffer_points"],
                      "max_deviation_points": deviation}
            envelope = {"request": request, "policy": policy, "estimated_loss": loss + costs, "margin_required": margin}
            conn.execute("""INSERT INTO safe_requests
                (account,signal_id,fingerprint,day,status,receipt,request_json,submitted_at)
                VALUES (?,?,?,?,?,NULL,?,?)""", (key, order.signal_id, fingerprint(order), now.date().isoformat(), "SENDING", json.dumps(envelope), time.time()))
        try:
            current = connected_account()
            if account_key(current) != key or not execution_enabled(current):
                raise HTTPException(409, "Account or management readiness changed before send")
            result = mt5.order_send(request)
        except Exception:
            result = None
        # Only a complete, valid broker receipt is accepted. Partial/placed/timeout
        # results remain UNKNOWN and block new submissions until operator review.
        receipt = None
        state = "UNKNOWN"
        if result is not None and result.retcode == mt5.TRADE_RETCODE_DONE:
            actual = float(getattr(result, "volume", 0))
            fill = float(getattr(result, "price", 0))
            ticket = int(getattr(result, "order", 0))
            if math.isfinite(actual) and 0 < actual <= volume + 1e-8 and math.isfinite(fill) and fill > 0 and ticket > 0:
                state = "FILLED"
                receipt = dict(status="FILLED", signal_id=order.signal_id, ticket=ticket, volume=actual,
                               fill_price=fill, sl=request["sl"], tp=request["tp"], estimated_loss=loss + costs,
                               margin_required=margin, account_id=key, account_mode="DEMO", source="MT5")
        elif result is not None and result.retcode in (10004, 10006, 10013, 10014, 10015, 10016, 10017, 10018, 10019, 10020, 10021, 10030):
            state = "REJECTED"
        with get_db() as conn:
            updated = conn.execute("UPDATE safe_requests SET status=?, receipt=? WHERE account=? AND signal_id=? AND status='SENDING'",
                         (state, json.dumps(receipt) if receipt else None, key, order.signal_id))
            if updated.rowcount == 0:
                # A second process may have reconciled a long-running SDK call.
                # Preserve its audited result instead of overwriting newer state.
                return existing_receipt(conn, key, order)
        if state == "REJECTED": raise HTTPException(422, f"MT5 rejected order ({result.retcode}); not retried")
        if receipt is None: raise HTTPException(409, "Submission outcome UNKNOWN. Check MT5; no retry or new signal allowed.")
        return receipt
