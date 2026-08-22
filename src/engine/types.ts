export interface Bar {
  t: number; // epoch ms
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  day: number; // day index
}

export type CandleClass =
  | "LPR"
  | "HPR"
  | "POWER_BULL"
  | "POWER_BEAR"
  | "BORING"
  | "NEUTRAL";

export type AoiKind =
  | "PDH"
  | "PDL"
  | "CDH"
  | "CDL"
  | "TT"
  | "TB"
  | "OB_D"
  | "OB_S"
  | "LON_H"
  | "LON_L"
  | "NY_H"
  | "NY_L"
  | "OVL_H"
  | "OVL_L";

export interface Aoi {
  kind: AoiKind;
  role: "R" | "S"; // resistance / support
  y1: number; // zone bottom (== y for lines)
  y2: number; // zone top (== y for lines)
  ty: number; // trigger level (the edge that gets swept)
  from: number; // bar index where zone formed
  label: string;
  active: boolean;
}

export interface Trade {
  id: number;
  side: "LONG" | "SHORT";
  setup: string; // e.g. "TRAP · PDL"
  family: string; // AOI family: DAY EXTREMES / TRIPLES / ORDER BLOCKS / SESSIONS
  identity: "reversal" | "breakout";
  entryIndex: number;
  entryTime: number;
  entry: number;
  sl: number;
  tp: number;
  oz: number; // position size
  risk: number; // USD risked
  exitIndex?: number;
  exitTime?: number;
  exit?: number;
  pnl?: number;
  r?: number;
  outcome?: "TP" | "SL";
  open: boolean;
  isBreakeven?: boolean;
  partialClosed?: boolean;
  partialRealized?: number;
  notes?: string;
  slippage?: number;
  trailActive?: boolean;
  trailSl?: number;
  trailStop?: number;
  partialLock_50?: boolean;
}

export interface EngineEvent {
  id: number;
  time: number;
  tag: "ENTRY" | "SL" | "TP" | "SYS" | "AOI" | "RISK" | "HOLD" | "DECIDE";
  msg: string;
  tone: "long" | "short" | "sys" | "risk" | "aoi";
}

export type Timeframe = "1m" | "5m" | "15m" | "30m" | "1h" | "4h";

export const TIMEFRAMES: { label: Timeframe; name: string; ms: number }[] = [
  { label: "1m", name: "1 Minute", ms: 60 * 1000 },
  { label: "5m", name: "5 Minutes", ms: 5 * 60 * 1000 },
  { label: "15m", name: "15 Minutes", ms: 15 * 60 * 1000 },
  { label: "30m", name: "30 Minutes", ms: 30 * 60 * 1000 },
  { label: "1h", name: "1 Hour", ms: 60 * 60 * 1000 },
  { label: "4h", name: "4 Hours", ms: 4 * 60 * 60 * 1000 },
];

export interface SymbolMeta {
  symbol: string;
  label: string;
  source: string;
  category: "METALS" | "CRYPTO" | "FOREX";
  digits: number;
  pointValue: number; // USD P&L per 1.00 move per unit
  spread: number;
  binanceSymbol?: string;
  tvSymbol: string;
}

export const SUPPORTED_SYMBOLS: SymbolMeta[] = [
  {
    symbol: "XAUUSD",
    label: "Gold Spot / U.S. Dollar",
    source: "OANDA",
    category: "METALS",
    digits: 2,
    pointValue: 1.0, // $1.00 per oz
    spread: 0.35,
    binanceSymbol: "PAXGUSDT", // 1 PAXG = 1 troy oz fine gold
    tvSymbol: "OANDA:XAUUSD",
  },
  {
    symbol: "BTCUSDT",
    label: "BTC / U.S. Dollar",
    source: "BINANCE",
    category: "CRYPTO",
    digits: 2,
    pointValue: 1.0,
    spread: 1.5,
    binanceSymbol: "BTCUSDT",
    tvSymbol: "BINANCE:BTCUSDT",
  },
  {
    symbol: "ETHUSDT",
    label: "ETH / U.S. Dollar",
    source: "BINANCE",
    category: "CRYPTO",
    digits: 2,
    pointValue: 1.0,
    spread: 0.2,
    binanceSymbol: "ETHUSDT",
    tvSymbol: "BINANCE:ETHUSDT",
  },
  {
    symbol: "EURUSD",
    label: "EUR / U.S. Dollar",
    source: "FX_IDC",
    category: "FOREX",
    digits: 5,
    pointValue: 100000,
    spread: 0.00015,
    binanceSymbol: "EURUSDT",
    tvSymbol: "FX_IDC:EURUSD",
  },
];

export interface BrokerConfig {
  mt5Enabled: boolean;
  mt5Url: string;
  mt5Secret: string;
  telegramEnabled: boolean;
  telegramToken: string;
  telegramChatId: string;
  webhookEnabled: boolean;
  webhookUrl: string;
  autoDispatch: boolean;
}

export const DEFAULT_BROKER_CFG: BrokerConfig = {
  mt5Enabled: true,
  mt5Url: "http://localhost:8000/webhook",
  mt5Secret: "TF-SECRET-KEY",
  telegramEnabled: false,
  telegramToken: "",
  telegramChatId: "",
  webhookEnabled: false,
  webhookUrl: "",
  autoDispatch: false,
};

export interface QueueItem {
  id: number;
  time: number;
  side: "LONG" | "SHORT";
  setup: string;
  family: string;
  entry: number;
  sl: number;
  tp: number;
  oz: number;
  risk: number;
  aoiKey: string;
  aoiLabel: string;
  entryIndex: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reason?: "USER" | "EXPIRED";
  result?: "MISSED_TP" | "AVOIDED_SL" | "FLAT";
  dispatchStatus?: "IDLE" | "SENDING" | "SENT" | "FAILED";
  dispatchMsg?: string;
}

export interface CheckStep {
  k: string;
  ok: boolean | null;
  v: string;
}

export interface LastEval {
  cls: CandleClass;
  checks: CheckStep[];
  verdict: string;
}

export interface AoiFlags {
  pdh: boolean;
  triple: boolean;
  ob: boolean;
  session: boolean;
}

export type SizingMode = "fixedUSD" | "percentEquity" | "fractionalKelly";

export type DashboardView =
  | "terminal"
  | "signals"
  | "strategyLab"
  | "academy"
  | "risk"
  | "settings";

export type StrategyId =
  | "sweep_reversal"
  | "ob_fvg_retest"
  | "session_breakout"
  | "ema_pullback"
  | "rsi_exhaustion";

export type StrategyExecutionMode = "single" | "multi_confluence";

export interface StrategyDefinition {
  id: StrategyId;
  name: string;
  shortName: string;
  tag: string;
  category: "LIQUIDITY" | "ORDER_FLOW" | "MOMENTUM" | "TREND" | "MEAN_REVERSION";
  description: string;
  winRateEst: string;
  rrTarget: string;
  idealMarket: string;
  rules: string[];
  bullishSetup: {
    title: string;
    summary: string;
    entryTrigger: string;
    slPlacement: string;
    tpPlacement: string;
  };
  bearishSetup: {
    title: string;
    summary: string;
    entryTrigger: string;
    slPlacement: string;
    tpPlacement: string;
  };
}

export const STRATEGY_DEFINITIONS: StrategyDefinition[] = [
  {
    id: "sweep_reversal",
    name: "ICT Liquidity Sweep & Pin Rejection Trap",
    shortName: "Sweep Reversal Trap",
    tag: "CORE · HIGH WIN RATE",
    category: "LIQUIDITY",
    description: "Hunts false breakouts at key levels (PDH/PDL, Session Highs/Lows). Enters when price sweeps liquidity outside the zone and violently rejects back inside with a long pin rejection (LPR/HPR) wick.",
    winRateEst: "64% - 72%",
    rrTarget: "1:2.0 - 1:2.5",
    idealMarket: "Ranging & Accumulation/Distribution phases",
    rules: [
      "Level Detection: Price approaches Prior Day High/Low, Session Extreme, or Triple Top/Bottom.",
      "Liquidity Hunt: Candle wicks past the extreme, triggering stop losses and breakout orders.",
      "Rejection Math: Candle snaps back inside with rejection wick >= 45% of total candle range.",
      "Risk Floor: Enforces minimum 1:2.0 Risk-to-Reward with SL placed 2-4 ticks beyond the sweep wick tip.",
    ],
    bullishSetup: {
      title: "Bullish Liquidity Trap (PDL / Session Low Sweep)",
      summary: "Price sweeps below Prior Day Low (PDL) or London Low, grabs sell-side liquidity, and closes back above with a long lower wick (LPR).",
      entryTrigger: "Buy Market at candle close once rejection is confirmed.",
      slPlacement: "Stop Loss set 1-2 points below lowest wick tip.",
      tpPlacement: "Take Profit set at 1:2.0 R:R or opposite session high.",
    },
    bearishSetup: {
      title: "Bearish Liquidity Trap (PDH / Session High Sweep)",
      summary: "Price sweeps above Prior Day High (PDH) or Asian High, grabs buy-side liquidity, and closes back below with a long upper wick (HPR).",
      entryTrigger: "Sell Market at candle close once rejection is confirmed.",
      slPlacement: "Stop Loss set 1-2 points above highest wick tip.",
      tpPlacement: "Take Profit set at 1:2.0 R:R or opposite session low.",
    },
  },
  {
    id: "ob_fvg_retest",
    name: "Institutional Order Block & Fair Value Gap Retest",
    shortName: "OB + FVG Mitigation",
    tag: "SMART MONEY · HIGH R",
    category: "ORDER_FLOW",
    description: "Identifies 3-candle institutional displacement creating a Fair Value Gap (imbalance). Enters when price pulls back into the unmitigated Order Block zone to fill liquidity.",
    winRateEst: "58% - 66%",
    rrTarget: "1:2.5 - 1:3.5",
    idealMarket: "Displacement trends & institutional expansion",
    rules: [
      "Displacement: Powerful 3-candle move creates a Fair Value Gap (FVG) >= 0.15 ATR.",
      "Order Block: The last opposite candle before displacement marks the institutional block.",
      "Pullback: Price retraces back into the Order Block zone without breaking the origin low/high.",
      "Confirmation: Entry upon first rejection touch with SL outside the Order Block boundary.",
    ],
    bullishSetup: {
      title: "Demand Order Block Retest",
      summary: "Bullish FVG created after strong green displacement. Price pulls back into the demand OB zone and bounces.",
      entryTrigger: "Buy upon touch or rejection inside the green Demand OB box.",
      slPlacement: "Stop Loss just below the bottom of the Order Block.",
      tpPlacement: "Take Profit at recent swing high (1:2.5+ R:R).",
    },
    bearishSetup: {
      title: "Supply Order Block Retest",
      summary: "Bearish FVG created after strong red displacement. Price pulls back into the supply OB zone and rejects.",
      entryTrigger: "Sell upon touch or rejection inside the red Supply OB box.",
      slPlacement: "Stop Loss just above the top of the Order Block.",
      tpPlacement: "Take Profit at recent swing low (1:2.5+ R:R).",
    },
  },
  {
    id: "session_breakout",
    name: "Session Momentum Breakout (London / NY Open Drive)",
    shortName: "Session Open Breakout",
    tag: "HIGH VOLATILITY",
    category: "MOMENTUM",
    description: "Captures institutional volume injection during London Open (07:00 UTC) and New York Open (12:00 UTC). Enters on high-volume expansion candles breaking out of Asian/Session consolidation.",
    winRateEst: "55% - 62%",
    rrTarget: "1:2.0 - 1:3.0",
    idealMarket: "Session opening hours & London/NY Overlap",
    rules: [
      "Session Window: Active during London (07-10 UTC) or NY (12-15 UTC) market open.",
      "Power Candle: High-volume candle closes cleanly beyond the consolidation range.",
      "ATR Surge: Candle body >= 1.2x ATR indicating genuine institutional participation.",
      "Discipline: Skip entries if the move is already over-extended (> 3.5x ATR from open).",
    ],
    bullishSetup: {
      title: "London/NY Bullish Open Drive",
      summary: "Strong green power candle breaks above Asian range high with volume surge at market open.",
      entryTrigger: "Buy Market on clean candle close above session range.",
      slPlacement: "Stop Loss below breakout candle midpoint or low.",
      tpPlacement: "Take Profit at 1:2.0 R:R or Daily R1/R2.",
    },
    bearishSetup: {
      title: "London/NY Bearish Open Drive",
      summary: "Strong red power candle breaks below Asian range low with volume surge at market open.",
      entryTrigger: "Sell Market on clean candle close below session range.",
      slPlacement: "Stop Loss above breakout candle midpoint or high.",
      tpPlacement: "Take Profit at 1:2.0 R:R or Daily S1/S2.",
    },
  },
  {
    id: "ema_pullback",
    name: "EMA 20/50 Dynamic Trend Pullback",
    shortName: "EMA Trend Confluence",
    tag: "TREND FOLLOWING",
    category: "TREND",
    description: "Institutional trend continuation setup. Identifies clear alignment of 20 EMA > 50 EMA and enters on shallow price pullbacks to the dynamic value zone.",
    winRateEst: "60% - 68%",
    rrTarget: "1:2.0 - 1:2.5",
    idealMarket: "Strong directional trending markets",
    rules: [
      "Trend Filter: 20 EMA > 50 EMA for Longs; 20 EMA < 50 EMA for Shorts.",
      "Value Zone Pullback: Price pulls back into the cushion zone between 20 and 50 EMA.",
      "Reversal Trigger: Candle prints a reaction wick or engulfing candle confirming trend resumption.",
      "SL Safety: Stop Loss anchored behind the 50 EMA dynamic line.",
    ],
    bullishSetup: {
      title: "Uptrend EMA Pullback",
      summary: "In a bullish trend, price pulls back to the 20/50 EMA zone and prints a green bullish rejection candle.",
      entryTrigger: "Buy Market on candle close bouncing off 20/50 EMA.",
      slPlacement: "Stop Loss placed below 50 EMA line.",
      tpPlacement: "Take Profit at previous trend swing high (1:2.0 R:R).",
    },
    bearishSetup: {
      title: "Downtrend EMA Pullback",
      summary: "In a bearish trend, price pulls back up to the 20/50 EMA zone and prints a red bearish rejection candle.",
      entryTrigger: "Sell Market on candle close rejecting 20/50 EMA.",
      slPlacement: "Stop Loss placed above 50 EMA line.",
      tpPlacement: "Take Profit at previous trend swing low (1:2.0 R:R).",
    },
  },
  {
    id: "rsi_exhaustion",
    name: "RSI Mean Reversion & Exhaustion Trap",
    shortName: "RSI Exhaustion Trap",
    tag: "SNIPER REVERSAL",
    category: "MEAN_REVERSION",
    description: "Exploits liquidity exhaustion spikes. When RSI reaches extreme overbought (>= 75) or oversold (<= 25) while tapping round psychological numbers or daily extremes, it executes swift mean-reversion trades back to fair value.",
    winRateEst: "62% - 70%",
    rrTarget: "1:1.8 - 1:2.2",
    idealMarket: "Extended overbought/oversold spikes",
    rules: [
      "Exhaustion Extreme: 14-period RSI reaches <= 25 (Oversold) or >= 75 (Overbought).",
      "Psychological Level: Price aligns with a round number or day extreme.",
      "Divergence / Wick: Candle shows rejection of the extreme price level.",
      "Target: Quick mean-reversion move to EMA 20 or middle Bollinger band.",
    ],
    bullishSetup: {
      title: "Oversold Spike Reversal",
      summary: "RSI drops below 25 into extreme panic selling, prints a hammer pin bar at key support.",
      entryTrigger: "Buy Market at hammer close.",
      slPlacement: "Stop Loss 1-2 points below panic spike low.",
      tpPlacement: "Take Profit at EMA 20 mean price.",
    },
    bearishSetup: {
      title: "Overbought Spike Reversal",
      summary: "RSI surges above 75 into extreme greed buying, prints a shooting star pin bar at key resistance.",
      entryTrigger: "Sell Market at shooting star close.",
      slPlacement: "Stop Loss 1-2 points above greed spike high.",
      tpPlacement: "Take Profit at EMA 20 mean price.",
    },
  },
];

export interface StrategyFlags {
  sweep_reversal: boolean;
  ob_fvg_retest: boolean;
  session_breakout: boolean;
  ema_pullback: boolean;
  rsi_exhaustion: boolean;
}

export interface EngineConfig {
  identity: "reversal" | "breakout";
  selectedStrategy: StrategyId;
  strategyMode: StrategyExecutionMode;
  enabledStrategies: StrategyFlags;
  minConfluenceCount: number; // min matching strategies for multi-confluence (default 2)
  account: number;
  riskUSD: number;
  rr: number;
  maxDailySL: number;
  rejThresh: number;
  powerAtr: number;
  pointValue: number;
  tripleTol: number;
  spread: number;
  actionCenter: boolean;
  windowEnabled: boolean;
  windowGrid: boolean[][];
  telegram: boolean;
  aoi: AoiFlags;
  feedMode: "simulated" | "live";
  activeSymbol: string;
  timeframe: Timeframe;
  chartView: "native" | "tradingview";
  autoBreakeven: boolean;
  beThresholdR: number;
  soundEnabled: boolean;
  sizingMode: SizingMode;
  equityRiskPct: number; // e.g. 2.0 = 2%
  kellyFraction: number; // e.g. 0.35 = 35% Kelly
  trailingStop: boolean;
  trailThresholdR: number; // e.g. 1.5R before trailing activates
  trailAtrDist: number; // e.g. 1.0 ATR trailing cushion
  slippagePoints: number; // e.g. 0.15 = 15 cents / 1.5 pips
  minSlAtr: number; // min SL distance multiple of ATR (default 0.2)
  maxSlAtr: number; // max SL distance multiple of ATR (default 4.0)
}

export interface SessionLevels {
  lonH: number;
  lonL: number;
  nyH: number;
  nyL: number;
  ovlH: number;
  ovlL: number;
}

export type MarketRegime = "TRENDING_BULL" | "TRENDING_BEAR" | "RANGING_CHOP" | "LIQUIDITY_HUNT";

export interface EngineState {
  seed: number;
  bars: Bar[];
  classes: CandleClass[];
  atr: number;
  atrPeriod: number;
  timeframeAtrs: Record<string, number>;
  balance: number;
  startDay: number;
  dayKey: number;
  dayOpen: number;
  dayHigh: number;
  dayLow: number;
  pdh: number | null;
  pdl: number | null;
  ses: SessionLevels | null;
  dailySL: number;
  halted: boolean;
  open: Trade | null;
  trades: Trade[];
  queue: QueueItem[];
  missedTpUSD: number; // money left on the table — rejected signals that ran to TP
  avoidedSlUSD: number; // losses dodged — rejected signals that ran to SL
  equity: number[];
  aois: Aoi[];
  events: EngineEvent[];
  lastEval: LastEval;
  cooldown: Record<string, number>;
  feedMode: "simulated" | "live";
  activeSymbol: string;
  liveStatus: "disconnected" | "connecting" | "connected" | "error";
  liveLatency: number;
  liveLastBarTime: number;
  // market generator internals
  rng: () => number;
  regime: MarketRegime;
  regimeBarsLeft: number;
  trend: number;
  nextT: number;
  price: number;
  nextId: number;
}

export const fmtP = (x: number, digits: number = 2) => x.toFixed(digits);
export const fmtUSD = (x: number) =>
  (x < 0 ? "-$" : "$") + Math.abs(x).toLocaleString("en-US", { maximumFractionDigits: 0 });
export const fmtClock = (t: number) => {
  const ms = ((t % 86400000) + 86400000) % 86400000;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

export const DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/** default schedule: weekdays fully armed, weekends flat */
export function defaultWindowGrid(): boolean[][] {
  return DAY_NAMES.map((_, d) => Array.from({ length: 24 }, () => d >= 1 && d <= 5));
}

export function windowParts(t: number): { wd: number; hr: number } {
  const d = new Date(t);
  return { wd: d.getUTCDay(), hr: d.getUTCHours() };
}

