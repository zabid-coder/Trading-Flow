import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
import pandas as pd
from gold_strategy_core import SignalGenerator
from advanced_backtest_engine import AdvancedBacktestEngine
from run_backtest import load_broker_csv, rolling_walk_forward_analysis


class ResearchTests(unittest.TestCase):
    def setUp(self):
        self.config = json.loads(Path("strategy_config.json").read_text())

    def frame(self, length=900):
        t = pd.date_range("2026-08-24", periods=length, freq="5min", tz="UTC")
        # pandas can store us/ns timestamps; normalize explicitly to milliseconds.
        timestamps = t.as_unit("ms").asi8
        return pd.DataFrame(dict(timestamp=timestamps, open=2650., high=2650.5, low=2649.5, close=2650., volume=10.))

    def test_empty_dataset_rejected(self):
        with self.assertRaises(ValueError): SignalGenerator(self.config).prepare_dataframe(pd.DataFrame())

    def test_h1_warmup_requires_completed_hours(self):
        generator=SignalGenerator(self.config)
        result=generator.prepare_dataframe(self.frame())
        self.assertTrue(result.iloc[:600].safe_mtf_slow.isna().all())
        self.assertTrue(np.isfinite(result.iloc[-1].safe_mtf_slow))

    def test_future_bars_do_not_change_past_indicators(self):
        generator=SignalGenerator(self.config)
        data=self.frame()
        prefix=generator.prepare_dataframe(data.iloc[:800])
        data.loc[800:, "close"] = 2700
        data.loc[800:, "high"] = 2701
        full=generator.prepare_dataframe(data)
        for field in ("safe_ema_fast", "safe_ema_slow", "safe_atr", "safe_rsi", "safe_mtf_fast", "safe_mtf_slow"):
            np.testing.assert_allclose(prefix[field],full[field].iloc[:800],equal_nan=True)

    def test_bundled_breakout_buffer_direction(self):
        generator=SignalGenerator(self.config)
        generator.safe={**generator.safe,"use_mtf":False}
        data=generator.prepare_dataframe(self.frame())
        i=800
        # c1 lies BELOW the old high but within high - ATR*buffer, as in bundled MQL5.
        stamp=int(pd.Timestamp("2026-08-27 10:00",tz="UTC").timestamp()*1000)
        data.loc[i, ["timestamp","close","safe_ema_fast","safe_ema_slow","safe_atr","safe_rsi","safe_breakout_high","safe_breakout_low"]] = [stamp,2650.8,2650.5,2650.,1.,55.,2651.,2649.]
        data.loc[i-1,"close"]=2650.7
        self.assertIsNotNone(generator.evaluate_bar(data,i,500))
        data.loc[i-1,"close"]=2651.1
        self.assertIsNone(generator.evaluate_bar(data,i,500))

    def test_no_trade_folds_are_not_robust(self):
        result=rolling_walk_forward_analysis(self.frame(1000),window_bars=100,step_bars=100)
        self.assertFalse(result["sample_sufficient"])
        self.assertFalse(result["diagnostic_pass"])
        self.assertFalse(result["live_validated"])

    def test_csv_duplicate_and_invalid_ohlc_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/"bars.csv"
            frame=self.frame(); frame.to_csv(path,index=False)
            self.assertEqual(len(load_broker_csv(str(path))),900)
            frame.loc[1,"timestamp"]=frame.loc[0,"timestamp"]; frame.to_csv(path,index=False)
            with self.assertRaisesRegex(ValueError,"unique"): load_broker_csv(str(path))
            frame=self.frame(); frame.loc[1,"low"]=3000; frame.to_csv(path,index=False)
            with self.assertRaisesRegex(ValueError,"envelope"): load_broker_csv(str(path))

    def test_mt5_export_timezone_is_explicit(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/"mt5.tsv"
            frame=self.frame()
            dates=pd.to_datetime(frame.timestamp,unit="ms",utc=True)+pd.Timedelta(hours=3)
            exported=pd.DataFrame({"<DATE>":dates.dt.strftime("%Y.%m.%d"),"<TIME>":dates.dt.strftime("%H:%M:%S"),"<OPEN>":2650.,"<HIGH>":2651.,"<LOW>":2649.,"<CLOSE>":2650.,"<TICKVOL>":10})
            exported.to_csv(path,sep="\t",index=False)
            with self.assertRaisesRegex(ValueError,"offset"): load_broker_csv(str(path))
            actual=load_broker_csv(str(path),3)
            self.assertEqual(actual.timestamp.iloc[0],frame.timestamp.iloc[0])


if __name__ == "__main__": unittest.main()
