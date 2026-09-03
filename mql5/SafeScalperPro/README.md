# SafeScalperPro integration

This directory contains the official open-source CodeBase engine and presets published by AlgoSphere Quant:

- `ASQ_SafeScalping_CodeBase.mq5` — CodeBase v1.20 source
- `ASQ_SafeScalping_XAUUSD_M5_v2.set` — ready-to-trade XAUUSD M5 preset
- `Phase1_Structure_FIXED.set` — compilation and baseline verification
- `Phase2_SL_TP_Risk.set` — SL/TP/risk optimization
- `Phase3_Exit_Management.set` — breakeven/trailing/partial-close optimization
- `Phase4_Session_DayCap.set` — session and daily-cap optimization

Source: <https://www.mql5.com/en/code/71189>

The web and Python engines adapt these seven gates using this repository's 50/200 configuration. They are not certified as identical to the current Market binary. The bundled CodeBase source remains the publisher's v1.20 release and is intentionally preserved rather than silently rewritten. The Market description and historical presets differ; do not treat them as interchangeable performance evidence.

## MT5 installation

1. Copy `ASQ_SafeScalping_CodeBase.mq5` to `MQL5/Experts/`.
2. Compile it in MetaEditor with F7.
3. Copy the `.set` files to `MQL5/Presets/`.
4. Attach the EA to an XAUUSD M5 chart and load the ready preset.
5. Enable Algo Trading only after a broker-specific Strategy Tester run.

The dashboard's REST bridge is a separate, demo-only execution route with real-account orders blocked. Initial broker SL/TP plus host-managed breakeven, trailing and one-shot partial closes are implemented and fake-broker tested; actual terminal validation is still required. The bridge and terminal must stay running for advanced management. Never run both routes as execution owners on one account. The publisher EA does not inherit the bridge's guards.

`TradingFlow_NewsGuard.mq5` is our calendar-only companion (not a trading EA). It emits a fail-closed UTF-8 heartbeat for the bridge. Compile/verify it in MetaEditor before demo use; compilation and terminal integration have not been verified on this Mac.
