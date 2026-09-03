import raw from "../../strategy_config.json";
import type { SafeScalperConfig } from "./types";

// JSON is authoritative; browser overrides may only tighten or adjust paper settings.
const s = raw.safe_scalper_pro;
export const ACCOUNT_BALANCE = raw.risk_management.account_balance;
export const COMMISSION_PER_LOT =
  raw.execution_costs.commission_per_lot_round_turn;
export const MAX_DEVIATION_POINTS = raw.execution.max_deviation_points;
export const SAFE_DEFAULTS: SafeScalperConfig = {
  magicNumber: s.magic_number,
  riskPercent: s.risk_percent,
  dailyLossPercent: s.daily_loss_percent,
  maxDrawdownPercent: s.max_drawdown_pct,
  maxDailyTrades: s.max_day_trades,
  maxMarginPercent: s.max_margin_percent,
  stopLossPoints: s.stop_loss_points,
  takeProfitPoints: s.take_profit_points,
  autoAdjustTwoDigitGold: s.auto_adjust_two_digit_gold,
  stopBufferPoints: raw.execution.broker_stop_buffer_points,
  useBreakeven: true,
  breakevenStartPoints: s.breakeven_start_points,
  breakevenOffsetPoints: s.breakeven_offset_points,
  useTrailing: true,
  trailStartPoints: s.trailing_start_points,
  trailStepPoints: s.trailing_step_points,
  usePartialClose: true,
  tp1Points: s.partial_tp_points,
  tp1ClosePercent: s.partial_close_percent,
  emaFast: s.ema_fast,
  emaSlow: s.ema_slow,
  trendStrengthAtr: s.trend_strength_atr,
  useMtf: s.use_mtf,
  mtfEmaFast: s.mtf_ema_fast,
  mtfEmaSlow: s.mtf_ema_slow,
  rsiPeriod: s.rsi_period,
  rsiBuyMin: s.rsi_buy_min,
  rsiBuyMax: s.rsi_buy_max,
  rsiSellMin: s.rsi_sell_min,
  rsiSellMax: s.rsi_sell_max,
  breakoutLookback: s.breakout_lookback,
  breakoutBufferAtr: s.breakout_buffer_atr,
  atrPeriod: s.atr_period,
  sessionStartHour: s.session_start_hour_utc,
  sessionEndHour: s.session_end_hour_utc,
  fridayCutoffHour: s.friday_cutoff_hour_utc,
  maxSpreadPoints: s.max_spread_points,
  maxSpreadToStopPercent: s.max_spread_to_stop_percent,
  newsMinsBefore: raw.execution.news_minutes_before,
  newsMinsAfter: raw.execution.news_minutes_after,
};
