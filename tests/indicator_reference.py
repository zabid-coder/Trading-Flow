"""Deterministic Python reference for cross-runtime indicator parity (no network)."""
import json
import math
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import pandas as pd
from gold_strategy_core import SignalGenerator

cfg = json.loads(Path("strategy_config.json").read_text())
start = int(pd.Timestamp("2026-08-24 08:00", tz="UTC").timestamp()*1000)
bars = []
for i in range(900):
    close = 2650 + math.sin(i/9)*3 + i*.003
    bars.append(dict(t=start+i*300_000, o=close-.03, h=close+.2, l=close-.2, c=close, v=10, day=(start+i*300_000)//86400000))
frame = pd.DataFrame([dict(timestamp=b["t"], open=b["o"], high=b["h"], low=b["l"], close=b["c"], volume=b["v"]) for b in bars])
result = SignalGenerator(cfg).prepare_dataframe(frame).iloc[-1]
print(json.dumps({"bars": bars, "expected": {key: float(result[key]) for key in ["safe_ema_fast", "safe_ema_slow", "safe_atr", "safe_rsi", "safe_mtf_fast", "safe_mtf_slow"]}}))
