# SafeScalper research audit — NOT LIVE VALIDATED

Source: **SYNTHETIC smoke test — no broker market-data evidence**. 105,120 completed M5 bars.
Period: 2025-01-01T00:00:00+00:00 → 2025-12-31T23:55:00+00:00.
Config SHA-256: da029aaec04c965b724a67ebf0550eff91bd7b934562452b94dc3c1fbea20cbd

| Evaluation | Trades | Profit factor | Net P/L (USD model) | Mark-to-market DD |
|---|---:|---:|---:|---:|
| Earlier 70% (fixed settings) | 24 | 0.09 | -25.36 | 5.07% |
| Later 30% (fixed settings) | 28 | 0.03 | -25.53 | 5.11% |
| Full dataset | 24 | 0.09 | -25.36 | 5.07% |

## Validation boundary

- This is a bar-based software/research test, not broker real-tick validation.
- Synthetic results do not measure a real trading edge. Imported OHLCV also lacks intra-bar tick order.
- SL is checked before TP on ambiguous bars; stop gaps use the adverse opening price.
- Spread, fixed slippage and round-trip commission are modeled; missing historical news is NOT reconstructed.
- Server/news/calendar behavior, broker fills and exact MetaEditor indicator seeding need Windows MT5 verification.
- Real-account execution remains blocked regardless of these metrics.

## Fixed-parameter rolling windows

15 non-overlapping windows; no parameter search or optimization.
Sufficient sample (at least 5 windows, 30 trades each): **False**.
Win-rate standard deviation: **4.171824008219373**.
Diagnostic thresholds passed: **False**. This is never permission for live trading.

## Small-account caution

Minimum lot, commission and spread can consume a large part of a small risk budget.
Native MT5 account-currency profit/margin calculations remain mandatory before demo submission.
No profitability or account-growth claim is made by this report.
