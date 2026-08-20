# fastapi_mt5_bridge.py — Direct MetaTrader 5 Execution Receiver for Trading Flow
# Run with: uvicorn fastapi_mt5_bridge:app --host 0.0.0.0 --port 8000 --reload

import os
import sqlite3
from contextlib import asynccontextmanager, contextmanager
from datetime import datetime
from typing import Optional
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import MetaTrader5 as mt5

DB = "trading_system.db"
SECRET = os.getenv("TF_WEBHOOK_SECRET", "TF-SECRET-KEY")
MAX_DAILY_SL = int(os.getenv("MAX_DAILY_SL_HITS", "2"))
ALLOWED_ORIGINS = os.getenv("TF_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000,http://localhost:8000").split(",")

def init_db():
    """Initialize database schema once at startup."""
    with sqlite3.connect(DB) as conn:
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
        # Safe migration if table existed previously without slippage columns
        try:
            conn.execute("ALTER TABLE trades ADD COLUMN expected_price REAL")
        except Exception:
            pass
        try:
            conn.execute("ALTER TABLE trades ADD COLUMN slippage_pts REAL DEFAULT 0")
        except Exception:
            pass
        conn.commit()

@contextmanager
def get_db():
    """Thread-safe SQLite context manager ensuring proper connection closure."""
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("==================================================")
    print("⚡ Trading Flow — MetaTrader 5 Local Bridge")
    print("==================================================")
    init_db()
    if SECRET == "TF-SECRET-KEY":
        print("[!] WARNING: Default secret key 'TF-SECRET-KEY' in use! Set TF_WEBHOOK_SECRET for production security.")

    if not mt5.initialize():
        print(f"[!] MT5 initialize() failed: {mt5.last_error()}")
        print("[!] Ensure MetaTrader 5 desktop client is open and 'Allow Algorithmic Trading' is enabled.")
    else:
        acc = mt5.account_info()
        if acc:
            print(f"[✓] MT5 Connected: Account #{acc.login} | Server: {acc.server} | Balance: ${acc.balance:,.2f}")
        else:
            print("[!] MT5 Initialized but no account logged in.")
    yield
    mt5.shutdown()
    print("[*] MT5 Bridge shut down.")

app = FastAPI(title="Trading Flow MT5 Bridge", lifespan=lifespan)

# Allow browser cross-origin requests only from trusted frontend origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in ALLOWED_ORIGINS if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class OrderPayload(BaseModel):
    secret: Optional[str] = None
    ticker: str
    action: str  # "BUY" or "SELL"
    qty: float
    price: float
    sl: float | None = None
    tp: float | None = None
    comment: str | None = "Trading Flow Signal"

def verify_auth(payload_secret: Optional[str], auth_header: Optional[str]):
    token = payload_secret
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1].strip()
    if not token or token != SECRET:
        raise HTTPException(status_code=401, detail="Invalid secret key or unauthorized token")

@app.get("/health")
def health():
    connected = False
    acc_info = None
    if mt5.initialize():
        acc = mt5.account_info()
        if acc:
            connected = True
            acc_info = {
                "login": acc.login,
                "server": acc.server,
                "balance": acc.balance,
                "equity": acc.equity,
                "currency": acc.currency
            }
    return {
        "status": "online",
        "mt5_connected": connected,
        "account": acc_info,
        "time": datetime.utcnow().isoformat() + "Z"
    }

@app.post("/webhook")
def place_order(order: OrderPayload, authorization: Optional[str] = Header(None)):
    # 1. Validate Secret (from payload or Authorization: Bearer header)
    verify_auth(order.secret, authorization)

    # 2. Check Daily Stop-Loss Limit
    today = datetime.utcnow().strftime("%Y-%m-%d")
    with get_db() as conn:
        row = conn.execute("SELECT sl_hits FROM daily_limits WHERE day = ?", (today,)).fetchone()
        sl_hits = row["sl_hits"] if row else 0
        if sl_hits >= MAX_DAILY_SL:
            raise HTTPException(status_code=403, detail=f"Trading halted: Max daily SL hits reached ({sl_hits}/{MAX_DAILY_SL})")

    # 3. Ensure MT5 is ready
    if not mt5.initialize():
        raise HTTPException(status_code=503, detail=f"MT5 unavailable: {mt5.last_error()}")

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
        raise HTTPException(status_code=400, detail=f"Symbol {order.ticker} not found in MT5 Market Watch")

    if not sym_info.visible:
        mt5.symbol_select(symbol, True)

    tick = mt5.symbol_info_tick(symbol)
    if not tick:
        raise HTTPException(status_code=500, detail=f"No tick data available for {symbol}")

    action_type = mt5.ORDER_TYPE_BUY if order.action.upper() == "BUY" else mt5.ORDER_TYPE_SELL
    fill_price = tick.ask if action_type == mt5.ORDER_TYPE_BUY else tick.bid

    # Position sizing bounds
    step = sym_info.volume_step if sym_info.volume_step > 0 else 0.01
    vol = max(sym_info.volume_min, min(sym_info.volume_max, round(order.qty / step) * step))

    # Adaptive filling mode resolution based on broker symbol support
    filling_type = mt5.ORDER_FILLING_IOC
    if hasattr(sym_info, 'filling_mode'):
        if sym_info.filling_mode & 1: # ORDER_FILLING_FOK
            filling_type = mt5.ORDER_FILLING_FOK
        elif sym_info.filling_mode & 2: # ORDER_FILLING_IOC
            filling_type = mt5.ORDER_FILLING_IOC
        elif sym_info.filling_mode & 4: # ORDER_FILLING_RETURN
            filling_type = mt5.ORDER_FILLING_RETURN

    req = {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": symbol,
        "volume": float(vol),
        "type": action_type,
        "price": fill_price,
        "sl": float(order.sl) if order.sl else 0.0,
        "tp": float(order.tp) if order.tp else 0.0,
        "deviation": 20,
        "magic": 108821,
        "comment": order.comment or "Trading Flow",
        "type_time": mt5.ORDER_TIME_GTC,
        "type_filling": filling_type,
    }

    result = mt5.order_send(req)
    if not result or result.retcode != mt5.TRADE_RETCODE_DONE:
        err = result.comment if result else str(mt5.last_error())
        raise HTTPException(status_code=500, detail=f"MT5 order failed: {err}")

    # Calculate execution slippage
    expected_px = float(order.price) if order.price else fill_price
    slippage_pts = round(abs(result.price - expected_px), 3)

    # Record trade with slippage audit in DB
    with get_db() as conn:
        conn.execute("""
            INSERT INTO trades (ts, ticket, symbol, action, volume, expected_price, entry, slippage_pts, sl, tp, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN')
        """, (
            datetime.utcnow().isoformat(),
            result.order,
            symbol,
            order.action.upper(),
            vol,
            expected_px,
            result.price,
            slippage_pts,
            order.sl or 0.0,
            order.tp or 0.0
        ))

    return {
        "status": "FILLED",
        "ticket": result.order,
        "symbol": symbol,
        "action": order.action.upper(),
        "volume": vol,
        "price": result.price,
        "expected_price": expected_px,
        "slippage": slippage_pts,
        "sl": order.sl,
        "tp": order.tp
    }

@app.post("/report_sl")
def report_sl(order_secret: Optional[str] = None, authorization: Optional[str] = Header(None)):
    """Report a Stop Loss hit event to increment the daily discipline limit counter."""
    verify_auth(order_secret, authorization)
    today = datetime.utcnow().strftime("%Y-%m-%d")
    with get_db() as conn:
        conn.execute("""
            INSERT INTO daily_limits (day, sl_hits)
            VALUES (?, 1)
            ON CONFLICT(day) DO UPDATE SET sl_hits = sl_hits + 1
        """, (today,))
        row = conn.execute("SELECT sl_hits FROM daily_limits WHERE day = ?", (today,)).fetchone()
        sl_hits = row["sl_hits"] if row else 1

    return {
        "status": "recorded",
        "day": today,
        "sl_hits": sl_hits,
        "max_daily_sl": MAX_DAILY_SL,
        "halted": sl_hits >= MAX_DAILY_SL
    }

@app.get("/daily_status")
def get_daily_status():
    """Retrieve daily loss limits and remaining SL allowances."""
    today = datetime.utcnow().strftime("%Y-%m-%d")
    with get_db() as conn:
        row = conn.execute("SELECT sl_hits FROM daily_limits WHERE day = ?", (today,)).fetchone()
        sl_hits = row["sl_hits"] if row else 0
    return {
        "day": today,
        "sl_hits": sl_hits,
        "max_daily_sl": MAX_DAILY_SL,
        "halted": sl_hits >= MAX_DAILY_SL
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
