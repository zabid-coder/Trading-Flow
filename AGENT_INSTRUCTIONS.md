# 🤖 Agent Developer Instructions: Gold Trading System Operations & MT5 Bridge

## 📌 Mission
This repository houses **Trading Flow PRO v4.0**, an institutional-grade algorithmic execution platform for **XAUUSD Gold**. All autonomous AI agents and engineers operating in this codebase must strictly observe the following development rules and operational protocols.

---

## 🛠️ Architecture & Technology Stack

- **Frontend**: React 19, TypeScript 5.8, TailwindCSS v4, Vite 6.
- **Backend Bridge**: Python 3.10+ with FastAPI, Uvicorn, SQLite WAL, Pydantic v2, and MetaTrader 5 (with graceful macOS simulation mock fallback).
- **Quantitative Engine**: `gold_strategy_core.py`, `advanced_backtest_engine.py`, `run_backtest.py`.
- **Config**: Centralized in `strategy_config.json`.

---

## 🔒 Security Standards (Strict Non-Negotiables)

1. **Zero Hardcoded Secrets**: Never commit plaintext API keys or webhook secrets. Always use `os.getenv("TF_WEBHOOK_SECRET")` or generate random tokens via `secrets.token_urlsafe(32)`.
2. **Local Storage Encryption**: All sensitive broker credentials in browser storage must pass through `encryptVaultData()` and `decryptVaultData()` in `src/utils/crypto.ts`.
3. **Pydantic Validation**: All FastAPI endpoints accepting external payload must use Pydantic models with bounds checking (`gt=0.0`, `le=1000.0`).
4. **Atomic SQLite Transactions**: All operations modifying account limits or trade counts must use `conn.execute("BEGIN IMMEDIATE")` to prevent TOCTOU race conditions.
5. **Rate Limiting**: Public endpoints must be guarded by sliding-window rate limiters.

---

## 📈 Strategic Logic Rules for Gold (XAUUSD)

1. **Multi-Timeframe Regime Gate**:
   - Longs are ONLY allowed when `4H_EMA20 > 4H_EMA50`.
   - Shorts are ONLY allowed when `4H_EMA20 < 4H_EMA50`.
2. **Minimum Risk-Reward**: No setup can be triggered with a mathematical Risk-to-Reward ratio lower than **1:2.5**.
3. **Volatility-Adaptive Risk**:
   - Standard: 2.0% equity risk.
   - High Volatility (`ATR > 1.5x` Avg ATR): Scaled down to `0.7x` (1.4% risk).
   - Low Volatility (`ATR < 0.7x` Avg ATR): Scaled up to `1.3x` (2.6% risk).
4. **Trade Management Automation**:
   - Auto-Breakeven: Triggered at `+1.0R`.
   - Partial Take-Profit: 50% position scale-out at `+1.5R`.
   - Time Stop: Liquidate positions with no structural momentum after 4 hours (16 M15 bars).

---

## 🚀 Server Run Commands

```bash
# 1. Start Frontend Dev Server
npm run dev -- --port 3000

# 2. Start FastAPI MT5 Bridge Server
python3 -m uvicorn fastapi_mt5_bridge:app --host 0.0.0.0 --port 8000 --reload

# 3. Run Quantitative Backtest & 14-Fold Rolling WFO
python3 run_backtest.py
```
