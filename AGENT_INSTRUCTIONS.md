# Agent instructions — Safe Scalper Control

## Product boundary

This repository is a single-strategy SafeScalperPro implementation. Do not reintroduce legacy strategies, discretionary entries, grid, martingale, hedging, averaging or multi-strategy confluence.

The runtime source of truth is `strategy_config.json`. The seven entry gates must all pass on the same completed candle. Live prices and contract metadata must come from the connected MT5 broker, never a proxy symbol.

## Safety invariants

1. Default risk is 0.5% equity and must remain bounded to 0.1–1.0% in the UI.
2. Never round volume upward to the broker minimum. Reject a trade when minimum volume exceeds the approved risk.
3. Use native MT5 profit and margin calculations before order submission; calculation failure blocks execution.
4. Enforce volume min/max/step, stops level, freeze level plus safety buffer, daily trade cap, daily loss limit and peak-equity drawdown pause.
5. Live mode fails closed when the native calendar guard is missing, stale or reports a high-impact USD event.
6. One open position and one pending signal maximum.
7. Partial close must be skipped when either resulting volume is below broker minimum.

## Security

- No hardcoded credentials. Load `TF_WEBHOOK_SECRET` from the environment.
- Do not persist broker/Telegram credentials in the browser. Keep them in memory only; fixed-XOR obfuscation is not encryption.
- Validate external payloads with bounded Pydantic models.
- Keep order idempotency and atomic SQLite daily-limit checks.
- Keep public endpoints rate-limited and require bearer authentication for account, symbol, bar and news data.
- Real-account and mock execution remain blocked. Demo submission requires explicit host opt-in; never enable it as part of tests.
- Broker positions/deals are authoritative. Advanced paper exits must never masquerade as broker management.
- Demo advanced exits run only in the host-owned lifecycle worker, against receipt-verified positions. Preserve stable identifiers, monotonic stops, initial-volume partial accounting and entry-time policy. Never retry UNKNOWN/SENDING management actions.
- Operator recovery is ledger-only and must require exact account confirmation, a reason and conclusive broker evidence. Preserve the peak and daily latch when reviewing recovered drawdown.

## Verification

```bash
npm run typecheck
npm run build
npm test
npm run test:bridge
python3 -m py_compile fastapi_mt5_bridge.py broker_lifecycle.py gold_strategy_core.py advanced_backtest_engine.py run_backtest.py
python3 run_backtest.py
```
