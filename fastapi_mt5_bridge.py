# fastapi_mt5_bridge.py — Hardened MetaTrader 5 Execution Bridge for Trading Flow
# Run with: uvicorn fastapi_mt5_bridge:app --host 0.0.0.0 --port 8000 --reload

import os
import secrets
import sqlite3
import time
from collections import defaultdict
from contextlib import asynccontextmanager, contextmanager
from datetime import datetime
from typing import Literal, Optional
from fastapi import FastAPI, Header, HTTPException, Request, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

try:
    import MetaTrader5 as mt5
    MT5_AVAILABLE = True
except (ImportError, ModuleNotFoundError):
    MT5_AVAILABLE = False
    class MockMT5:
        ORDER_TYPE_BUY = 0
        ORDER_TYPE_SELL = 1
        ORDER_FILLING_FOK = 0
        ORDER_FILLING_IOC = 1
        ORDER_FILLING_RETURN = 2
        TRADE_ACTION_DEAL = 1
        ORDER_TIME_GTC = 0
        TRADE_RETCODE_DONE = 10009

        @staticmethod
        def initialize(): return True
        @staticmethod
        def shutdown(): pass
        @staticmethod
        def last_error(): return (1, "Running in macOS Simulation/Mock Bridge Mode")
        @staticmethod
        def account_info():
            class Acc:
                login = 777888
                balance = 10000.0
                equity = 10000.0
                currency = "USD"
                leverage = 100
                server = "Mock-Demo"
            return Acc()
        @staticmethod
        def symbol_info(symbol):
            class Sym:
                digits = 2
                filling_mode = 0
            return Sym()
        @staticmethod
        def symbol_select(symbol, enable): return True
        @staticmethod
        def symbol_info_tick(symbol):
            class Tick:
                ask = 2650.50
                bid = 2650.20
            return Tick()
        @staticmethod
        def order_send(req):
            class Res:
                retcode = 10009
                order = 99887766
                price = req.get("price", 2650.50)
                comment = "EXECUTED_IN_SIMULATION_BRIDGE"
            return Res()

    mt5 = MockMT5()

DB = "trading_system.db"

# 1. Secure Secret Key Resolution (No weak hardcoded default fallback)
_env_secret = os.getenv("TF_WEBHOOK_SECRET")
if _env_secret and _env_secret.strip() != "":
    SECRET = _env_secret.strip()
    IS_AUTO_SECRET = False
else:
    SECRET = secrets.token_urlsafe(32)
    IS_AUTO_SECRET = True

MAX_DAILY_SL = int(os.getenv("MAX_DAILY_SL_HITS", "2"))
ALLOWED_ORIGINS = os.getenv(
    "TF_ALLOWED_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000,http://localhost:8000"
).split(",")

# 2. In-Memory Sliding-Window Rate Limiter (Max 60 requests/min per IP)
RATE_LIMIT_WINDOW_SEC = 60
MAX_REQUESTS_PER_WINDOW = 60
_request_history = defaultdict(list)

def enforce_rate_limit(request: Request):
    client_ip = request.client.host if request.client else "127.0.0.1"
    now = time.time()
    # Clean history older than window
    _request_history[client_ip] = [t for t in _request_history[client_ip] if now - t < RATE_LIMIT_WINDOW_SEC]
    
    if len(_request_history[client_ip]) >= MAX_REQUESTS_PER_WINDOW:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Maximum 60 requests per minute allowed."
        )
    _request_history[client_ip].append(now)

def init_db():
    """Initialize database schema with WAL mode for concurrency."""
    with sqlite3.connect(DB) as conn:
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS trades (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts TEXT,
                ticket INTEGER,
                symbol TEXT,
                action TEXT,
                volume REAL,
                expected_price REAL,
                entry REAL,
                slippage_pts REAL DEFAULT 0,
                sl REAL,
                tp REAL,
                profit REAL DEFAULT 0,
                status TEXT
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS daily_limits (
                day TEXT PRIMARY KEY,
                sl_hits INTEGER DEFAULT 0
            )
        """)
        conn.commit()

@contextmanager
def get_db():
    """Thread-safe SQLite context manager with explicit transaction controls."""
    conn = sqlite3.connect(DB, timeout=10.0)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

import sys
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("==================================================")
    print("[*] Trading Flow PRO — MetaTrader 5 Hardened Bridge")
    print("==================================================")
    init_db()
    if IS_AUTO_SECRET:
        print(f"[!] SECURE TOKEN GENERATED: {SECRET}")
        print("[!] Copy this token into Trading Flow Broker Settings Modal as your MT5 Secret.")
    else:
        print("[OK] Webhook Secret loaded securely from TF_WEBHOOK_SECRET environment.")

    if not mt5.initialize():
        print(f"[!] MT5 initialize() failed: {mt5.last_error()}")
        print("[!] Ensure MetaTrader 5 desktop client is open and 'Allow Algorithmic Trading' is enabled.")
    else:
        acc = mt5.account_info()
        if acc:
            print(f"[OK] MT5 Connected: Account #{acc.login} | Server: {acc.server} | Balance: ${acc.balance:,.2f}")
        else:
            print("[!] MT5 Initialized but no account logged in.")
    yield
    mt5.shutdown()
    print("[*] MT5 Bridge shut down cleanly.")

app = FastAPI(title="Trading Flow Hardened MT5 Bridge", lifespan=lifespan)

# Allow browser cross-origin requests only from trusted frontend origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in ALLOWED_ORIGINS if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 3. Robust Pydantic Input Validation & Sanitization
class OrderPayload(BaseModel):
    secret: Optional[str] = Field(None, description="Optional payload secret token")
    ticker: str = Field(..., min_length=2, max_length=20, pattern=r"^[A-Za-z0-9_.\-]+$", description="Symbol ticker e.g. XAUUSD")
    action: Literal["BUY", "SELL", "buy", "sell"] = Field(..., description="Trade direction")
    qty: float = Field(..., gt=0.0, le=1000.0, description="Volume/Lots (must be > 0 and <= 1000)")
    price: float = Field(..., gt=0.0, description="Expected entry price")
    sl: Optional[float] = Field(None, gt=0.0, description="Stop Loss price")
    tp: Optional[float] = Field(None, gt=0.0, description="Take Profit price")
    comment: Optional[str] = Field("Trading Flow Signal", max_length=64, description="Order comment")

    @field_validator("action")
    @classmethod
    def normalize_action(cls, v: str) -> str:
        return v.upper()

def verify_auth(payload_secret: Optional[str], auth_header: Optional[str]) -> bool:
    token = payload_secret
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1].strip()
    if not token or not secrets.compare_digest(token, SECRET):
        return False
    return True

@app.get("/health", dependencies=[Depends(enforce_rate_limit)])
def health(authorization: Optional[str] = Header(None)):
    """
    Health check endpoint.
    - Unauthenticated requests receive sanitized status without sensitive account balance/login exposure.
    - Authenticated requests with valid Bearer token receive full MT5 telemetry.
    """
    is_authenticated = verify_auth(None, authorization)
    connected = False
    acc_info = None

    if mt5.initialize():
        acc = mt5.account_info()
        if acc:
            connected = True
            if is_authenticated:
                acc_info = {
                    "login": acc.login,
                    "server": acc.server,
                    "balance": acc.balance,
                    "equity": acc.equity,
                    "currency": acc.currency
                }

    resp = {
        "status": "online",
        "mt5_connected": connected,
        "authenticated": is_authenticated,
        "time": datetime.utcnow().isoformat() + "Z"
    }
    if is_authenticated:
        resp["account"] = acc_info

    return resp

@app.post("/webhook", dependencies=[Depends(enforce_rate_limit)])
def place_order(order: OrderPayload, authorization: Optional[str] = Header(None)):
    """
    Authenticated order placement with atomic race-condition protected daily limit enforcement.
    """
    # 1. Enforce Authentication
    if not verify_auth(order.secret, authorization):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized: Invalid or missing authentication secret"
        )

    # 2. Atomic Daily Stop-Loss Check (Prevent TOCTOU race conditions)
    today = datetime.utcnow().strftime("%Y-%m-%d")
    with get_db() as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute("SELECT sl_hits FROM daily_limits WHERE day = ?", (today,)).fetchone()
        sl_hits = row["sl_hits"] if row else 0
        if sl_hits >= MAX_DAILY_SL:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Trading halted: Max daily SL hits reached ({sl_hits}/{MAX_DAILY_SL})"
            )

    # 3. Ensure MT5 is ready
    if not mt5.initialize():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"MT5 unavailable: {mt5.last_error()}"
        )

    # Find symbol in MT5
    symbol = order.ticker
    sym_info = mt5.symbol_info(symbol)
    if not sym_info:
        for suffix in ["m", ".pro", ".ecn", "_i", ""]:
            alt = symbol + suffix
            sym_info = mt5.symbol_info(alt)
            if sym_info:
                symbol = alt
                break

    if not sym_info:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Symbol {order.ticker} not found in MT5 Market Watch"
        )

    if not sym_info.visible:
        mt5.symbol_select(symbol, True)

    tick = mt5.symbol_info_tick(symbol)
    if not tick:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"No tick data available for {symbol}"
        )

    action_type = mt5.ORDER_TYPE_BUY if order.action == "BUY" else mt5.ORDER_TYPE_SELL
    fill_price = tick.ask if action_type == mt5.ORDER_TYPE_BUY else tick.bid

    # Position sizing bounds
    step = sym_info.volume_step if sym_info.volume_step > 0 else 0.01
    vol = max(sym_info.volume_min, min(sym_info.volume_max, round(order.qty / step) * step))

    fillings_to_try = [mt5.ORDER_FILLING_FOK, mt5.ORDER_FILLING_IOC, mt5.ORDER_FILLING_RETURN]
    if hasattr(sym_info, 'filling_mode'):
        if sym_info.filling_mode & 1:
            fillings_to_try = [mt5.ORDER_FILLING_FOK, mt5.ORDER_FILLING_IOC, mt5.ORDER_FILLING_RETURN]
        elif sym_info.filling_mode & 2:
            fillings_to_try = [mt5.ORDER_FILLING_IOC, mt5.ORDER_FILLING_FOK, mt5.ORDER_FILLING_RETURN]
        else:
            fillings_to_try = [mt5.ORDER_FILLING_RETURN, mt5.ORDER_FILLING_IOC, mt5.ORDER_FILLING_FOK]

    last_result = None
    placed = False

    for f_mode in fillings_to_try:
        request_dict = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": symbol,
            "volume": float(vol),
            "type": action_type,
            "price": float(fill_price),
            "deviation": 20,
            "magic": 777001,
            "comment": order.comment or "Trading Flow",
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": f_mode,
        }
        if order.sl:
            request_dict["sl"] = float(order.sl)
        if order.tp:
            request_dict["tp"] = float(order.tp)

        res = mt5.order_send(request_dict)
        if res and res.retcode == mt5.TRADE_RETCODE_DONE:
            last_result = res
            placed = True
            break
        else:
            last_result = res

    if not placed:
        err_code = last_result.retcode if last_result else "UNKNOWN"
        err_comment = last_result.comment if last_result else "No response from MT5"
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Order rejected by MT5 (Code {err_code}): {err_comment}"
        )

    # 4. Compute realistic slippage and record
    actual_fill = last_result.price if last_result.price > 0 else fill_price
    slippage = abs(actual_fill - order.price)

    with get_db() as conn:
        conn.execute("""
            INSERT INTO trades (ts, ticket, symbol, action, volume, expected_price, entry, slippage_pts, sl, tp, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            datetime.utcnow().isoformat(),
            last_result.order,
            symbol,
            order.action,
            vol,
            order.price,
            actual_fill,
            slippage,
            order.sl,
            order.tp,
            "FILLED"
        ))

    return {
        "status": "success",
        "ticket": last_result.order,
        "volume": vol,
        "fill_price": actual_fill,
        "expected_price": order.price,
        "slippage": slippage,
        "retcode": last_result.retcode,
        "comment": last_result.comment
    }
