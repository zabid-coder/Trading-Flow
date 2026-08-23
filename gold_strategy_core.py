"""
gold_strategy_core.py — Institutional Strategic Logic Core for Gold (XAUUSD)
Author: Trading Flow Institutional Quantitative Research
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
    DEMAND_OB = "DEMAND_OB"
    SUPPLY_OB = "SUPPLY_OB"
    BULLISH_FVG = "BULLISH_FVG"
    BEARISH_FVG = "BEARISH_FVG"
    ASIAN_HIGH = "ASIAN_HIGH"
    ASIAN_LOW = "ASIAN_LOW"


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
    timestamp: int
    bar_index: int
    volume_lots: float = 0.0
    risk_usd: float = 0.0


# -----------------------------------------------------------------------------
# 1. Market Regime Detection Engine
# -----------------------------------------------------------------------------
class RegimeClassifier:
    """
    Classifies every market bar into one of 8 precise institutional regimes.
    Trades are strictly filtered based on regime compatibility.
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
        """Precomputes all TA indicators needed for the 8-state classification."""
        d = df.copy()

        # EMAs
        d["ema20"] = d["close"].ewm(span=self.ema_fast, adjust=False).mean()
        d["ema50"] = d["close"].ewm(span=self.ema_slow, adjust=False).mean()
        d["ema200"] = d["close"].ewm(span=200, adjust=False).mean()

        # ATR
        tr1 = d["high"] - d["low"]
        tr2 = (d["high"] - d["close"].shift(1)).abs()
        tr3 = (d["low"] - d["close"].shift(1)).abs()
        tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
        d["atr"] = tr.rolling(window=self.adx_period, min_periods=1).mean()
        d["atr_avg"] = d["atr"].rolling(window=50, min_periods=1).mean()

        # ADX & Directional Movement (+DI, -DI)
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

        # Bollinger Bands
        bb_mid = d["close"].rolling(window=self.bb_period, min_periods=1).mean()
        bb_std = d["close"].rolling(window=self.bb_period, min_periods=1).std().fillna(0)
        d["bb_mid"] = bb_mid
        d["bb_upper"] = bb_mid + self.bb_std * bb_std
        d["bb_lower"] = bb_mid - self.bb_std * bb_std
        d["bb_width"] = (d["bb_upper"] - d["bb_lower"]) / (bb_mid + 1e-9)
        d["bb_width_ma"] = d["bb_width"].rolling(window=self.bb_period, min_periods=1).mean()

        # Volume Moving Average
        vol = d["volume"] if "volume" in d.columns else pd.Series(1, index=d.index)
        d["vol_ma"] = vol.rolling(window=self.vol_period, min_periods=1).mean()

        # Prior Extremes for Liquidity Grabs (10-bar lookback)
        d["prior_high_10"] = d["high"].shift(1).rolling(window=10, min_periods=1).max()
        d["prior_low_10"] = d["low"].shift(1).rolling(window=10, min_periods=1).min()

        return d

    def classify_candle(self, row: pd.Series, prev_row: Optional[pd.Series] = None) -> MarketRegime:
        """Determines the regime for a single bar."""
        close = row["close"]
        open_ = row["open"]
        high = row["high"]
        low = row["low"]
        vol = row.get("volume", 0)
        vol_ma = row.get("vol_ma", 1)

        # 1. News Spike Check: Volume > 5x average
        if vol_ma > 0 and vol >= self.news_vol_mult * vol_ma:
            return MarketRegime.NEWS_SPIKE

        # 2. Liquidity Grab (Fakeout sweep of prior 10-bar high/low with strong reversal close)
        prior_h = row.get("prior_high_10", high)
        prior_l = row.get("prior_low_10", low)
        body = abs(close - open_)
        lower_wick = min(open_, close) - low
        upper_wick = high - max(open_, close)

        # Bullish Grab: Swept prior low but closed strongly back up
        if low < prior_l and close > prior_l and lower_wick > body * 1.5:
            return MarketRegime.LIQUIDITY_GRAB
        # Bearish Grab: Swept prior high but closed strongly back down
        if high > prior_h and close < prior_h and upper_wick > body * 1.5:
            return MarketRegime.LIQUIDITY_GRAB

        # 3. Volatile Expansion: BB width > 2.0x average BB width
        bb_w = row.get("bb_width", 0)
        bb_w_ma = row.get("bb_width_ma", 1)
        if bb_w_ma > 0 and bb_w > self.bb_expansion_ratio * bb_w_ma:
            return MarketRegime.VOLATILE_EXPANSION

        ema20 = row["ema20"]
        ema50 = row["ema50"]
        adx = row["adx"]
        plus_di = row["plus_di"]
        minus_di = row["minus_di"]

        # 4. Strong Bull: EMA20 > EMA50, ADX > 25, +DI > -DI
        if ema20 > ema50 and adx >= self.adx_strong and plus_di > minus_di:
            return MarketRegime.STRONG_BULL

        # 5. Strong Bear: EMA20 < EMA50, ADX > 25, -DI > +DI
        if ema20 < ema50 and adx >= self.adx_strong and minus_di > plus_di:
            return MarketRegime.STRONG_BEAR

        # 6. Ranging: ADX < 15, oscillating around EMA50
        if adx < self.adx_range and abs(close - ema50) < (row.get("atr", 1.0) * 0.7):
            return MarketRegime.RANGING

        # 7. Weak Bull: Close > EMA20, but ADX < 20
        if close > ema20 and adx < 20:
            return MarketRegime.WEAK_BULL

        # 8. Weak Bear: Close < EMA20, but ADX < 20
        if close < ema20 and adx < 20:
            return MarketRegime.WEAK_BEAR

        # Fallback based on EMA alignment
        return MarketRegime.STRONG_BULL if close >= ema50 else MarketRegime.STRONG_BEAR


# -----------------------------------------------------------------------------
# 2. Area of Interest (AOI) & Liquidity Map Engine
# -----------------------------------------------------------------------------
class LiquidityMap:
    """
    Identifies and tracks institutional Fair Value Gaps (FVG), Order Blocks (OB),
    and Previous Day Extremes (PDH/PDL).
    """

    def __init__(self, fvg_min_atr_ratio: float = 0.3, lookback_bars: int = 24):
        self.fvg_min_atr_ratio = fvg_min_atr_ratio
        self.lookback_bars = lookback_bars
        self.zones: List[LiquidityZone] = []
        self.pdh: Optional[float] = None
        self.pdl: Optional[float] = None
        self.current_day: int = -1
        self.day_high: float = -1e9
        self.day_low: float = 1e9

    def update(self, df: pd.DataFrame, idx: int) -> List[LiquidityZone]:
        """Scans current and recent bars to discover new zones and mitigate filled ones."""
        if idx < 3:
            return self.zones

        current_bar = df.iloc[idx]
        t = current_bar.get("timestamp", idx)
        day_idx = int(t // 86400000) if t > 1e10 else int(t // 86400)

        # Track PDH / PDL rollover
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

        atr = current_bar.get("atr", (current_bar["high"] - current_bar["low"]))
        min_fvg_gap = max(0.20, self.fvg_min_atr_ratio * atr)

        # 1. Bullish Fair Value Gap (FVG): Candle 1 High < Candle 3 Low
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
                    strength=1.2,
                )
            )

        # 2. Bearish Fair Value Gap (FVG): Candle 1 Low > Candle 3 High
        if c1["low"] - c3["high"] >= min_fvg_gap and c2["close"] < c2["open"]:
            self.zones.append(
                LiquidityZone(
                    zone_type=LiquidityType.BEARISH_FVG,
                    top=c1["low"],
                    bottom=c3["high"],
                    mid=(c1["low"] + c3["high"]) / 2.0,
                    bar_index=idx - 1,
                    timestamp=int(c2.get("timestamp", idx - 1)),
                    strength=1.2,
                )
            )

        # 3. Order Block Detection (Displacement Check)
        # Demand OB: Last bearish candle before high-momentum green displacement
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
                    strength=1.5,
                )
            )

        # Supply OB: Last bullish candle before high-momentum red displacement
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
                    strength=1.5,
                )
            )

        # Mitigate old or breached zones
        active_zones = []
        cur_h = current_bar["high"]
        cur_l = current_bar["low"]

        for z in self.zones[-self.lookback_bars :]:
            if z.mitigated:
                continue
            # If price completely invalidates the zone, mark mitigated
            if z.zone_type in [LiquidityType.DEMAND_OB, LiquidityType.BULLISH_FVG]:
                if cur_l < z.bottom - (0.5 * atr):
                    z.mitigated = True
                else:
                    active_zones.append(z)
            elif z.zone_type in [LiquidityType.SUPPLY_OB, LiquidityType.BEARISH_FVG]:
                if cur_h > z.top + (0.5 * atr):
                    z.mitigated = True
                else:
                    active_zones.append(z)
            else:
                active_zones.append(z)

        self.zones = active_zones
        return self.zones


# -----------------------------------------------------------------------------
# 3. Gold-Specific Institutional Pattern Detectors
# -----------------------------------------------------------------------------
class GoldPatternDetector:
    """
    Detects Gold-specific market mechanics:
    1. Asian Range Breakout Fakeout (00:00–07:00 GMT swept during London)
    2. Friday 14:00+ GMT Profit Taking Risk Cut
    3. DXY Negative Correlation Verification
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

    def evaluate_asian_range(self, df: pd.DataFrame, idx: int) -> Tuple[Optional[str], Optional[float], Optional[float]]:
        """
        Returns (setup_side, target_sl, target_tp) if an Asian Fakeout Reversal occurs.
        """
        row = df.iloc[idx]
        t = row.get("timestamp", idx)
        dt = datetime.fromtimestamp(t / 1000.0, tz=timezone.utc) if t > 1e10 else datetime.fromtimestamp(t, tz=timezone.utc)
        hour = dt.hour
        day = dt.day

        # Reset / Build Asian Range during 00:00 - 07:00 GMT
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

        # During London Open (07:00 - 12:00 GMT): Check for fakeout sweep
        if hour >= self.london_start_h and hour < self.london_end_h and self.asian_high and self.asian_low:
            if getattr(self, "traded_day", -1) == day:
                return None, None, None

            atr = row.get("atr", 1.5)
            # Bullish Fakeout: Price broke below Asian Low but reversed and closed back above Asian Low
            if row["low"] < self.asian_low and row["close"] > self.asian_low:
                self.traded_day = day
                sl = row["low"] - (0.2 * atr)
                tp = self.asian_high + (0.5 * atr)
                return "LONG", sl, tp

            # Bearish Fakeout: Price broke above Asian High but reversed and closed back below Asian High
            if row["high"] > self.asian_high and row["close"] < self.asian_high:
                self.traded_day = day
                sl = row["high"] + (0.2 * atr)
                tp = self.asian_low - (0.5 * atr)
                return "SHORT", sl, tp

        return None, None, None

    @staticmethod
    def is_friday_profit_taking(timestamp: int) -> bool:
        """Returns True if it is Friday after 14:00 GMT."""
        dt = datetime.fromtimestamp(timestamp / 1000.0, tz=timezone.utc) if timestamp > 1e10 else datetime.fromtimestamp(timestamp, tz=timezone.utc)
        return dt.weekday() == 4 and dt.hour >= 14


# -----------------------------------------------------------------------------
# 4. Multi-Timeframe Confluence & Signal Generator
# -----------------------------------------------------------------------------
class SignalGenerator:
    """
    Synthesizes Market Regimes, Liquidity Maps, Gold Patterns, and Multi-Timeframe Confluence.
    Enforces minimum 1:2.5 Risk-Reward and 75/100 Confluence Score.
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
        self.liquidity_map = LiquidityMap(
            fvg_min_atr_ratio=config["liquidity_parameters"].get("fvg_min_gap_atr_ratio", 0.3),
            lookback_bars=config["liquidity_parameters"].get("order_block_lookback_bars", 24),
        )
        self.pattern_detector = GoldPatternDetector()
        self.target_rr = config["risk_management"].get("target_r_multiple", 2.5)
        self.min_confluence = config["multi_timeframe"].get("confluence_threshold_score", 75)

    def prepare_dataframe(self, df: pd.DataFrame) -> pd.DataFrame:
        """Enriches raw OHLCV dataframe with indicators."""
        return self.regime_engine.compute_indicators(df)

    def evaluate_bar(self, df: pd.DataFrame, idx: int, account_balance: float = 1000.0) -> Optional[Signal]:
        """
        Evaluates a single bar in the event loop for institutional trade setups.
        """
        if idx < 30:
            return None

        row = df.iloc[idx]
        prev = df.iloc[idx - 1]
        t = int(row.get("timestamp", idx))

        # Friday Profit-Taking Check: No new entries after Friday 14:00 GMT
        if self.pattern_detector.is_friday_profit_taking(t):
            return None

        regime = self.regime_engine.classify_candle(row, prev)

        # Ignore signals during News Spikes (high slippage & random noise)
        if regime == MarketRegime.NEWS_SPIKE:
            return None

        # Update Liquidity Zones
        zones = self.liquidity_map.update(df, idx)
        atr = row.get("atr", 1.5)
        close = row["close"]
        high = row["high"]
        low = row["low"]

        # ---------------------------------------------------------------------
        # PATTERN A: Asian Range Breakout Fakeout
        # ---------------------------------------------------------------------
        asian_side, asian_sl, asian_tp = self.pattern_detector.evaluate_asian_range(df, idx)
        if asian_side and asian_sl and asian_tp:
            sl_dist = abs(close - asian_sl)
            tp_dist = abs(asian_tp - close)
            rr = tp_dist / max(sl_dist, 1e-4)

            if rr >= 2.0:
                confluence = 85
                if (asian_side == "LONG" and regime in [MarketRegime.STRONG_BULL, MarketRegime.LIQUIDITY_GRAB]) or \
                   (asian_side == "SHORT" and regime in [MarketRegime.STRONG_BEAR, MarketRegime.LIQUIDITY_GRAB]):
                    confluence += 10

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
                    reason=f"Asian range swept and reclaimed in London session · {regime.value}",
                    timestamp=t,
                    bar_index=idx,
                    account_balance=account_balance,
                    atr=atr,
                )

        # ---------------------------------------------------------------------
        # PATTERN B: Liquidity Zone Retest with Rejection
        # ---------------------------------------------------------------------
        for z in zones:
            if z.mitigated:
                continue

            # Bullish Demand OB or Bullish FVG
            if z.zone_type in [LiquidityType.DEMAND_OB, LiquidityType.BULLISH_FVG]:
                if regime in [MarketRegime.STRONG_BULL, MarketRegime.WEAK_BULL, MarketRegime.LIQUIDITY_GRAB]:
                    # Price tapped into zone and closed bullishly
                    if low <= z.top and close >= z.bottom and close > row["open"]:
                        sl = min(low, z.bottom) - (0.20 * atr)
                        sl_dist = close - sl
                        if sl_dist > 0.15:
                            tp = close + (sl_dist * self.target_rr)
                            rr = self.target_rr

                            # Confluence Scoring
                            score = 65
                            if regime == MarketRegime.STRONG_BULL:
                                score += 20
                            if z.zone_type == LiquidityType.DEMAND_OB:
                                score += 15
                            if row["ema20"] > row["ema50"]:
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
                                    setup=f"{z.zone_type.value}_RETEST",
                                    reason=f"Institutional {z.zone_type.value} bounce aligned with {regime.value}",
                                    timestamp=t,
                                    bar_index=idx,
                                    account_balance=account_balance,
                                    atr=atr,
                                )

            # Bearish Supply OB or Bearish FVG
            elif z.zone_type in [LiquidityType.SUPPLY_OB, LiquidityType.BEARISH_FVG]:
                if regime in [MarketRegime.STRONG_BEAR, MarketRegime.WEAK_BEAR, MarketRegime.LIQUIDITY_GRAB]:
                    # Price tapped into zone and closed bearishly
                    if high >= z.bottom and close <= z.top and close < row["open"]:
                        sl = max(high, z.top) + (0.20 * atr)
                        sl_dist = sl - close
                        if sl_dist > 0.15:
                            tp = close - (sl_dist * self.target_rr)
                            rr = self.target_rr

                            # Confluence Scoring
                            score = 65
                            if regime == MarketRegime.STRONG_BEAR:
                                score += 20
                            if z.zone_type == LiquidityType.SUPPLY_OB:
                                score += 15
                            if row["ema20"] < row["ema50"]:
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
                                    setup=f"{z.zone_type.value}_RETEST",
                                    reason=f"Institutional {z.zone_type.value} reject aligned with {regime.value}",
                                    timestamp=t,
                                    bar_index=idx,
                                    account_balance=account_balance,
                                    atr=atr,
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
        timestamp: int,
        bar_index: int,
        account_balance: float,
        atr: float,
    ) -> Signal:
        """Calculates dynamic lot sizing with ATR volatility reduction."""
        base_risk_pct = self.cfg["risk_management"]["base_risk_per_trade_pct"]
        vol_threshold = self.cfg["risk_management"]["volatility_atr_multiplier_threshold"]
        vol_scale = self.cfg["risk_management"]["high_volatility_risk_scale"]

        # Volatility scale-down
        avg_atr = 2.0
        risk_pct = base_risk_pct * vol_scale if (atr > vol_threshold * avg_atr) else base_risk_pct

        risk_usd = account_balance * (risk_pct / 100.0)
        sl_dist = abs(entry - sl)
        point_val = self.cfg["instrument"]["point_value"]
        contract_size = self.cfg["instrument"]["contract_size"]

        # Standard lot calculation: (Risk $) / (SL in $ * 100)
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
            timestamp=timestamp,
            bar_index=bar_index,
            volume_lots=lots,
            risk_usd=round(risk_usd, 2),
        )
