"""
advanced_backtest_engine.py — SafeScalperPro Event-Driven Backtesting Engine
Simulates real-world order execution, dynamic spreads, commission, slippage,
auto-breakeven, partial scale-outs, and computes Sharpe, Sortino, Drawdown, and MFE/MAE.
"""

import json
import math
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
import numpy as np
import pandas as pd

from gold_strategy_core import MarketRegime, Signal, SignalGenerator


@dataclass
class TradeRecord:
    ticket: int
    symbol: str
    side: str
    entry_time: int
    entry_price: float
    exit_time: Optional[int] = None
    exit_price: Optional[float] = None
    sl: float = 0.0
    tp: float = 0.0
    initial_sl: float = 0.0
    volume: float = 0.0
    risk_usd: float = 0.0
    pnl: float = 0.0
    commission: float = 0.0
    slippage: float = 0.0
    r_multiple: float = 0.0
    outcome: str = "OPEN"  # "TP", "SL", "PARTIAL_TP", "TIME_STOP", "MANUAL"
    setup_name: str = ""
    regime: str = ""
    is_breakeven: bool = False
    is_partial_closed: bool = False
    max_favorable_excursion: float = 0.0  # MFE
    max_adverse_excursion: float = 0.0    # MAE
    duration_minutes: int = 0


class AdvancedBacktestEngine:
    """
    Event-driven simulation engine modeling realistic execution dynamics.
    """

    def __init__(self, config_path: str = "strategy_config.json"):
        with open(config_path, "r") as f:
            self.cfg = json.load(f)

        self.initial_balance = self.cfg["risk_management"]["account_balance"]
        self.balance = self.initial_balance
        self.equity_curve: List[float] = [self.initial_balance]
        self.timestamps: List[int] = []
        self.trades: List[TradeRecord] = []
        self.active_trade: Optional[TradeRecord] = None
        self.ticket_counter = 777000

        # Risk parameters
        self.max_daily_loss_pct = self.cfg["safe_scalper_pro"]["daily_loss_percent"]

        # Cost parameters
        self.point_value = self.cfg["instrument"]["point_value"]
        self.contract_size = self.cfg["instrument"]["contract_size"]
        self.spread_pts_std = self.cfg["execution_costs"]["spread_points_standard"]
        self.spread_pts_news = self.cfg["execution_costs"]["spread_points_news"]
        self.comm_per_lot = self.cfg["execution_costs"]["commission_per_lot_round_turn"]
        self.slip_pts_std = self.cfg["execution_costs"]["slippage_points_standard"]
        self.slip_pts_news = self.cfg["execution_costs"]["slippage_points_news"]

        # Daily state tracking
        self.current_day = -1
        self.daily_start_balance = self.initial_balance
        self.daily_halted = False
        self.consecutive_losses = 0
        self.safe_cfg = self.cfg.get("safe_scalper_pro", {})
        self.daily_trade_count = 0
        self.peak_balance = self.initial_balance
        self.drawdown_halted = False
        self.daily_gross_loss = 0.

    def run(self, df: pd.DataFrame) -> Dict[str, Any]:
        """
        Runs full event-driven backtest over the provided OHLCV dataset.
        """
        signal_gen = SignalGenerator(self.cfg)
        enriched_df = signal_gen.prepare_dataframe(df)

        print(f"[*] Starting Event-Driven Backtest on {len(enriched_df)} bars...")

        for i in range(len(enriched_df)):
            row = enriched_df.iloc[i]
            t = int(row.get("timestamp", i))
            day_idx = int(t // 86400000) if t > 1e10 else int(t // 86400)

            # Daily Rollover Check
            if day_idx != self.current_day:
                self.current_day = day_idx
                self.daily_start_balance = self.balance
                self.daily_halted = False
                self.daily_trade_count = 0
                self.consecutive_losses = 0
                self.daily_gross_loss = 0.

            # Check daily loss limit kill switch
            daily_loss = self.daily_gross_loss
            if daily_loss >= (self.max_daily_loss_pct / 100.0) * self.daily_start_balance:
                self.daily_halted = True
            self.peak_balance = max(self.peak_balance, self.balance)
            if self.safe_cfg.get("enabled", False):
                max_dd = float(self.safe_cfg.get("max_drawdown_pct", 8.0))
                if self.peak_balance > 0 and (self.peak_balance - self.balance) / self.peak_balance * 100.0 >= max_dd:
                    self.drawdown_halted = True

            # 1. Manage Active Trade on Current Bar
            if self.active_trade:
                self._manage_trade(row, i)
                if self.daily_gross_loss >= self.daily_start_balance * self.max_daily_loss_pct / 100:
                    self.daily_halted = True
                if (self.peak_balance - self.balance) / self.peak_balance * 100 >= self.safe_cfg["max_drawdown_pct"]:
                    self.drawdown_halted = True

            # 2. Evaluate New Signal if no active trade and not halted
            safe_day_cap = int(self.safe_cfg.get("max_day_trades", 4)) if self.safe_cfg.get("enabled", False) else 10**9
            if not self.active_trade and not self.daily_halted and not self.drawdown_halted and self.daily_trade_count < safe_day_cap:
                sig = signal_gen.evaluate_bar(enriched_df, i, self.balance)
                if sig:
                    self._execute_signal(sig, row, i)

            mark = self.balance
            if self.active_trade:
                trade = self.active_trade
                mark += (1 if trade.side == "LONG" else -1) * (float(row["close"]) - trade.entry_price) * trade.volume * self.contract_size - trade.commission
            self.peak_balance = max(self.peak_balance, mark)
            if (self.peak_balance - mark) / self.peak_balance * 100 >= self.safe_cfg["max_drawdown_pct"]:
                self.drawdown_halted = True
            self.equity_curve.append(mark)
            self.timestamps.append(t)

        # Close any lingering open trade at final bar
        if self.active_trade:
            last_row = enriched_df.iloc[-1]
            self._close_trade(last_row["close"], int(last_row.get("timestamp", len(enriched_df))), "MANUAL_CLOSE")

        self.equity_curve[-1] = self.balance
        metrics = self._compute_performance_metrics()
        print(f"[OK] Backtest Complete: Net P&L ${metrics['net_profit']:,.2f} | Profit Factor: {metrics['profit_factor']:.2f} | Sharpe: {metrics['sharpe_ratio']:.2f}")
        return metrics

    def _execute_signal(self, sig: Signal, row: pd.Series, idx: int):
        """Simulates order placement with realistic spread and slippage."""
        self.ticket_counter += 1
        is_news = (sig.regime == MarketRegime.NEWS_SPIKE)
        spread = float(row.get("spread", self.spread_pts_news if is_news else self.spread_pts_std)) * self.point_value
        slippage = (self.slip_pts_news if is_news else self.slip_pts_std) * self.point_value

        # Long buys at Ask + slippage; Short sells at Bid - slippage
        entry_price = (sig.entry + (spread / 2.0) + slippage) if sig.side == "LONG" else (sig.entry - (spread / 2.0) - slippage)
        # Re-size after actual modeled entry costs; never exceed approved equity risk.
        per_lot_loss = abs(entry_price - sig.sl) * self.contract_size + self.comm_per_lot
        budget = min(sig.risk_usd, self.balance * self.safe_cfg["risk_percent"] / 100)
        step = self.cfg["instrument"]["volume_step"]
        volume = math.floor((min(sig.volume_lots, budget / per_lot_loss) + 1e-12) / step) * step
        if volume < self.cfg["instrument"]["volume_min"]:
            return
        commission = volume * self.comm_per_lot

        trade = TradeRecord(
            ticket=self.ticket_counter,
            symbol=sig.symbol,
            side=sig.side,
            entry_time=sig.timestamp,
            entry_price=entry_price,
            sl=sig.sl,
            tp=sig.tp,
            initial_sl=sig.sl,
            volume=volume,
            risk_usd=per_lot_loss * volume,
            commission=commission,
            slippage=round(slippage, 4),
            setup_name=sig.setup_name,
            regime=sig.regime.value,
        )
        self.active_trade = trade
        self.daily_trade_count += 1

    def _manage_trade(self, row: pd.Series, idx: int):
        """Manages open position (SL, TP, Breakeven, Partial TP, Time Stop)."""
        t = self.active_trade
        if not t:
            return

        high = row["high"]
        low = row["low"]
        bar_time = int(row.get("timestamp", idx))
        initial_risk_dist = abs(t.entry_price - t.initial_sl)

        # Excursion Tracking (MFE / MAE)
        if t.side == "LONG":
            fav = high - t.entry_price
            adv = t.entry_price - low
        else:
            fav = t.entry_price - low
            adv = high - t.entry_price

        t.max_favorable_excursion = max(t.max_favorable_excursion, fav)
        t.max_adverse_excursion = max(t.max_adverse_excursion, adv)

        # 1. Check Stop Loss (Conservative: SL checked before TP on same bar)
        if t.side == "LONG" and low <= t.sl:
            self._close_trade(min(t.sl, row["open"]), bar_time, "SL")
            return
        elif t.side == "SHORT" and high >= t.sl:
            self._close_trade(max(t.sl, row["open"]), bar_time, "SL")
            return

        # Conservative stop-first OHLC execution. Final TP precedes advanced management.
        if (t.side == "LONG" and high >= t.tp) or (t.side == "SHORT" and low <= t.tp):
            self._close_trade(t.tp, bar_time, "TP")
            return
        if t.setup_name == "SAFE_SCALPER_PRO_7_GATE":
            point = float(self.cfg["instrument"].get("point_value", 0.01))
            point_scale = 0.1 if self.safe_cfg.get("auto_adjust_two_digit_gold", True) and int(self.cfg["instrument"].get("digits", 2)) == 2 and self.cfg["instrument"]["symbol"].startswith("XAU") else 1.0
            favorable = (high - t.entry_price) if t.side == "LONG" else (t.entry_price - low)
            be_trigger = float(self.safe_cfg.get("breakeven_start_points", 150)) * point * point_scale
            be_offset = float(self.safe_cfg.get("breakeven_offset_points", 20)) * point * point_scale
            if not t.is_breakeven and favorable >= be_trigger:
                t.sl = t.entry_price + be_offset if t.side == "LONG" else t.entry_price - be_offset
                t.is_breakeven = True

            partial_trigger = float(self.safe_cfg.get("partial_tp_points", 200)) * point * point_scale
            if not t.is_partial_closed and favorable >= partial_trigger:
                ratio = float(self.safe_cfg.get("partial_close_percent", 50.0)) / 100.0
                step = self.cfg["instrument"]["volume_step"]
                minimum = self.cfg["instrument"]["volume_min"]
                partial_vol = math.floor((t.volume * ratio) / step + 1e-9) * step
                if partial_vol + 1e-12 >= minimum and t.volume - partial_vol + 1e-12 >= minimum:
                    partial_exit = t.entry_price + partial_trigger if t.side == "LONG" else t.entry_price - partial_trigger
                    partial_pnl = (partial_exit - t.entry_price) * partial_vol * self.contract_size if t.side == "LONG" else (t.entry_price - partial_exit) * partial_vol * self.contract_size
                    self.balance += partial_pnl
                    t.volume -= partial_vol
                    t.pnl += partial_pnl
                    t.is_partial_closed = True

            trailing_trigger = float(self.safe_cfg.get("trailing_start_points", 200)) * point * point_scale
            trailing_step = float(self.safe_cfg.get("trailing_step_points", 100)) * point * point_scale
            if favorable >= trailing_trigger:
                candidate = high - trailing_step if t.side == "LONG" else low + trailing_step
                if (t.side == "LONG" and candidate > t.sl) or (t.side == "SHORT" and candidate < t.sl):
                    t.sl = candidate

            if t.side == "LONG" and high >= t.tp:
                self._close_trade(t.tp, bar_time, "TP")
                return
            if t.side == "SHORT" and low <= t.tp:
                self._close_trade(t.tp, bar_time, "TP")
                return
            return

    def _close_trade(self, exit_price: float, exit_time: int, outcome: str):
        """Closes active trade, applies commission & updates balance."""
        t = self.active_trade
        if not t:
            return

        pnl = (exit_price - t.entry_price) * t.volume * self.contract_size if t.side == "LONG" else (t.entry_price - exit_price) * t.volume * self.contract_size
        net_pnl = (t.pnl + pnl) - t.commission

        t.exit_time = exit_time
        t.exit_price = round(exit_price, 2)
        t.pnl = round(net_pnl, 2)
        t.outcome = outcome
        initial_risk = max(t.risk_usd, 1e-12)
        t.r_multiple = round(net_pnl / initial_risk, 2)

        elapsed = (exit_time - t.entry_time) / 60000.0 if exit_time > 1e10 else (exit_time - t.entry_time) / 60.0
        t.duration_minutes = int(elapsed)

        self.balance += pnl - t.commission
        self.trades.append(t)
        self.active_trade = None

        if net_pnl < 0:
            self.daily_gross_loss += abs(net_pnl)
            self.consecutive_losses += 1
        else:
            self.consecutive_losses = 0

    def _compute_performance_metrics(self) -> Dict[str, Any]:
        """Calculates comprehensive strategy performance statistics."""
        if not self.trades:
            return {
                "initial_balance": self.initial_balance,
                "final_balance": self.balance,
                "net_profit": 0.0,
                "return_pct": 0.0,
                "total_trades": 0,
                "win_count": 0,
                "loss_count": 0,
                "win_rate": 0.0,
                "profit_factor": 0.0,
                "max_drawdown_pct": 0.0,
                "max_drawdown_usd": 0.0,
                "recovery_factor": 0.0,
                "sharpe_ratio": 0.0,
                "sortino_ratio": 0.0,
                "avg_win_usd": 0.0,
                "avg_loss_usd": 0.0,
                "avg_rr_ratio": 0.0,
                "expectancy_usd": 0.0,
                "trades": [],
                "equity_curve": self.equity_curve,
            }

        pnls = [t.pnl for t in self.trades]
        wins = [p for p in pnls if p > 0]
        losses = [abs(p) for p in pnls if p < 0]

        total_trades = len(self.trades)
        win_count = len(wins)
        loss_count = len(losses)
        win_rate = (win_count / total_trades) * 100.0 if total_trades > 0 else 0.0

        gross_profit = sum(wins)
        gross_loss = sum(losses)
        net_profit = self.balance - self.initial_balance
        profit_factor = gross_profit / gross_loss if gross_loss > 0 else (math.inf if gross_profit > 0 else 0.0)

        # Equity Drawdown
        eq = np.array(self.equity_curve)
        peaks = np.maximum.accumulate(eq)
        drawdowns = (peaks - eq) / peaks
        max_dd_pct = float(np.max(drawdowns)) * 100.0
        max_dd_usd = float(np.max(peaks - eq))
        recovery_factor = (net_profit / (max_dd_usd + 1e-9)) if max_dd_usd > 0 else 0.0

        # Sharpe & Sortino Ratio
        returns = np.diff(eq) / (eq[:-1] + 1e-9)
        sharpe = float(np.mean(returns) / (np.std(returns) + 1e-9) * np.sqrt(252 * 24)) if np.std(returns) > 0 else 0.0
        downside_returns = returns[returns < 0]
        sortino = float(np.mean(returns) / (np.std(downside_returns) + 1e-9) * np.sqrt(252 * 24)) if len(downside_returns) > 0 and np.std(downside_returns) > 0 else 0.0

        # Average R:R
        avg_win = float(np.mean(wins)) if wins else 0.0
        avg_loss = float(np.mean(losses)) if losses else 0.0
        avg_rr = (avg_win / (avg_loss + 1e-9)) if avg_loss > 0 else 0.0

        # Expected Value
        expectancy = (win_rate / 100.0 * avg_win) - ((1.0 - (win_rate / 100.0)) * avg_loss)

        return {
            "initial_balance": self.initial_balance,
            "final_balance": round(self.balance, 2),
            "net_profit": round(net_profit, 2),
            "return_pct": round((net_profit / self.initial_balance) * 100.0, 2),
            "total_trades": total_trades,
            "win_count": win_count,
            "loss_count": loss_count,
            "win_rate": round(win_rate, 2),
            "profit_factor": round(profit_factor, 2),
            "max_drawdown_pct": round(max_dd_pct, 2),
            "max_drawdown_usd": round(max_dd_usd, 2),
            "recovery_factor": round(recovery_factor, 2),
            "sharpe_ratio": round(sharpe, 2),
            "sortino_ratio": round(sortino, 2),
            "avg_win_usd": round(avg_win, 2),
            "avg_loss_usd": round(avg_loss, 2),
            "avg_rr_ratio": round(avg_rr, 2),
            "expectancy_usd": round(expectancy, 2),
            "trades": self.trades,
            "equity_curve": self.equity_curve,
        }
