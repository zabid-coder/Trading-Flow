# Safe Scalper Control

A single-strategy XAUUSD M5 research, paper-trading and MT5 monitoring app. It is an adaptation of the public [ASQ Safe Scalping v1.20 CodeBase](https://www.mql5.com/en/code/71189), not a verified clone of the current [SafeScalperPro Market release](https://www.mql5.com/en/market/product/165581). The bundled publisher source/presets are preserved unchanged.

**Real-account execution is blocked.** There is no live-enable switch. Broker demo entries and host-managed exits require explicit host opt-in. The native lifecycle is implemented and fake-broker tested, not yet terminal-certified. Build/test success is not evidence of profitability.

## What works

- Seven completed-candle gates: EMA direction, ATR separation, price position, buffered breakout, RSI zone, momentum, completed-H1 agreement.
- The bundled breakout formula is used: long close > previous N-bar high − ATR buffer and previous close ≤ that high; symmetric low + buffer for shorts.
- Frontend and server use the same JSON defaults and a bounded 900-M5-bar indicator window. A cross-runtime test verifies EMA/ATR/RSI/H1 values on an identical fixture. Historical research uses continuous indicator history; exact MetaEditor seeding remains unverified.
- Timestamp-based candle deduplication and 3-bar signal expiry; forming candles never replace completed history.
- Default 0.5% equity risk, 1.5% daily loss, 5% peak drawdown, two trades/day, 25% margin cap. Minimum volume is never rounded upward.
- Broker-native account-currency loss/margin calculations, commission reserve, configured deviation reserve, volume/tick-size/stop constraints, free margin and OrderCheck retcode validation.
- Missing/stale/invalid news heartbeat, unavailable account history and stale quote block demo orders on the server.
- SQLite account-keyed daily/drawdown latches survive refresh/restart. One account position/order at a time, including other EAs/manual orders.
- Durable signal reservation before order_send, payload fingerprint and cached full receipt. Exactly one send attempt. Timeout/partial/placed/ambiguous outcomes remain quarantined; no blind retry.
- Broker positions, today's account-wide deals, balance/equity and risk state come from MT5 snapshots. Browser candles never invent broker fills, exits or P/L.
- A host worker manages verified app-owned demo positions: monotonic breakeven/trailing SL updates, preserved TP and one-shot partial closes. Minimum/step-invalid partials are skipped. Ambiguous management results are durably quarantined.
- System tab shows worker readiness, tracked positions, management history and authenticated operator recovery. Review requires exact account confirmation and a reason; conclusive broker evidence is required before clearing an unknown result.
- Separate persistent paper journal, paper session/risk latch and bounded saved preferences. Old journal keys are retained but excluded from new statistics.
- Session-only credentials. No new bearer/Telegram tokens are persisted; saving broker settings clears the old fixed-XOR token fields. Fixed-XOR obfuscation was not encryption.
- No generic execution webhooks or full-auto broker option. Telegram is notification-only, after a confirmed demo receipt.

Paper breakeven/trailing/partial exits are simulated with conservative stop-first bars. Demo advanced exits run every second on the bridge host using live broker quotes, stable position identifiers and the immutable entry-time JSON policy. Browser risk/exit edits do not alter an existing broker position's policy. Only exact receipt/order/comment/magic ownership is adopted; manual trades and other EAs are not managed.

The host and terminal must stay running for advanced exits. Browser pause, closing the tab or switching to paper mode **does not stop the host worker**. A stopped/unhealthy worker blocks new entries; existing broker-held SL/TP remain in place but advanced management pauses. Do not run with `--reload` or multiple independent bridge installations. A dedicated demo account is required; external account/position changes cannot be atomically locked by this service.

Breakeven is a price-based rule, not a guarantee of net break-even after commission, gaps or slippage. The default very small two-digit-gold distances need actual broker/tick validation.

## Local app

Install Node dependencies and Python dependencies (Python is also used by the parity test):

~~~bash
npm ci
python3 -m pip install -r requirements.txt
npm run dev
~~~

Default URL: http://127.0.0.1:3000. The development server binds loopback only.
The initial mode is paper simulation. Switching to MT5 does not enable execution.

## Windows MT5 bridge — monitoring first

Run beside the logged-in MetaTrader 5 terminal. In PowerShell:

~~~powershell
python -m pip install -r requirements.txt
$env:TF_WEBHOOK_SECRET = "<your-long-random-token>"
python -m uvicorn fastapi_mt5_bridge:app --host 127.0.0.1 --port 8000
~~~

Copy the token into **Broker settings** (re-enter after reload), test the bridge, then connect MT5. Never post the token in chat or commit it. If the app runs on a different computer, localhost is not the Windows host: configure an authenticated HTTPS endpoint/tunnel and an exact trusted CORS origin. Do not publicly expose an unauthenticated bridge.

On macOS/Linux without the MetaTrader5 package, the bridge reports **MOCK** and only serves synthetic inspection data. It cannot place orders.

Compile/attach only the companion [TradingFlow_NewsGuard.mq5](mql5/SafeScalperPro/TradingFlow_NewsGuard.mq5) for the bridge's native calendar heartbeat. Use at least 30 minutes before / 15 after high-impact USD news. A failed metadata lookup, disconnected terminal, stopped EA or heartbeat older than 180 seconds blocks execution. The companion has not been compiled here.

Demo execution is deliberately off by default. For a dedicated broker demo account only, after reviewing the limitations, the operator may set TF_ENABLE_DEMO_ORDERS=1 and restart the bridge. The frontend remains supervised. This setting still cannot enable real-account orders. No demo order was sent while developing/testing this code.

Do not run the publisher EA and this bridge as two execution owners on the same account. The bundled EA is separate, unmodified research material and does not inherit the bridge's safeguards.

## Endpoints

All endpoints require Bearer auth and are rate limited.

| Route | Purpose |
|---|---|
| GET /health | Source, authentication and execution lock |
| GET /symbol-spec/{symbol} | Native contract/profit/margin probes and account identity |
| GET /bars/{symbol} | Completed broker bars only (position 1 onward) |
| GET /news-status | Fail-closed native calendar status |
| GET /account-state | Broker positions/deals and persistent risk snapshot |
| GET /lifecycle | Exit-worker heartbeat, tracked positions, unresolved requests/actions and review audit |
| POST /operator/reconcile | Evidence-based ledger review; never calls order_send |
| POST /webhook | Host-enabled, supervised demo submission only |

Use one bridge installation/database per trading account. SQLite serializes workers sharing the database; separate installations with separate databases cannot share reservations. Broker/manual activity outside this service cannot be atomically locked by SQLite.

An UNKNOWN/SENDING reservation intentionally has no auto-expiry. Open **Broker System → Host exits & operator recovery**, inspect the matching terminal order/deals and select its review button. Entry and partial-close reviews require the **order ticket, not the deal ticket**. SLTP review checks the observed protective stop or conclusive closed-position history. Type the exact account ID and a review reason. Wrong/missing/non-final evidence remains blocked; in-flight submissions have a 30-second review guard. Review only updates the ledger and records an audit; it does not retry the trade. Successful reconciliation can allow the worker to resume protection.

After a review timeout, keep the same form/payload and retry the same operation; its ID is idempotent. Do not erase the database, invent a fresh signal ID or remove the latch just to resume trading. Legacy reservations created without ownership evidence cannot be cleared automatically. Network failures before a server reservation exists and external/manual alterations require terminal investigation; absence from the ledger is not proof of rejection.

The 5% drawdown latch requires operator review; price recovery does not silently rearm it. The UI permits review only after server verification of a flat account, no unresolved submissions and recovered drawdown below 70% of the configured limit (3.5% with the default). It preserves the peak and daily-loss latch; it cannot reset the risk budget. Daily loss resets at UTC day rollover; historical balance is reconstructed from broker deals. Cash transfers/account-currency changes need review before interpreting peak drawdown.

## Tests and research

~~~bash
npm run typecheck
npm run build
npm test
npm run test:bridge
python3 -m py_compile fastapi_mt5_bridge.py broker_lifecycle.py gold_strategy_core.py advanced_backtest_engine.py run_backtest.py
python3 run_backtest.py
~~~

The tests use fake brokers and temporary SQLite databases, never a terminal account.
Python tests isolate submission transport from the independent indicator tests; they do not certify real MT5 order execution.
For isolated UI checks, run the dev server and open `/tests/lifecycle-preview.html`. Its fetch handler is entirely in-memory, blocks all actual network calls and uses clearly labeled fictitious evidence. This fixture is not part of the production entry/build.

The default audit uses synthetic bars and clearly reports NOT LIVE VALIDATED.
Reports include a configuration hash and a machine-readable validation manifest.

To analyze exported broker M5 data:

~~~bash
python3 run_backtest.py --csv /path/to/broker-m5.csv --broker-utc-offset-hours 3
~~~

Accepted formats: numeric UTC Unix timestamp/open/high/low/close/volume CSV, or MT5 tab-separated DATE/TIME/OPEN/HIGH/LOW/CLOSE/TICKVOL/SPREAD export. Naive server-time exports require an explicit offset. Normalize periods crossing DST to UTC before import. Spread is in broker points; if absent, the configured model is used.

CSV OHLCV is still not real ticks. Historical news, actual fill sequence, swaps, dynamic commission and slippage are not fully reproduced. Fixed-parameter non-overlapping window diagnostics are not optimization and cannot authorize live trading.

## Remaining release gates

1. Compile the NewsGuard in Windows MetaEditor; verify UTC/calendar behavior on the actual terminal.
2. Import the user's broker data and run Strategy Tester with broker-specific real ticks/costs. Compare publisher EA signals with this adaptation.
3. Validate the implemented host exits against actual terminal behavior: broker comment/identifier mapping, SLTP acknowledgements, FOK/IOC partials, freezes, stop rounding and restart/reconciliation recovery. Code-level fake-broker coverage does not establish publisher parity.
4. Demo forward test fills, stops, restart/disconnect handling and small-account minimum-lot constraints.
5. Review the strategy's evidence and risk policy before any separately authorized live implementation.

The current synthetic audit is weak and is not a reason to deploy real capital.
