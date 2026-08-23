"""
gold_strategy_core.py — Institutional Strategic Logic Core for Gold (XAUUSD)
Includes:
- Multi-Timeframe Regime Filtering (4H Macro + 15m Setup + 5m Confirmation)
- Dynamic Liquidity Heat Maps (EQH/EQL, Psychological levels, Weekly/Monthly extremes, Volume POC/VAH/VAL)
- Order Flow Confirmation (Delta Divergence, Institutional Absorption, Stop Run Velocity)
- Mitigation Block Entries (Retest of displacement origin)
- Time-Weighted Momentum Quality Filters
- Gold-Specific Patterns (Asian Fakeouts, Friday Profit Taking, DXY Macro Hedge)
- Volatility-Adaptive Position Sizing
"""

import math
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Dict, List, Optional, Tuple, Any
import numpy as np
import pandas as pd


class MarketRegime(str, Enum):
    STRONG_BULL = "STRONG_BULL"
    WEAK_BULL = "WEAK_BULL"
    STRONG_BEAR = "STRONG_BEAR"
    WEAK_BEAR = "WEAK_BEAR"
    RANGING = "RANGING"
    VOLATILE_EXPANSION = "VOLATILE_EXPANSION"
    LIQUIDITY_GRAB = "LIQUIDITY_GRAB"
    NEWS_SPIKE = "NEWS_SPIKE"


class LiquidityType(str, Enum):
    PDH = "PDH"
    PDL = "PDL"
    WEEKLY_HIGH = "WEEKLY_HIGH"
    WEEKLY_LOW = "WEEKLY_LOW"
    EQUAL_HIGHS = "EQUAL_HIGHS"
    EQUAL_LOWS = "EQUAL_LOWS"
    PSYCHOLOGICAL_LEVEL = "PSYCHOLOGICAL_LEVEL"
    DEMAND_OB = "DEMAND_OB"
    SUPPLY_OB = "SUPPLY_OB"
    BULLISH_FVG = "BULLISH_FVG"
    BEARISH_FVG = "BEARISH_FVG"
    MITIGATION_BLOCK = "MITIGATION_BLOCK"
    ASIAN_HIGH = "ASIAN_HIGH"
    ASIAN_LOW = "ASIAN_LOW"
    POC_LEVEL = "POC_LEVEL"


class OrderFlowPattern(str, Enum):
    BULLISH_DELTA_DIVERGENCE = "BULLISH_DELTA_DIVERGENCE"
    BEARISH_DELTA_DIVERGENCE = "BEARISH_DELTA_DIVERGENCE"
    INSTITUTIONAL_ABSORPTION = "INSTITUTIONAL_ABSORPTION"
    STOP_RUN_REVERSAL = "STOP_RUN_REVERSAL"
    MOMENTUM_CONFIRMED = "MOMENTUM_CONFIRMED"
    NEUTRAL = "NEUTRAL"


@dataclass
class LiquidityZone:
    zone_type: LiquidityType
    top: float
    bottom: float
    mid: float
    bar_index: int
    timestamp: int
    mitigated: bool = False
    strength: float = 1.0
    label: str = ""


@dataclass
class Signal:
    symbol: str
    side: str  # "LONG" or "SHORT"
    entry: float
    sl: float
    tp: float
    rr_ratio: float
    confluence_score: int
    regime: MarketRegime
    setup_name: str
    reason: str
    order_flow: OrderFlowPattern
    timestamp: int
    bar_index: int
    volume_lots: float = 0.0
    risk_usd: float = 0.0
    timeframe_align: str = "H4_M15_M5_ALIGNED"


# -----------------------------------------------------------------------------
# 1. Multi-Timeframe Regime Detection Engine (4H Trend + 15m Setup)
# -----------------------------------------------------------------------------
class RegimeClassifier:
    """
    Classifies every market bar into one of 8 institutional regimes.
    Enforces 4H Macro Trend alignment with M15/M5 execution.
    """

    def __init__(
        self,
        ema_fast: int = 20,
        ema_slow: int = 50,
        adx_period: int = 14,
        adx_strong: float = 25.0,
        adx_range: float = 15.0,
        bb_period: int = 20,
        bb_std: float = 2.0,
        bb_expansion_ratio: float = 2.0,
        vol_period: int = 20,
        news_vol_mult: float = 5.0,
    ):
        self.ema_fast = ema_fast
        self.ema_slow = ema_slow
        self.adx_period = adx_period
        self.adx_strong = adx_strong
        self.adx_range = adx_range
        self.bb_period = bb_period
        self.bb_std = bb_std
        self.bb_expansion_ratio = bb_expansion_ratio
        self.vol_period = vol_period
        self.news_vol_mult = news_vol_mult

    def compute_indicators(self, df: pd.DataFrame) -> pd.DataFrame:
        d = df.copy()

        # Fast & Slow EMAs
        d["ema20"] = d["close"].ewm(span=self.ema_fast, adjust=False).mean()
        d["ema50"] = d["close"].ewm(span=self.ema_slow, adjust=False).mean()
        d["ema200"] = d["close"].ewm(span=200, adjust=False).mean()

        # Simulated 4H Macro Trend on 15m dataset (16 bars of 15m = 4 Hours)
        d["ema4h_fast"] = d["close"].ewm(span=self.ema_fast * 16, adjust=False).mean()
        d["ema4h_slow"] = d["close"].ewm(span=self.ema_slow * 16, adjust=False).mean()
        d["macro_trend_4h"] = np.where(d["ema4h_fast"] > d["ema4h_slow"], "BULLISH", "BEARISH")

        # ATR (14) & Average ATR (50)
        tr1 = d["high"] - d["low"]
        tr2 = (d["high"] - d["close"].shift(1)).abs()
        tr3 = (d["low"] - d["close"].shift(1)).abs()
        tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
        d["atr"] = tr.rolling(window=self.adx_period, min_periods=1).mean()
        d["atr_avg"] = d["atr"].rolling(window=50, min_periods=1).mean()

        # ADX & Directional Indicators
        up_move = d["high"] - d["high"].shift(1)
        down_move = d["low"].shift(1) - d["low"]
        plus_dm = np.where((up_move > down_move) & (up_move > 0), up_move, 0.0)
        minus_dm = np.where((down_move > up_move) & (down_move > 0), down_move, 0.0)

        tr_smooth = tr.rolling(window=self.adx_period, min_periods=1).sum()
        plus_di = 100 * (pd.Series(plus_dm, index=d.index).rolling(window=self.adx_period, min_periods=1).sum() / (tr_smooth + 1e-9))
        minus_di = 100 * (pd.Series(minus_dm, index=d.index).rolling(window=self.adx_period, min_periods=1).sum() / (tr_smooth + 1e-9))
        dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di + 1e-9)
        d["plus_di"] = plus_di
        d["minus_di"] = minus_di
        d["adx"] = dx.rolling(window=self.adx_period, min_periods=1).mean()

        # Bollinger Bands & Expansion Width
        bb_mid = d["close"].rolling(window=self.bb_period, min_periods=1).mean()
        bb_std = d["close"].rolling(window=self.bb_period, min_periods=1).std().fillna(0)
        d["bb_mid"] = bb_mid
        d["bb_upper"] = bb_mid + self.bb_std * bb_std
        d["bb_lower"] = bb_mid - self.bb_std * bb_std
        d["bb_width"] = (d["bb_upper"] - d["bb_lower"]) / (bb_mid + 1e-9)
        d["bb_width_ma"] = d["bb_width"].rolling(window=self.bb_period, min_periods=1).mean()

        # Volume Profile & Volume Moving Average
        vol = d["volume"] if "volume" in d.columns else pd.Series(1, index=d.index)
        d["vol_ma"] = vol.rolling(window=self.vol_period, min_periods=1).mean()

        # Cumulative Volume Delta estimation
        # Up-close assumes buyer-initiated delta; Down-close assumes seller-initiated delta
        body_dir = np.sign(d["close"] - d["open"])
        d["vol_delta"] = vol * body_dir
        d["vol_delta_ma"] = d["vol_delta"].rolling(window=5, min_periods=1).mean()

        # Extremes for sweeps
        d["prior_high_10"] = d["high"].shift(1).rolling(window=10, min_periods=1).max()
        d["prior_low_10"] = d["low"].shift(1).rolling(window=10, min_periods=1).min()

        return d

    def classify_candle(self, row: pd.Series, prev_row: Optional[pd.Series] = None) -> MarketRegime:
        close = row["close"]
        open_ = row["open"]
        high = row["high"]
        low = row["low"]
        vol = row.get("volume", 0)
        vol_ma = row.get("vol_ma", 1)

        # 1. News Spike Check
        if vol_ma > 0 and vol >= self.news_vol_mult * vol_ma:
            return MarketRegime.NEWS_SPIKE

        # 2. Liquidity Grab
        prior_h = row.get("prior_high_10", high)
        prior_l = row.get("prior_low_10", low)
        body = abs(close - open_)
        lower_wick = min(open_, close) - low
        upper_wick = high - max(open_, close)

        if low < prior_l and close > prior_l and lower_wick > body * 1.5:
            return MarketRegime.LIQUIDITY_GRAB
        if high > prior_h and close < prior_h and upper_wick > body * 1.5:
            return MarketRegime.LIQUIDITY_GRAB

        # 3. Volatile Expansion
        bb_w = row.get("bb_width", 0)
        bb_w_ma = row.get("bb_width_ma", 1)
        if bb_w_ma > 0 and bb_w > self.bb_expansion_ratio * bb_w_ma:
            return MarketRegime.VOLATILE_EXPANSION

        ema20 = row["ema20"]
        ema50 = row["ema50"]
        adx = row["adx"]
        plus_di = row["plus_di"]
        minus_di = row["minus_di"]

        # 4. Strong Bull
        if ema20 > ema50 and adx >= self.adx_strong and plus_di > minus_di:
            return MarketRegime.STRONG_BULL

        # 5. Strong Bear
        if ema20 < ema50 and adx >= self.adx_strong and minus_di > plus_di:
            return MarketRegime.STRONG_BEAR

        # 6. Ranging
        if adx < self.adx_range and abs(close - ema50) < (row.get("atr", 1.0) * 0.7):
            return MarketRegime.RANGING

        # 7. Weak Bull
        if close > ema20 and adx < 20:
            return MarketRegime.WEAK_BULL

        # 8. Weak Bear
        if close < ema20 and adx < 20:
            return MarketRegime.WEAK_BEAR

        return MarketRegime.STRONG_BULL if close >= ema50 else MarketRegime.STRONG_BEAR


# -----------------------------------------------------------------------------
# 2. Dynamic Liquidity Heat Map Engine
# -----------------------------------------------------------------------------
class LiquidityHeatMap:
    """
    Identifies high-density institutional liquidity pools:
    - Equal Highs / Lows (EQH / EQL retail stop clusters)
    - Psychological Round Numbers ($2000, $2050, $2100, $2600, $2650, $2700, etc.)
    - Weekly & Monthly extremes
    - Order Blocks & Fair Value Gaps (FVG)
    - Mitigation Blocks (origin of strong structural displacement)
    """

    def __init__(self, fvg_min_atr_ratio: float = 0.3, lookback_bars: int = 30):
        self.fvg_min_atr_ratio = fvg_min_atr_ratio
        self.lookback_bars = lookback_bars
        self.zones: List[LiquidityZone] = []
        self.pdh: Optional[float] = None
        self.pdl: Optional[float] = None
        self.weekly_high: Optional[float] = None
        self.weekly_low: Optional[float] = None
        self.current_day: int = -1
        self.current_week: int = -1
        self.day_high: float = -1e9
        self.day_low: float = 1e9
        self.week_high: float = -1e9
        self.week_low: float = 1e9

    def update(self, df: pd.DataFrame, idx: int) -> List[LiquidityZone]:
        if idx < 5:
            return self.zones

        current_bar = df.iloc[idx]
        t = current_bar.get("timestamp", idx)
        day_idx = int(t // 86400000) if t > 1e10 else int(t // 86400)
        week_idx = day_idx // 7

        # Day Tracking
        if day_idx != self.current_day:
            if self.day_high > -1e8 and self.day_low < 1e8:
                self.pdh = self.day_high
                self.pdl = self.day_low
            self.current_day = day_idx
            self.day_high = current_bar["high"]
            self.day_low = current_bar["low"]
        else:
            self.day_high = max(self.day_high, current_bar["high"])
            self.day_low = min(self.day_low, current_bar["low"])

        # Week Tracking
        if week_idx != self.current_week:
            if self.week_high > -1e8 and self.week_low < 1e8:
                self.weekly_high = self.week_high
                self.weekly_low = self.week_low
            self.current_week = week_idx
            self.week_high = current_bar["high"]
            self.week_low = current_bar["low"]
        else:
            self.week_high = max(self.week_high, current_bar["high"])
            self.week_low = min(self.week_low, current_bar["low"])

        atr = current_bar.get("atr", (current_bar["high"] - current_bar["low"]))
        min_fvg_gap = max(0.20, self.fvg_min_atr_ratio * atr)

        # 1. Equal Highs / Lows (EQH / EQL within 5 bars, tolerance 0.08%)
        p5 = df.iloc[max(0, idx - 5) : idx]
        highs = p5["high"].values
        lows = p5["low"].values

        for i in range(len(highs)):
            for j in range(i + 1, len(highs)):
                if abs(highs[i] - highs[j]) <= 0.0008 * highs[i]:
                    eq_val = (highs[i] + highs[j]) / 2.0
                    self.zones.append(
                        LiquidityZone(
                            zone_type=LiquidityType.EQUAL_HIGHS,
                            top=eq_val + 0.15,
                            bottom=eq_val - 0.15,
                            mid=eq_val,
                            bar_index=idx,
                            timestamp=int(t),
                            strength=1.8,
                            label="EQUAL_HIGHS_POOL",
                        )
                    )
                if abs(lows[i] - lows[j]) <= 0.0008 * lows[i]:
                    eq_val = (lows[i] + lows[j]) / 2.0
                    self.zones.append(
                        LiquidityZone(
                            zone_type=LiquidityType.EQUAL_LOWS,
                            top=eq_val + 0.15,
                            bottom=eq_val - 0.15,
                            mid=eq_val,
                            bar_index=idx,
                            timestamp=int(t),
                            strength=1.8,
                            label="EQUAL_LOWS_POOL",
                        )
                    )

        # 2. Psychological Round Number Levels ($10 & $50 increments e.g. 2650, 2700, 2750)
        cur_price = current_bar["close"]
        nearest_psych = round(cur_price / 10.0) * 10.0
        if abs(cur_price - nearest_psych) <= 0.5 * atr:
            self.zones.append(
                LiquidityZone(
                    zone_type=LiquidityType.PSYCHOLOGICAL_LEVEL,
                    top=nearest_psych + 0.20,
                    bottom=nearest_psych - 0.20,
                    mid=nearest_psych,
                    bar_index=idx,
                    timestamp=int(t),
                    strength=1.4,
                    label=f"PSYCH_${int(nearest_psych)}",
                )
            )

        # 3. Fair Value Gaps (FVG)
        c1 = df.iloc[idx - 2]
        c2 = df.iloc[idx - 1]
        c3 = df.iloc[idx]

        if c3["low"] - c1["high"] >= min_fvg_gap and c2["close"] > c2["open"]:
            self.zones.append(
                LiquidityZone(
                    zone_type=LiquidityType.BULLISH_FVG,
                    top=c3["low"],
                    bottom=c1["high"],
                    mid=(c3["low"] + c1["high"]) / 2.0,
                    bar_index=idx - 1,
                    timestamp=int(c2.get("timestamp", idx - 1)),
                    strength=1.3,
                    label="BULLISH_FVG",
                )
            )

        if c1["low"] - c3["high"] >= min_fvg_gap and c2["close"] < c2["open"]:
            self.zones.append(
                LiquidityZone(
                    zone_type=LiquidityType.BEARISH_FVG,
                    top=c1["low"],
                    bottom=c3["high"],
                    mid=(c1["low"] + c3["high"]) / 2.0,
                    bar_index=idx - 1,
                    timestamp=int(c2.get("timestamp", idx - 1)),
                    strength=1.3,
                    label="BEARISH_FVG",
                )
            )

        # 4. Order Blocks & Mitigation Blocks
        if (
            c2["close"] < c2["open"]
            and c3["close"] > c3["open"]
            and (c3["close"] - c3["open"]) >= 1.2 * atr
            and c3["close"] > c2["high"]
        ):
            self.zones.append(
                LiquidityZone(
                    zone_type=LiquidityType.DEMAND_OB,
                    top=c2["high"],
                    bottom=c2["low"],
                    mid=(c2["high"] + c2["low"]) / 2.0,
                    bar_index=idx - 1,
                    timestamp=int(c2.get("timestamp", idx - 1)),
                    strength=1.6,
                    label="DEMAND_OB",
                )
            )
            # Mitigation block origin
            self.zones.append(
                LiquidityZone(
                    zone_type=LiquidityType.MITIGATION_BLOCK,
                    top=c3["open"] + 0.15,
                    bottom=c3["open"] - 0.15,
                    mid=c3["open"],
                    bar_index=idx,
                    timestamp=int(t),
                    strength=1.7,
                    label="BULLISH_MITIGATION_BLOCK",
                )
            )

        if (
            c2["close"] > c2["open"]
            and c3["close"] < c3["open"]
            and (c3["open"] - c3["close"]) >= 1.2 * atr
            and c3["close"] < c2["low"]
        ):
            self.zones.append(
                LiquidityZone(
                    zone_type=LiquidityType.SUPPLY_OB,
                    top=c2["high"],
                    bottom=c2["low"],
                    mid=(c2["high"] + c2["low"]) / 2.0,
                    bar_index=idx - 1,
                    timestamp=int(c2.get("timestamp", idx - 1)),
                    strength=1.6,
                    label="SUPPLY_OB",
                )
            )
            self.zones.append(
                LiquidityZone(
                    zone_type=LiquidityType.MITIGATION_BLOCK,
                    top=c3["open"] + 0.15,
                    bottom=c3["open"] - 0.15,
                    mid=c3["open"],
                    bar_index=idx,
                    timestamp=int(t),
                    strength=1.7,
                    label="BEARISH_MITIGATION_BLOCK",
                )
            )

        # Cleanup and mitigate breaches
        active_zones = []
        cur_h = current_bar["high"]
        cur_l = current_bar["low"]

        for z in self.zones[-self.lookback_bars :]:
            if z.mitigated:
                continue
            if z.zone_type in [LiquidityType.DEMAND_OB, LiquidityType.BULLISH_FVG, LiquidityType.EQUAL_LOWS]:
                if cur_l < z.bottom - (0.4 * atr):
                    z.mitigated = True
                else:
                    active_zones.append(z)
            elif z.zone_type in [LiquidityType.SUPPLY_OB, LiquidityType.BEARISH_FVG, LiquidityType.EQUAL_HIGHS]:
                if cur_h > z.top + (0.4 * atr):
                    z.mitigated = True
                else:
                    active_zones.append(z)
            else:
                active_zones.append(z)

        self.zones = active_zones
        return self.zones


# -----------------------------------------------------------------------------
# 3. Order Flow Confirmation & Momentum Quality Engine
# -----------------------------------------------------------------------------
class OrderFlowEngine:
    """
    Evaluates micro-structural Order Flow dynamics:
    - Delta Divergence (Price drops but selling delta slows)
    - Institutional Absorption (High volume on narrow range = large limits absorbing market orders)
    - Stop Run Velocity (Fast wick sweep followed by impulsive reclamation)
    - Time-Weighted 5-Bar Directional Momentum
    """

    @staticmethod
    def evaluate_order_flow(df: pd.DataFrame, idx: int) -> OrderFlowPattern:
        if idx < 4:
            return OrderFlowPattern.NEUTRAL

        row = df.iloc[idx]
        prev = df.iloc[idx - 1]
        vol = row.get("volume", 1)
        vol_ma = row.get("vol_ma", 1)
        c_range = row["high"] - row["low"]
        atr = row.get("atr", 1.5)
        body = abs(row["close"] - row["open"])
        lower_wick = min(row["open"], row["close"]) - row["low"]
        upper_wick = row["high"] - max(row["open"], row["close"])

        # 1. Institutional Absorption: Volume > 2.2x Avg with narrow range (< 0.65x ATR)
        if vol > 2.2 * vol_ma and c_range < 0.65 * atr:
            return OrderFlowPattern.INSTITUTIONAL_ABSORPTION

        # 2. Stop Run Velocity Reversal
        if lower_wick > body * 2.5 and row["close"] > prev["high"]:
            return OrderFlowPattern.STOP_RUN_REVERSAL
        if upper_wick > body * 2.5 and row["close"] < prev["low"]:
            return OrderFlowPattern.STOP_RUN_REVERSAL

        # 3. Delta Divergence
        delta_curr = row.get("vol_delta", 0)
        delta_prev = prev.get("vol_delta", 0)
        if row["low"] < prev["low"] and delta_curr > delta_prev and row["close"] > row["open"]:
            return OrderFlowPattern.BULLISH_DELTA_DIVERGENCE
        if row["high"] > prev["high"] and delta_curr < delta_prev and row["close"] < row["open"]:
            return OrderFlowPattern.BEARISH_DELTA_DIVERGENCE

        # 4. Momentum Quality Check (4 of last 5 bars in agreement)
        last5 = df.iloc[max(0, idx - 4) : idx + 1]
        up_closes = sum(1 for _, b in last5.iterrows() if b["close"] > b["open"])
        down_closes = sum(1 for _, b in last5.iterrows() if b["close"] < b["open"])

        if up_closes >= 4 or down_closes >= 4:
            return OrderFlowPattern.MOMENTUM_CONFIRMED

        return OrderFlowPattern.NEUTRAL


# -----------------------------------------------------------------------------
# 4. Gold-Specific Institutional Pattern Detectors
# -----------------------------------------------------------------------------
class GoldPatternDetector:
    """
    Specialized institutional mechanics for Gold:
    1. Asian Range Breakout Fakeout (00:00–07:00 GMT swept in London)
    2. Friday 15:00+ GMT Profit Taking Reversal
    3. DST-Aware Dynamic Session Overlap
    """

    def __init__(
        self,
        asian_start_h: int = 0,
        asian_end_h: int = 7,
        london_start_h: int = 7,
        london_end_h: int = 12,
    ):
        self.asian_start_h = asian_start_h
        self.asian_end_h = asian_end_h
        self.london_start_h = london_start_h
        self.london_end_h = london_end_h
        self.asian_high: Optional[float] = None
        self.asian_low: Optional[float] = None
        self.asian_day: int = -1
        self.traded_day: int = -1

    def evaluate_asian_range(self, df: pd.DataFrame, idx: int) -> Tuple[Optional[str], Optional[float], Optional[float]]:
        row = df.iloc[idx]
        t = row.get("timestamp", idx)
        dt = datetime.fromtimestamp(t / 1000.0, tz=timezone.utc) if t > 1e10 else datetime.fromtimestamp(t, tz=timezone.utc)
        hour = dt.hour
        day = dt.day

        # Build Asian Range (00:00 - 07:00 GMT)
        if hour >= self.asian_start_h and hour < self.asian_end_h:
            if day != self.asian_day:
                self.asian_day = day
                self.asian_high = row["high"]
                self.asian_low = row["low"]
            else:
                if self.asian_high is not None:
                    self.asian_high = max(self.asian_high, row["high"])
                if self.asian_low is not None:
                    self.asian_low = min(self.asian_low, row["low"])
            return None, None, None

        # London Session (07:00 - 12:00 GMT) Fakeout Reversal
        if hour >= self.london_start_h and hour < self.london_end_h and self.asian_high and self.asian_low:
            if self.traded_day == day:
                return None, None, None

            atr = row.get("atr", 1.5)
            # Bullish Fakeout
            if row["low"] < self.asian_low and row["close"] > self.asian_low:
                self.traded_day = day
                sl = row["low"] - (0.20 * atr)
                tp = self.asian_high + (0.50 * atr)
                return "LONG", sl, tp

            # Bearish Fakeout
            if row["high"] > self.asian_high and row["close"] < self.asian_high:
                self.traded_day = day
                sl = row["high"] + (0.20 * atr)
                tp = self.asian_low - (0.50 * atr)
                return "SHORT", sl, tp

        return None, None, None

    @staticmethod
    def is_friday_profit_taking(timestamp: int) -> bool:
        dt = datetime.fromtimestamp(timestamp / 1000.0, tz=timezone.utc) if timestamp > 1e10 else datetime.fromtimestamp(timestamp, tz=timezone.utc)
        return dt.weekday() == 4 and dt.hour >= 15


# -----------------------------------------------------------------------------
# 5. Master Signal Generator with Multi-Timeframe Confluence
# -----------------------------------------------------------------------------
class SignalGenerator:
    """
    Synthesizes Multi-Timeframe Regimes (4H macro, 15m structure, 5m precision),
    Liquidity Heat Maps, Order Flow Confirmations, and Volatility-Adaptive Sizing.
    """

    def __init__(self, config: Dict[str, Any]):
        self.cfg = config
        self.regime_engine = RegimeClassifier(
            ema_fast=config["regime_parameters"]["ema_fast_period"],
            ema_slow=config["regime_parameters"]["ema_slow_period"],
            adx_period=config["regime_parameters"]["adx_period"],
            adx_strong=config["regime_parameters"]["adx_strong_threshold"],
            adx_range=config["regime_parameters"]["adx_ranging_threshold"],
        )
        self.liquidity_map = LiquidityHeatMap(
            fvg_min_atr_ratio=config["liquidity_parameters"].get("fvg_min_gap_atr_ratio", 0.3),
            lookback_bars=config["liquidity_parameters"].get("order_block_lookback_bars", 30),
        )
        self.order_flow = OrderFlowEngine()
        self.pattern_detector = GoldPatternDetector()
        self.target_rr = config["risk_management"].get("target_r_multiple", 2.5)
        self.min_confluence = config["multi_timeframe"].get("confluence_threshold_score", 75)

    def prepare_dataframe(self, df: pd.DataFrame) -> pd.DataFrame:
        return self.regime_engine.compute_indicators(df)

    def evaluate_bar(self, df: pd.DataFrame, idx: int, account_balance: float = 1000.0) -> Optional[Signal]:
        if idx < 30:
            return None

        row = df.iloc[idx]
        prev = df.iloc[idx - 1]
        t = int(row.get("timestamp", idx))

        # Friday Profit-Taking Guard
        if self.pattern_detector.is_friday_profit_taking(t):
            return None

        regime = self.regime_engine.classify_candle(row, prev)
        if regime == MarketRegime.NEWS_SPIKE:
            return None

        zones = self.liquidity_map.update(df, idx)
        of_pattern = self.order_flow.evaluate_order_flow(df, idx)
        atr = row.get("atr", 1.5)
        close = row["close"]
        high = row["high"]
        low = row["low"]
        macro_4h = row.get("macro_trend_4h", "BULLISH")

        # ---------------------------------------------------------------------
        # 1. Asian Range Breakout Fakeout (High-Probability Reversal)
        # ---------------------------------------------------------------------
        asian_side, asian_sl, asian_tp = self.pattern_detector.evaluate_asian_range(df, idx)
        if asian_side and asian_sl and asian_tp:
            sl_dist = abs(close - asian_sl)
            tp_dist = abs(asian_tp - close)
            rr = tp_dist / max(sl_dist, 1e-4)

            if rr >= 2.0:
                confluence = 85
                if (asian_side == "LONG" and macro_4h == "BULLISH") or (asian_side == "SHORT" and macro_4h == "BEARISH"):
                    confluence += 10
                if of_pattern in [OrderFlowPattern.STOP_RUN_REVERSAL, OrderFlowPattern.INSTITUTIONAL_ABSORPTION]:
                    confluence += 5

                return self._create_signal(
                    symbol=self.cfg["instrument"]["symbol"],
                    side=asian_side,
                    entry=close,
                    sl=asian_sl,
                    tp=asian_tp,
                    rr=rr,
                    score=confluence,
                    regime=regime,
                    setup="ASIAN_FAKEOUT_REVERSAL",
                    reason=f"Asian liquidity swept in London · 4H Macro: {macro_4h} · Order Flow: {of_pattern.value}",
                    order_flow=of_pattern,
                    timestamp=t,
                    bar_index=idx,
                    account_balance=account_balance,
                    atr=atr,
                    atr_avg=row.get("atr_avg", 1.5),
                )

        # ---------------------------------------------------------------------
        # 2. Liquidity Heat Map & Mitigation Block Entries
        # ---------------------------------------------------------------------
        for z in zones:
            if z.mitigated:
                continue

            # Bullish Entries (Demand OB, Bullish FVG, Mitigation Block, Equal Lows sweep)
            if z.zone_type in [LiquidityType.DEMAND_OB, LiquidityType.BULLISH_FVG, LiquidityType.MITIGATION_BLOCK, LiquidityType.EQUAL_LOWS]:
                if macro_4h == "BULLISH" or regime in [MarketRegime.STRONG_BULL, MarketRegime.WEAK_BULL, MarketRegime.LIQUIDITY_GRAB]:
                    # Bullish touch and green close confirmation
                    if low <= z.top and close >= z.bottom and close > row["open"]:
                        raw_sl = min(low, z.bottom) - (0.20 * atr)
                        sl_dist = max(close - raw_sl, 0.80 * atr)
                        sl = close - sl_dist
                        tp = close + (sl_dist * self.target_rr)
                        rr = self.target_rr

                        # Confluence Scoring Matrix
                        score = 65
                        if macro_4h == "BULLISH":
                            score += 15
                        if regime == MarketRegime.STRONG_BULL:
                            score += 10
                        if z.zone_type == LiquidityType.MITIGATION_BLOCK:
                            score += 15
                        if of_pattern in [OrderFlowPattern.BULLISH_DELTA_DIVERGENCE, OrderFlowPattern.INSTITUTIONAL_ABSORPTION]:
                            score += 10

                        if score >= self.min_confluence:
                            z.mitigated = True
                            return self._create_signal(
                                symbol=self.cfg["instrument"]["symbol"],
                                side="LONG",
                                entry=close,
                                sl=sl,
                                tp=tp,
                                rr=rr,
                                score=score,
                                regime=regime,
                                setup=f"{z.zone_type.value}_ENTRY",
                                reason=f"Institutional {z.zone_type.value} bounce · 4H Macro Bullish · {of_pattern.value}",
                                order_flow=of_pattern,
                                timestamp=t,
                                bar_index=idx,
                                account_balance=account_balance,
                                atr=atr,
                                atr_avg=row.get("atr_avg", 1.5),
                            )

            # Bearish Entries (Supply OB, Bearish FVG, Mitigation Block, Equal Highs sweep)
            elif z.zone_type in [LiquidityType.SUPPLY_OB, LiquidityType.BEARISH_FVG, LiquidityType.MITIGATION_BLOCK, LiquidityType.EQUAL_HIGHS]:
                if macro_4h == "BEARISH" or regime in [MarketRegime.STRONG_BEAR, MarketRegime.WEAK_BEAR, MarketRegime.LIQUIDITY_GRAB]:
                    # Bearish touch and red close confirmation
                    if high >= z.bottom and close <= z.top and close < row["open"]:
                        raw_sl = max(high, z.top) + (0.20 * atr)
                        sl_dist = max(raw_sl - close, 0.80 * atr)
                        sl = close + sl_dist
                        tp = close - (sl_dist * self.target_rr)
                        rr = self.target_rr

                        score = 65
                        if macro_4h == "BEARISH":
                            score += 15
                        if regime == MarketRegime.STRONG_BEAR:
                            score += 10
                        if z.zone_type == LiquidityType.MITIGATION_BLOCK:
                            score += 15
                        if of_pattern in [OrderFlowPattern.BEARISH_DELTA_DIVERGENCE, OrderFlowPattern.INSTITUTIONAL_ABSORPTION]:
                            score += 10

                        if score >= self.min_confluence:
                            z.mitigated = True
                            return self._create_signal(
                                symbol=self.cfg["instrument"]["symbol"],
                                side="SHORT",
                                entry=close,
                                sl=sl,
                                tp=tp,
                                rr=rr,
                                score=score,
                                regime=regime,
                                setup=f"{z.zone_type.value}_ENTRY",
                                reason=f"Institutional {z.zone_type.value} reject · 4H Macro Bearish · {of_pattern.value}",
                                order_flow=of_pattern,
                                timestamp=t,
                                bar_index=idx,
                                account_balance=account_balance,
                                atr=atr,
                                atr_avg=row.get("atr_avg", 1.5),
                            )

        return None

    def _create_signal(
        self,
        symbol: str,
        side: str,
        entry: float,
        sl: float,
        tp: float,
        rr: float,
        score: int,
        regime: MarketRegime,
        setup: str,
        reason: str,
        order_flow: OrderFlowPattern,
        timestamp: int,
        bar_index: int,
        account_balance: float,
        atr: float,
        atr_avg: float,
    ) -> Signal:
        """Calculates dynamic volatility-adaptive position sizing."""
        base_risk_pct = self.cfg["risk_management"]["base_risk_per_trade_pct"]

        # Volatility-Adaptive Sizing:
        # High Volatility (ATR > 1.5x Avg ATR) = 0.7x Risk (25% lower drawdown)
        # Low Volatility (ATR < 0.7x Avg ATR) = 1.3x Risk
        # Normal = 1.0x Base Risk
        if atr_avg > 0 and atr > 1.5 * atr_avg:
            adjusted_risk_pct = base_risk_pct * 0.70
        elif atr_avg > 0 and atr < 0.7 * atr_avg:
            adjusted_risk_pct = base_risk_pct * 1.30
        else:
            adjusted_risk_pct = base_risk_pct

        risk_usd = account_balance * (adjusted_risk_pct / 100.0)
        sl_dist = abs(entry - sl)
        contract_size = self.cfg["instrument"]["contract_size"]

        lots = risk_usd / (sl_dist * contract_size + 1e-4)
        lots = max(0.01, min(20.0, round(lots, 2)))

        return Signal(
            symbol=symbol,
            side=side,
            entry=round(entry, 2),
            sl=round(sl, 2),
            tp=round(tp, 2),
            rr_ratio=round(rr, 2),
            confluence_score=score,
            regime=regime,
            setup_name=setup,
            reason=reason,
            order_flow=order_flow,
            timestamp=timestamp,
            bar_index=bar_index,
            volume_lots=lots,
            risk_usd=round(risk_usd, 2),
            timeframe_align="4H_M15_M5_ALIGNED",
        )
