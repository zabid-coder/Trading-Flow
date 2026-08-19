import { useState } from "react";
import type { EngineConfig, EngineState, Trade } from "../engine/types";
import { fmtP } from "../engine/types";

type Mode = "webhook" | "semiauto";
type CodeTab = "payload" | "pine" | "receiver" | "dash";

const TV_TEMPLATE = `{
  "secret": "TF-XXXX",
  "ticker": "{{ticker}}",
  "action": "{{strategy.order.action}}",
  "qty": {{strategy.order.contracts}},
  "price": {{strategy.order.price}},
  "comment": "Trading Flow trap signal"
}`;

const PINE_FIXED = `//@version=5
strategy("Anish Core Engine — CORRECTED", overlay=true,
     initial_capital=100000, default_qty_type=strategy.cash,
     default_qty_value=1000, calc_on_every_tick=false)

// ---- risk controls ----
riskUSD    = input.float(375.0, "Fixed Risk ($)")
maxDailySL = input.int(2,       "Max Daily SL Hits")
minRR      = input.float(2.0,   "Minimum R:R")

// ---- AOI D: zero-look-ahead PDH/PDL (offset [1] + lookahead_off) ----
pdh = request.security(syminfo.tickerid, "D", high[1], barmerge.gaps_off, barmerge.lookahead_off)
pdl = request.security(syminfo.tickerid, "D", low[1],  barmerge.gaps_off, barmerge.lookahead_off)
plot(pdh, "PDH", color.new(color.red,   30), style=plot.style_stepline)
plot(pdl, "PDL", color.new(color.green, 30), style=plot.style_stepline)

// ---- repaint-proof daily-loss counter (closed-trade delta, not offsets) ----
var int dailySL   = 0
var int lastCount = 0
if strategy.closedtrades > lastCount
    if strategy.closedtrades.profit(strategy.closedtrades - 1) < 0
        dailySL += 1
    lastCount := strategy.closedtrades
if ta.change(time("D")) != 0
    dailySL := 0

// ---- reaction candles (spec step 3) ----
rng_   = high - low
body   = math.abs(close - open)
upWick = high - math.max(open, close)
dnWick = math.min(open, close) - low
isLPR  = dnWick >= rng_ * 0.5 and dnWick > body
isHPR  = upWick >= rng_ * 0.5 and upWick > body

// ---- trap conditions (spec step 4, right-side identity) ----
bullTrap = dailySL < maxDailySL and low  < pdl and close > pdl and isLPR
bearTrap = dailySL < maxDailySL and high > pdh and close < pdh and isHPR

// ---- FIX B3: real buffer, never a one-tick stop ----
atrBuf = math.max(syminfo.mintick * 5, ta.atr(14) * 0.15)

if bullTrap and strategy.position_size == 0
    sl   = low - atrBuf
    dist = close - sl
    tp   = close + dist * minRR
    qty  = riskUSD / dist                    // FIX B1: explicit qty — gold: $1/oz/point
    strategy.entry("TrapLong", strategy.long, qty=qty)
    strategy.exit("XLong", "TrapLong", stop=sl, limit=tp)

if bearTrap and strategy.position_size == 0
    sl   = high + atrBuf
    dist = sl - close
    tp   = close - dist * minRR
    qty  = riskUSD / dist
    strategy.entry("TrapShort", strategy.short, qty=qty)
    strategy.exit("XShort", "TrapShort", stop=sl, limit=tp)

plotshape(bullTrap, "Bull Trap", shape.triangleup,   location.belowbar, color.green, size=size.small)
plotshape(bearTrap, "Bear Trap", shape.triangledown, location.abovebar, color.red,   size=size.small)
plotchar(dailySL >= maxDailySL, "Halted", "x", location.top, color.red, size=size.tiny)

// ---- alert: attach webhook with "Order fills only" and the PAYLOAD-tab
//      template ({{strategy.order.*}}). FIX B2: never use {{plot_0}} —
//      plot_0 is the PDH line, not the stop loss. ----`;

const RECEIVER_V2 = `# webhook_receiver_v2.py — corrected · pip install fastapi uvicorn[standard] MetaTrader5
import os, sqlite3
from contextlib import asynccontextmanager
from datetime import datetime, date, time
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import MetaTrader5 as mt5

DB     = "trading_system.db"
SECRET = os.getenv("TF_WEBHOOK_SECRET", "CHANGE-ME")
MAX_SL = int(os.getenv("MAX_DAILY_SL_HITS", "2"))

def db():
    conn = sqlite3.connect(DB); conn.row_factory = sqlite3.Row
    conn.execute("""CREATE TABLE IF NOT EXISTS trades(
        id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, ticket INTEGER,
        symbol TEXT, action TEXT, volume REAL, entry REAL, sl REAL,
        tp REAL, profit REAL DEFAULT 0, status TEXT)""")
    conn.execute("""CREATE TABLE IF NOT EXISTS daily_limits(
        trade_date TEXT PRIMARY KEY, sl_hits INTEGER, locked INTEGER)""")
    conn.commit(); return conn

@asynccontextmanager
async def life(_app):
    if not mt5.initialize(): raise SystemExit(f"MT5 init failed: {mt5.last_error()}")
    yield
    mt5.shutdown()

app = FastAPI(title="Trading Flow Bridge v2", lifespan=life)

class Hook(BaseModel):
    ticker: str; action: str; stop_loss: float
    take_profit: float | None = None
    risk_usd: float = 375.0; secret: str

def todays_sl_hits() -> int:
    # ground truth = MT5 history deals, mirrored into SQLite
    deals = mt5.history_deals_get(
        datetime.combine(date.today(), time.min), datetime.now()) or []
    hits = sum(1 for d in deals if d.entry in
               (mt5.DEAL_ENTRY_OUT, mt5.DEAL_ENTRY_OUT_BY_TO) and d.profit < 0)
    c = db()
    c.execute("INSERT INTO daily_limits VALUES(?,?,?) "
              "ON CONFLICT(trade_date) DO UPDATE SET sl_hits=?, locked=?",
              (date.today().isoformat(), hits, int(hits >= MAX_SL),
               hits, int(hits >= MAX_SL)))
    c.commit(); c.close(); return hits

def pick_filling(info):                    # FIX: never hardcode IOC
    m = info.filling_mode
    if m & 1: return mt5.ORDER_FILLING_FOK
    if m & 2: return mt5.ORDER_FILLING_IOC
    return mt5.ORDER_FILLING_RETURN

def size_lots(symbol, entry, sl, risk):    # broker-native tick math
    info = mt5.symbol_info(symbol)
    if info is None: mt5.symbol_select(symbol, True); info = mt5.symbol_info(symbol)
    if info is None: return None
    dist = abs(entry - sl)
    if dist <= 0: return None
    risk_per_lot = (dist / info.trade_tick_size) * info.trade_tick_value
    if risk_per_lot <= 0: return None
    v = round((risk / risk_per_lot) / info.volume_step) * info.volume_step
    return max(info.volume_min, min(v, info.volume_max))

@app.get("/health")
def health():
    return {"status": "online", "mt5": mt5.terminal_info() is not None}

@app.post("/webhook")
async def webhook(p: Hook):
    if p.secret != SECRET: raise HTTPException(401, "bad secret")
    if mt5.terminal_info() is None: raise HTTPException(503, "MT5 offline")
    if todays_sl_hits() >= MAX_SL:
        return {"status": "blocked", "reason": "daily loss limit reached"}
    act  = p.action.strip().lower()
    tick = mt5.symbol_info_tick(p.ticker.upper())
    if tick is None: raise HTTPException(400, "no tick for symbol")
    info  = mt5.symbol_info(p.ticker.upper())
    entry = tick.ask if act == "buy" else tick.bid
    # FIX B3 guardrail: reject one-tick stops before they size a monster lot
    if abs(entry - p.stop_loss) < max(5 * info.trade_tick_size, 0.15):
        raise HTTPException(400, "stop too tight — guardrail")
    vol = size_lots(p.ticker.upper(), entry, p.stop_loss, p.risk_usd)
    if not vol: raise HTTPException(400, "lot sizing failed")
    dist = abs(entry - p.stop_loss)
    tp = p.take_profit or (entry + dist * 2 if act == "buy" else entry - dist * 2)
    if abs(tp - entry) / dist < 1.99:      # enforce minimum 1:2
        tp = entry + dist * 2 if act == "buy" else entry - dist * 2
    r = mt5.order_send(dict(
        action=mt5.TRADE_ACTION_DEAL, symbol=p.ticker.upper(), volume=vol,
        type=mt5.ORDER_TYPE_BUY if act == "buy" else mt5.ORDER_TYPE_SELL,
        price=entry, sl=p.stop_loss, tp=tp, deviation=15, magic=20250307,
        comment="Trading Flow trap", type_time=mt5.ORDER_TIME_GTC,
        type_filling=pick_filling(info)))
    if r is None or r.retcode != mt5.TRADE_RETCODE_DONE:
        return {"status": "failed",
                "detail": getattr(r, "comment", "mt5 null response")}
    c = db()
    c.execute("INSERT INTO trades(ts,ticket,symbol,action,volume,entry,sl,tp,status)"
              " VALUES(?,?,?,?,?,?,?,?,?)",
              (datetime.now().isoformat(), r.order, p.ticker.upper(), act,
               r.volume, r.price, p.stop_loss, tp, "ACTIVE"))
    c.commit(); c.close()
    return {"status": "success", "ticket": r.order, "volume": r.volume,
            "entry": r.price, "sl": p.stop_loss, "tp": tp}

# run: uvicorn webhook_receiver_v2:app --host 0.0.0.0 --port 8000`;

const DASHBOARD_PY = `# trading_dashboard.py — compact ops monitor · pip install streamlit pandas MetaTrader5
import sqlite3, pandas as pd, streamlit as st
from datetime import date
import MetaTrader5 as mt5

st.set_page_config(page_title="Trading Flow Monitor", page_icon="◆", layout="wide")
DB = "trading_system.db"

ok  = mt5.initialize()
acc = mt5.account_info() if ok else None

conn = sqlite3.connect(DB); conn.row_factory = sqlite3.Row
row    = conn.execute("SELECT * FROM daily_limits WHERE trade_date=?",
                      (date.today().isoformat(),)).fetchone()
trades = pd.read_sql_query("SELECT * FROM trades ORDER BY id DESC", conn)
conn.close()

hits = row["sl_hits"] if row else 0
if hits >= 2:
    st.error(f"DISCIPLINE LOCK — {hits}/2 daily stops hit. Halted until tomorrow.")
else:
    st.success(f"ENGINE ARMED — {hits}/2 daily stops used · scanning AOIs")

c1, c2, c3, c4 = st.columns(4)
closed = trades[trades.status != "ACTIVE"]
c1.metric("Balance", f"\${acc.balance:,.2f}" if acc else "offline")
c2.metric("Trades", len(trades))
c3.metric("Win rate",
          f"{(closed.profit > 0).mean() * 100:.0f}%" if len(closed) else "—")
c4.metric("Net P/L", f"\${trades.profit.sum():+,.2f}")

st.dataframe(trades, use_container_width=True)
if st.button("Refresh"): st.rerun()`;

function buildPayload(t: Trade, cfg: EngineConfig, secret: string) {
  return {
    secret,
    symbol: "XAUUSD",
    timeframe: "15",
    action: t.side === "LONG" ? "buy" : "sell",
    entry: +t.entry.toFixed(2),
    stop_loss: +t.sl.toFixed(2),
    take_profit: +t.tp.toFixed(2),
    qty_oz: +t.oz.toFixed(1),
    mt5_lots: +(t.oz / 100).toFixed(2),
    risk_usd: cfg.riskUSD,
    rr: cfg.rr,
    setup: t.setup,
    identity: t.identity,
    ts: new Date(t.entryTime).toISOString(),
  };
}

function phoneTicket(t: Trade, cfg: EngineConfig) {
  return [
    "TRADING FLOW SIGNAL",
    `XAUUSD · ${t.side === "LONG" ? "BUY" : "SELL"} (${t.side})`,
    `Entry  ${fmtP(t.entry)}`,
    `SL     ${fmtP(t.sl)}`,
    `TP     ${fmtP(t.tp)}`,
    `Size   ${(t.oz / 100).toFixed(2)} lot (${t.oz.toFixed(1)} oz)`,
    `Risk   $${cfg.riskUSD} · 1:${cfg.rr.toFixed(1)}`,
    `Setup  ${t.setup}`,
  ].join("\n");
}

function tgMessage(t: Trade, cfg: EngineConfig) {
  return [
    "<b>TRADING FLOW SIGNAL</b>",
    `<b>XAUUSD · ${t.side === "LONG" ? "BUY" : "SELL"}</b> (${t.side})`,
    `Entry  ${fmtP(t.entry)}`,
    `SL     ${fmtP(t.sl)}   TP  ${fmtP(t.tp)}`,
    `Size   ${(t.oz / 100).toFixed(2)} lot (${t.oz.toFixed(1)} oz)`,
    `Risk   $${cfg.riskUSD} · 1:${cfg.rr.toFixed(1)} · ${t.setup}`,
  ].join("\n");
}

function CopyBtn({ onCopy, copied, label }: { onCopy: () => void; copied: boolean; label: string }) {
  return (
    <button
      onClick={onCopy}
      className="seg-btn rounded-md border px-2.5 py-1 font-mono text-[9.5px] font-bold tracking-[0.14em]"
      style={{
        borderColor: copied ? "var(--long)" : "var(--line)",
        color: copied ? "var(--long)" : "var(--muted)",
        background: copied ? "rgba(47,201,143,0.1)" : "transparent",
      }}
    >
      {copied ? "COPIED ✓" : label}
    </button>
  );
}

export default function DeployBridge({ st, cfg, onCfg }: { st: EngineState; cfg: EngineConfig; onCfg: (p: Partial<EngineConfig>) => void }) {
  const [mode, setMode] = useState<Mode>("webhook");
  const [tab, setTab] = useState<CodeTab>("payload");
  const [copied, setCopied] = useState<string | null>(null);
  const [botToken, setBotToken] = useState("YOUR_BOT_TOKEN");
  const [chatId, setChatId] = useState("YOUR_CHAT_ID");

  const secret = `TF-${(st.seed % 0xffff).toString(16).toUpperCase().padStart(4, "0")}`;
  const last = st.trades.length ? st.trades[st.trades.length - 1] : null;
  const payloadJson = last ? JSON.stringify(buildPayload(last, cfg, secret), null, 2) : null;
  const ticket = last ? phoneTicket(last, cfg) : null;

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(key);
    window.setTimeout(() => setCopied(null), 1400);
  };

  const plans: { row: string; free: string; paid: string }[] = [
    { row: "WEBHOOK URL", free: "closed", paid: "open" },
    { row: "ACTIVE ALERTS", free: "1", paid: "20+" },
    { row: "ALERT ENGINE", free: "basic", paid: "server-side 24/7" },
    { row: "AUTO-EXECUTION", free: "no", paid: "yes · via VPS bridge" },
  ];

  const tabs: { k: CodeTab; label: string }[] = [
    { k: "payload", label: "PAYLOAD" },
    { k: "pine", label: "PINE v5 · FIXED" },
    { k: "receiver", label: "RECEIVER v2" },
    { k: "dash", label: "DASHBOARD" },
  ];

  const codeFor = (t: CodeTab) =>
    t === "pine" ? PINE_FIXED : t === "receiver" ? RECEIVER_V2 : t === "dash" ? DASHBOARD_PY : TV_TEMPLATE;

  const codeNote: Record<CodeTab, string> = {
    payload:
      "Order-fill placeholders — TradingView fills these with the REAL executed levels. Never {{plot_0}}: plot_0 is the PDH plot (blueprint bug B2).",
    pine:
      "Corrected strategy — fixes B1 (explicit qty), B3 (ATR buffer stop). Paste into Pine Editor, attach a webhook alert with “Order fills only”.",
    receiver:
      "Broker-native tick_value sizing (blueprint’s best idea), filling-mode detection, tight-stop guardrail, SQLite audit trail, 1:2 enforcement.",
    dash: "Compact Streamlit monitor — reads the same SQLite DB the receiver writes: discipline lock banner, KPIs, trade table.",
  };

  return (
    <div className="panel rise-in mt-0 p-4" style={{ borderTop: "2px solid var(--gold-deep)" }}>
      {/* header */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2.5">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden>
            <path d="M2 7.5h3.5M9.5 7.5H13M5.5 4.5l2 3-2 3M9.5 4.5l-2 3 2 3" stroke="var(--gold)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="panel-title" style={{ color: "var(--gold)" }}>Deployment Bridge · Signal → Execution</span>
        </div>

        <div className="flex overflow-hidden rounded-md border" style={{ borderColor: "var(--line)" }}>
          <button
            onClick={() => setMode("webhook")}
            className="seg-btn px-3 py-1.5 font-mono text-[10px] font-bold tracking-wider"
            style={{ background: mode === "webhook" ? "rgba(232,180,76,0.14)" : "var(--bg2)", color: mode === "webhook" ? "var(--gold-hi)" : "var(--muted)" }}
          >
            AUTO · WEBHOOK (ESSENTIAL+)
          </button>
          <button
            onClick={() => setMode("semiauto")}
            className="seg-btn border-l px-3 py-1.5 font-mono text-[10px] font-bold tracking-wider"
            style={{ borderColor: "var(--line)", background: mode === "semiauto" ? "rgba(110,155,216,0.14)" : "var(--bg2)", color: mode === "semiauto" ? "var(--info)" : "var(--muted)" }}
          >
            SEMI-AUTO · PHONE (FREE)
          </button>
        </div>

        {/* telegram formatter switch — semi-auto upgrade, off keeps the classic flow */}
        <button
          onClick={() => onCfg({ telegram: !cfg.telegram })}
          className="seg-btn flex items-center gap-2 rounded-md border px-2.5 py-1.5 font-mono text-[9.5px] font-bold tracking-[0.14em]"
          style={{
            borderColor: cfg.telegram ? "rgba(110,155,216,0.6)" : "var(--line)",
            color: cfg.telegram ? "var(--info)" : "var(--dim)",
            background: cfg.telegram ? "rgba(110,155,216,0.12)" : "var(--bg2)",
          }}
          title="Telegram signal formatter"
        >
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M14.5 1.8 1.9 6.6c-.7.3-.7 1.3.1 1.5l3.2 1 1.2 3.8c.2.7 1.1.8 1.5.2l1.7-2.2 3.3 2.4c.6.4 1.4.1 1.5-.6l1.4-9.4c.1-.8-.6-1.4-1.3-1.5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
          </svg>
          TG FORMATTER {cfg.telegram ? "ON" : "OFF"}
        </button>

        <span className="ml-auto font-mono text-[9.5px] tracking-[0.16em] text-[var(--dim)]">
          PAYLOADS EMITTED: <span className="font-bold" style={{ color: "var(--gold)" }}>{st.trades.length}</span>
          {last && <span className="ml-3">LAST SIGNAL: <span style={{ color: last.side === "LONG" ? "var(--long)" : "var(--short)" }}>{last.setup} · {last.side}</span></span>}
        </span>
      </div>

      <div className="grid grid-cols-12 gap-3">
        {/* ---- plan gate ---- */}
        <div className="col-span-12 lg:col-span-3">
          <div className="rounded-md border p-3" style={{ borderColor: "var(--line-soft)", background: "var(--bg1)" }}>
            <div className="mb-2 font-mono text-[9px] tracking-[0.22em] text-[var(--dim)]">PLAN GATE · FREE vs ESSENTIAL</div>
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-1.5 font-mono text-[9.5px]">
              <span />
              <span className="text-center tracking-[0.14em] text-[var(--dim)]">FREE</span>
              <span className="text-center tracking-[0.14em]" style={{ color: "var(--gold)" }}>PAID</span>
              {plans.map((p) => (
                <div key={p.row} className="contents">
                  <span className="tracking-wider text-[var(--muted)]">{p.row}</span>
                  <span className="text-center text-[var(--short)]">{p.free}</span>
                  <span className="text-center text-[var(--long)]">{p.paid}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 space-y-1.5">
              <div className="rounded border px-2.5 py-1.5 font-body text-[10px] leading-snug text-[var(--muted)]" style={{ borderColor: "var(--line-soft)" }}>
                <span className="font-mono font-bold" style={{ color: "var(--info)" }}>30-DAY TRIAL</span> — full auto-execution loop test kora jay demo account-e, zero cost-e.
              </div>
              <div className="rounded border px-2.5 py-1.5 font-body text-[10px] leading-snug text-[var(--muted)]" style={{ borderColor: "var(--line-soft)" }}>
                <span className="font-mono font-bold" style={{ color: "var(--gold)" }}>VPS ≈ $5/mo</span> — bridge 24/7 online thake; execution speed ar discipline dui-tai bojay thake.
              </div>
            </div>
          </div>
        </div>

        {/* ---- live payload / phone ticket ---- */}
        <div className="col-span-12 lg:col-span-4">
          <div className="flex h-full flex-col rounded-md border p-3" style={{ borderColor: "var(--line-soft)", background: "var(--bg1)" }}>
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-[9px] tracking-[0.22em] text-[var(--dim)]">
                {mode === "webhook" ? "LIVE WEBHOOK PAYLOAD · FROM ENGINE" : "LIVE PHONE TICKET · FROM ENGINE"}
              </span>
              {mode === "webhook" && last && payloadJson && <CopyBtn copied={copied === "payload"} onCopy={() => copy("payload", payloadJson)} label="COPY JSON" />}
              {mode === "semiauto" && last && ticket && <CopyBtn copied={copied === "ticket"} onCopy={() => copy("ticket", ticket)} label="COPY TICKET" />}
            </div>
            {last ? (
              <pre
                key={`${last.id}-${mode}`}
                className="feed-in min-h-0 flex-1 overflow-auto rounded border p-3 font-mono text-[10.5px] leading-relaxed"
                style={{ borderColor: "var(--line-soft)", background: "var(--bg0)", color: mode === "webhook" ? "var(--gold-hi)" : "var(--ink)" }}
              >
                {mode === "webhook" ? payloadJson : ticket}
              </pre>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded border border-dashed py-8" style={{ borderColor: "var(--line)" }}>
                <span className="h-2 w-2 rounded-full bg-[var(--gold)] blink-soft" />
                <span className="font-mono text-[10px] tracking-[0.2em] text-[var(--muted)]">AWAITING FIRST SIGNAL</span>
                <span className="font-body text-[10px] italic text-[var(--dim)]">Engine jokhon trap fire korbe, exact broker-ready payload ekhane live render hobe.</span>
              </div>
            )}
          </div>
        </div>

        {/* ---- code stack / semi-auto flow ---- */}
        <div className="col-span-12 lg:col-span-5">
          {mode === "webhook" ? (
            <div className="flex h-full flex-col rounded-md border p-3" style={{ borderColor: "var(--line-soft)", background: "var(--bg1)" }}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex overflow-hidden rounded border" style={{ borderColor: "var(--line)" }}>
                  {tabs.map((t, i) => (
                    <button
                      key={t.k}
                      onClick={() => setTab(t.k)}
                      className={`seg-btn px-2.5 py-1 font-mono text-[9px] font-bold tracking-[0.12em] ${i > 0 ? "border-l" : ""}`}
                      style={{
                        borderColor: "var(--line)",
                        background: tab === t.k ? "rgba(232,180,76,0.14)" : "var(--bg2)",
                        color: tab === t.k ? "var(--gold-hi)" : "var(--muted)",
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <CopyBtn copied={copied === tab} onCopy={() => copy(tab, tab === "payload" ? TV_TEMPLATE : codeFor(tab))} label="COPY CODE" />
              </div>
              <pre
                key={tab}
                className="feed-in min-h-0 flex-1 overflow-auto rounded border p-3 font-mono text-[9.5px] leading-relaxed"
                style={{ borderColor: "var(--line-soft)", background: "var(--bg0)", color: tab === "payload" ? "var(--gold-hi)" : "var(--muted)", maxHeight: 300 }}
              >
                {codeFor(tab)}
              </pre>
              <div className="mt-2 border-t pt-2 font-body text-[10px] italic leading-snug text-[var(--muted)]" style={{ borderColor: "var(--line-soft)" }}>
                <span className="mr-1.5 font-mono not-italic text-[8.5px] tracking-[0.18em] text-[var(--gold)]">NOTE</span>
                {codeNote[tab]}
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col gap-3">
              {cfg.telegram && last && (
                <div className="feed-in rounded-md border p-3" style={{ borderColor: "rgba(110,155,216,0.5)", background: "var(--bg1)" }}>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-mono text-[9px] tracking-[0.22em]" style={{ color: "var(--info)" }}>TELEGRAM SIGNAL · LIVE</span>
                    <div className="flex gap-1.5">
                      <CopyBtn copied={copied === "tgmsg"} onCopy={() => copy("tgmsg", tgMessage(last, cfg))} label="COPY MSG" />
                      <CopyBtn
                        copied={copied === "tgurl"}
                        onCopy={() =>
                          copy(
                            "tgurl",
                            `https://api.telegram.org/bot${botToken}/sendMessage?chat_id=${chatId}&parse_mode=HTML&text=${encodeURIComponent(tgMessage(last, cfg))}`
                          )
                        }
                        label="COPY SEND URL"
                      />
                    </div>
                  </div>
                  <div className="mb-2 grid grid-cols-2 gap-2">
                    <input
                      value={botToken}
                      onChange={(e) => setBotToken(e.target.value)}
                      placeholder="BOT TOKEN (from @BotFather)"
                      className="w-full rounded border px-2 py-1 font-mono text-[9.5px] outline-none focus:border-[var(--info)]"
                      style={{ borderColor: "var(--line)", background: "var(--bg2)", color: "var(--ink)" }}
                    />
                    <input
                      value={chatId}
                      onChange={(e) => setChatId(e.target.value)}
                      placeholder="CHAT ID"
                      className="w-full rounded border px-2 py-1 font-mono text-[9.5px] outline-none focus:border-[var(--info)]"
                      style={{ borderColor: "var(--line)", background: "var(--bg2)", color: "var(--ink)" }}
                    />
                  </div>
                  <pre
                    key={`tg-${last.id}`}
                    className="feed-in overflow-x-auto rounded border p-2.5 font-mono text-[10px] leading-relaxed text-[var(--ink)]"
                    style={{ borderColor: "var(--line-soft)", background: "var(--bg0)" }}
                  >
                    {tgMessage(last, cfg)}
                  </pre>
                </div>
              )}
              <div className="flex min-h-0 flex-1 flex-col rounded-md border p-3" style={{ borderColor: "var(--line-soft)", background: "var(--bg1)" }}>
              <div className="mb-2 font-mono text-[9px] tracking-[0.22em] text-[var(--dim)]">SEMI-AUTO FLOW · ZERO BUDGET</div>
              <div className="space-y-2">
                {[
                  { k: "1", t: "Free plan-e TV alert setup korun — message field-e uporer ticket template paste korun.", c: "var(--info)" },
                  { k: "2", t: "Signal fire korlei phone-e instant push notification (ringtone soho) ashbe.", c: "var(--gold)" },
                  { k: "3", t: "MT5 / Exness app khule ticket-er entry, SL, TP ar lot size manual place korun.", c: "var(--long)" },
                  { k: "4", t: "Latency ~30–90s — trap setup-e AOI zone breathing room dey, tai acceptable.", c: "var(--muted)" },
                ].map((s) => (
                  <div key={s.k} className="group flex gap-2.5 rounded-md border px-2.5 py-2 transition-all duration-200 hover:translate-x-[2px]" style={{ borderColor: "var(--line-soft)", background: "var(--bg2)" }}>
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-bold" style={{ color: s.c, border: `1px solid ${s.c}66` }}>
                      {s.k}
                    </span>
                    <span className="font-body text-[10.5px] leading-snug text-[var(--muted)]">{s.t}</span>
                  </div>
                ))}
              </div>
              <div className="mt-auto pt-2 font-body text-[10px] italic leading-snug text-[var(--dim)]">
                Absolute automation speed paben na — kintu sizing, SL/TP ar discipline engine-i calculate korche. Apnar kaj shudhu 4-ta number type kora.
              </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
