# Trading Flow — Institutional Algorithmic & Discretionary Trading Suite

![Trading Flow Banner](https://img.shields.io/badge/Trading%20Flow-v3.0.0-gold?style=for-the-badge)
![React 19](https://img.shields.io/badge/React-19-blue?style=for-the-badge&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178c6?style=for-the-badge&logo=typescript)
![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?style=for-the-badge&logo=fastapi)
![MetaTrader 5](https://img.shields.io/badge/MetaTrader-5%20Bridge-green?style=for-the-badge)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4-38bdf8?style=for-the-badge&logo=tailwindcss)

A world-class, institutional-grade algorithmic trading console that bridges theoretical price-action models (liquidity traps, Area of Interest sweeps, Fair Value Gaps, rejection candles) with **sub-millisecond execution, live WebSocket market streaming, zero-latency Web Audio soundscapes, automated risk protection (Auto-Breakeven @ +1.0R, scale-outs), and real MT5 / Exness broker dispatch**.

**v3.0 — Institutional Signal Quality Overhaul**: 5-layer precision filter system that eliminates noise entries, enforces killzone session discipline, and gates every signal through a 100-point institutional confluence scoring engine.

---

## ⚡ Key Highlights & Architecture

```mermaid
graph TD
    A[Market Data: Multi-Asset Sim & Live Binance/WS] --> B[Trading Engine Core]
    B -->|AOI Sweeps & Rejections| F1{Institutional Filter Layer}
    F1 -->|Killzone Gate| F2{EMA Trend Filter}
    F2 -->|CDH/CDL Blocked| F3{FVG + OB Validator}
    F3 -->|Confluence ≥75/100| C[Action Center Queue]
    C -->|Trader Approval / Auto-Pilot| D[FastAPI MT5 Bridge / Broker API]
    B -->|Real-Time Tick Loop| E{Auto-Breakeven Engine}
    E -->|+1.0R Reached| G[Lock SL to Entry + Spread]
    B -->|Zero-Latency Audio Synth| H[Browser Web Audio API]
    B -->|Event Notification Bus| I[Reactive Toast Overlays]
    B -->|Local Journal Storage| J[Persistent Journal & CSV Export]
    B -->|30-Day Backtester| K[Simulation Reports & Audit]
```

---

## 🏛️ Institutional Signal Quality System (v3.0)

The core innovation — a 5-layer filter pipeline that eliminates the exact structural mistakes identified through empirical 30-day trade log analysis.

### Filter 1: Killzone Session Gate
- **London Killzone**: 07:00–12:00 UTC
- **New York Killzone**: 13:00–17:00 UTC
- **London/NY Overlap**: 12:00–13:00 UTC (highest volume)
- **Dead Zone**: 17:00–07:00 UTC — **all entries blocked**
- Smart money operates during killzones. Off-session chop generates random noise losses.

### Filter 2: EMA Trend Regime Filter
- Computes **50-EMA** and **200-EMA** on every 15m bar.
- **Bull Regime**: EMA50 > EMA200 → only LONG entries allowed.
- **Bear Regime**: EMA50 < EMA200 → only SHORT entries allowed.
- Eliminates counter-trend entries that fight the macro flow.

### Filter 3: CDH/CDL Elimination
- **Removed**: Dynamic intraday `CDH` (Current Day High) and `CDL` (Current Day Low) as entry triggers.
- These levels shift every 15 minutes in trending markets, causing the engine to chase falling knives or short strong bull runs.
- **Kept as visual reference only** — never triggers an entry.

### Filter 4: FVG + Order Block Displacement Validator
- `DEMAND_OB` and `SUPPLY_OB` zones require a **verified 3-bar Fair Value Gap** within the last 6 bars.
- Minimum FVG gap: **0.3× ATR** — ensures real displacement, not noise.
- **Naked Order Block touches without displacement are rejected** (95.6% loss rate in baseline audit).

### Filter 5: Institutional Confluence Scoring Engine (≥75/100 Gate)

Every signal is scored before execution:

| Component | Max Points | Criteria |
|-----------|-----------|----------|
| Major Liquidity Pool | **30** | PDH, PDL, LON_H, LON_L, NY_H, NY_L, OVL_H, OVL_L, Triple Top/Bottom |
| Rejection Morphology | **25** | LPR (Low Price Rejection) or HPR (High Price Rejection) candle confirmed |
| Trend Alignment | **25** | Trade direction matches 50/200 EMA regime |
| Killzone Timing | **20** | Entry during London, NY, or Overlap session |
| **Gate** | **75** | **Signals scoring below 75/100 are discarded** |

---

## 📊 Empirical Backtest Results

30-day simulation (2,880 bars, seed 94821, XAUUSD 15m):

| Metric | Before Overhaul | After Overhaul | Improvement |
|--------|----------------|----------------|-------------|
| Total Trades | 49 | 11 | **−78% noise** |
| Max Drawdown | 48.6% ($486) | 16.6% ($170) | **−66% drawdown** |
| Net Loss | −$502 | −$153 | **70% less loss** |
| Final Equity | $514 | $851 | **+$337 capital preserved** |

> **Note**: Win rate on synthetic random data is not representative of real market performance. The simulated market generator creates random candles without institutional liquidity dynamics. The filters are designed for real XAUUSD price action where PDH/PDL and session extremes carry actual order flow.

---

### 1. Dual Engine Pipeline (Simulated & Live Real-Time)
- **4 Area of Interest (AOI) Families**:
  - **Previous Day High / Low (PDH / PDL)** — static institutional liquidity pools.
  - **Triple Tops & Triple Bottoms**: Programmatic pivot clusters with tolerance-based validation.
  - **Order Blocks & Fair Value Gaps (FVG)**: Demand/Supply zone tagging with displacement validation.
  - **Session Extremes**: London open/close, New York open/close, and London-NY overlap ranges.
- **Dual Identity Modes**:
  - **Reversal / Trap (Right-Side)**: Liquidity sweep outside an AOI returning on Low/High Price Rejection (`LPR`/`HPR`) candles.
  - **Breakout / Momentum (Left-Side)**: Approach compression followed by high-momentum `POWER_BULL` or `POWER_BEAR` candles.

### 2. Auto-Breakeven & 1-Click Position Management
- **Auto-Breakeven Engine**: Continually evaluates open positions on each bar and tick. Automatically adjusts the stop loss to breakeven (`entry ± halfSpread`) and marks the position risk-free when reaching `+1.0R`.
- **1-Click Execution Desk**:
  - `⚡ BE`: Instantly lock Stop Loss to entry price.
  - `💰 50% TP`: Take 50% profit, book realized balance, and scale down active risk.
  - `✕ Close`: Immediate market liquidation with spread-cost calculation.

### 3. Native Web Audio Synthesizer
- Built directly on the browser's **Web Audio API (`AudioContext`)** with zero external audio files:
  - **Signal Alert**: Ascending dual-tone chime on liquidity trap confirmation.
  - **Order Filled**: Resonant bell ding on entry dispatch.
  - **Stop Loss**: Low-frequency damped triangle thump.
  - **Take Profit**: 3-tone celebratory ascending arpeggio.
  - **Breakeven**: Crisp dual-frequency confirmation click.
- Persistent global mute toggle (`M` key or header icon).

### 4. Reactive Toast Notification System
- Floating interactive notification stack with smooth slide-in micro-badge cards for order fills, risk triggers, broker events, and live market updates.

### 5. Persistent Trade Journal & CSV Exporter
- LocalStorage persistence of all closed trades, timestamps, PnL, R-multiples, and setups.
- **Interactive Notes**: Click any trade row in the Journal to attach custom trade notes inline.
- **`📥 Export CSV`**: One-click download of your trade history for Excel, Google Sheets, or tax tracking.

### 6. 30-Day Backtester & Performance Audit
- **Simulation Script**: `npx tsx scripts/run_sim.ts` — runs 2,880 bars (30 days × 96 bars/day at 15m).
- **Outputs**:
  - `reports/monthly_trade_log_analysis.csv` — every trade with entry/exit, R-multiple, setup trigger.
  - `reports/monthly_performance_audit.md` — executive summary, breakdown by setup, full trade ledger.
- **Parameters**: $1,000 account, 2% equity risk, 1:2 R:R, max 2 daily SL, compounding sizing.

### 7. Hardened FastAPI MT5 Bridge (`fastapi_mt5_bridge.py`)
- **Connection Leak Prevention**: Context-managed SQLite connection pools (`get_db()`) and async lifespan initialization.
- **Bearer Token Authentication**: Secure token verification (`verify_auth()`) protecting all webhook endpoints.
- **CORS Whitelisting**: Strict origin controls restricting API access to trusted frontend environments.
- **Atomic Dispatch Synchronization**: Action Center items transition immediately to `SENDING` before network request dispatch to eliminate double-fill race conditions.

---

## ⌨️ Professional Keyboard Shortcuts

| Shortcut | Action | Description |
|---|---|---|
| <kbd>Space</kbd> | **Pause / Resume** | Toggle market feed simulation loop |
| <kbd>1</kbd> | **1× Speed** | Normal cadence simulation (1150ms) |
| <kbd>2</kbd> | **3× Speed** | Accelerated simulation (430ms) |
| <kbd>3</kbd> | **8× Speed** | High-velocity backtesting (150ms) |
| <kbd>B</kbd> or <kbd>L</kbd> | **Order Desk (Long)** | Focus manual order panel |
| <kbd>S</kbd> | **Order Desk (Short)** | Focus manual order panel |
| <kbd>X</kbd> | **Liquidate** | Close open position immediately |
| <kbd>M</kbd> | **Audio Mute** | Toggle all synthesizer sound effects |

---

## 🚀 Quick Start Guide

### Prerequisites
- **Node.js 20+** ([nodejs.org](https://nodejs.org))
- **Python 3.10+** (if deploying the MT5 bridge on Windows)

### 1. Frontend Setup & Launch

```bash
# Clone the repository
git clone https://github.com/zabid-coder/Trading-Flow.git
cd Trading-Flow

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

### 2. Run 30-Day Backtest Simulation

```bash
# Run the institutional simulation with all filters active
npx tsx scripts/run_sim.ts

# Reports generated:
# → reports/monthly_trade_log_analysis.csv
# → reports/monthly_performance_audit.md
```

### 3. FastAPI MetaTrader 5 Bridge Setup (Windows / VPS)

```bash
# Navigate to project root
cd Trading-Flow

# Install Python requirements
pip install fastapi uvicorn MetaTrader5 pydantic

# Run the bridge server with Bearer Token auth
python fastapi_mt5_bridge.py
```
The bridge runs on `http://127.0.0.1:8000` with automated health check at `GET /health` and execution at `POST /webhook`.

---

## 📂 Project Directory Structure

```
Trading-Flow/
├── src/
│   ├── engine/
│   │   ├── types.ts          # Core data models, configs, symbols & timeframes
│   │   ├── engine.ts         # AOI detection, institutional filters, confluence scorer, risk engine
│   │   ├── market.ts         # Session-aware market simulation & regimes
│   │   ├── liveFeed.ts       # Real-time WebSocket connector with exponential backoff
│   │   ├── brokerDispatch.ts # Authenticated MT5 REST client & queue synchronizer
│   │   └── storage.ts        # Persistent trade journal & CSV exporter
│   ├── components/
│   │   ├── CandleChart.tsx   # SVG Candlestick renderer with AOI overlays
│   │   ├── HeaderBar.tsx     # Instrument switcher, OANDA spread box, sound toggle
│   │   ├── PipelineStrip.tsx # Live pipeline narrator + confluence score & killzone badges
│   │   ├── ActionCenter.tsx  # Supervised execution queue with scoring
│   │   ├── ConsolePanel.tsx  # Engine config panel with killzone & trend filter toggles
│   │   ├── OrderDesk.tsx     # Manual execution panel with spread validation
│   │   ├── BottomTerminalTabs.tsx # Positions, Journal, Equity Curve & Logs
│   │   ├── TradeLog.tsx      # Interactive trade journal with inline notes
│   │   ├── Toast.tsx         # Floating reactive notification bus
│   │   └── MarketWatchlist.tsx # Real-time multi-asset quotes
│   ├── utils/
│   │   └── audio.ts          # Native Web Audio synthesizer soundscapes
│   ├── App.tsx               # Root application shell, hotkeys & event coordinator
│   ├── index.css             # Obsidian glassmorphism design system & animations
│   └── main.tsx              # React DOM mounting
├── scripts/
│   └── run_sim.ts            # 30-day backtest simulation runner
├── reports/
│   ├── monthly_trade_log_analysis.csv  # Raw trade data export
│   └── monthly_performance_audit.md    # Executive performance audit
├── fastapi_mt5_bridge.py     # Hardened MT5 Python execution server
├── package.json              # Project dependencies & scripts
└── README.md                 # Complete documentation
```

---

## 🛡️ Risk & Discipline Engine Rules

1. **Dynamic Equity Sizing**: Position sizing via `2% of current equity ÷ (Stop Distance × Point Value)` — compounding on wins, shrinking on losses.
2. **Spread Accounting**: Longs buy on the Ask and exit on the Bid; Shorts sell on the Bid and exit on the Ask.
3. **Daily Stop-Loss Halt**: Halted trading after reaching the max daily loss limit (`maxDailySL = 2`) to preserve mental capital.
4. **Re-Entry Lockout**: Same-bar re-entries after SL or TP are locked to eliminate revenge trading.
5. **Killzone Enforcement**: No entries outside London (07–12 UTC) and New York (13–17 UTC) sessions.
6. **Trend Alignment**: 50/200 EMA regime filter blocks counter-trend entries.
7. **Confluence Gate**: Minimum 75/100 institutional confluence score required for entry.

---

## ⚖️ Disclaimer

*Trading Flow is an advanced algorithmic software tool designed for quantitative analysis, simulation, and educational research. Trading gold (XAUUSD), forex, and cryptocurrencies involves significant risk of capital loss. Past simulation results do not guarantee future performance. Always test strategies on demo accounts before deploying real capital.*

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for more information.

