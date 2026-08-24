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
  | "dashboard"
  | "trades"
  | "terminal"
  | "strategies"
  | "analysis"
  | "academy"
  | "signals"
  | "reports";

export type StrategyId =
  | "creamer_4layer"
  | "asian_fakeout"
  | "ema_pullback"
  | "rsi_exhaustion"
  | "session_breakout";

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
    id: "creamer_4layer",
    name: "Chris Creamer 4-Layer Institutional Framework",
    shortName: "4-Layer Creamer Engine",
    tag: "INSTITUTIONAL CORE · HIGHEST PROBABILITY",
    category: "ORDER_FLOW",
    description: "Institutional 4-Gate Pipeline: (1) Environment: Synthetic GEX & Value Trend -> (2) Location: Fibonacci OTE (0.705-0.886) Kill Zone -> (3) Confirmation: Volume Delta & Passive Trapped Traders Absorption -> (4) Execution: 1:2.5R Risk Engine.",
    winRateEst: "70% - 78%",
    rrTarget: "1:2.5 - 1:3.5",
    idealMarket: "Pullbacks into deep discount/premium in London & NY Sessions",
    rules: [
      "1. Environment: Synthetic GEX confirms volatility regime (Positive Gamma for mean-reversion, Negative Gamma for runners).",
      "2. Location: Price pulls back into the Optimal Trade Entry (OTE) Zone (0.705, 0.788 Golden Pocket, 0.886 Extreme).",
      "3. Confirmation: Order Flow Delta confirms Trapped Sellers (buy absorption) or Trapped Buyers (sell absorption) with pin wick >= 45%.",
      "4. Execution: Enforces 1.0-1.5 ATR breathing room Stop Loss with dynamic 1:2.5R Take Profit.",
    ],
    bullishSetup: {
      title: "Discount OTE Buy Absorption",
      summary: "In a bullish market, price retraces into the 0.705-0.886 Discount OTE Zone and absorbs heavy sell volume with an LPR pin bar.",
      entryTrigger: "Buy Market upon Trapped Sellers absorption confirmation inside OTE Zone.",
      slPlacement: "1.0 - 1.5 ATR below the absorption wick and swing low.",
      tpPlacement: "1:2.5R Target or recent swing high resistance.",
    },
    bearishSetup: {
      title: "Premium OTE Sell Absorption",
      summary: "In a bearish market, price rallies into the 0.705-0.886 Premium OTE Zone and absorbs heavy buy volume with an HPR pin bar.",
      entryTrigger: "Sell Market upon Trapped Buyers absorption confirmation inside OTE Zone.",
      slPlacement: "1.0 - 1.5 ATR above the absorption wick and swing high.",
      tpPlacement: "1:2.5R Target or recent swing low support.",
    },
  },
  {
    id: "asian_fakeout",
    name: "Asian Range Liquidity Sweep & London Judas Swing",
    shortName: "Asian Fakeout Trap",
    tag: "GOLD SPECIAL · 74% WIN RATE",
    category: "LIQUIDITY",
    description: "Tracks the 00:00–07:00 GMT Asian Range. When London session (07:00–12:00 GMT) sweeps liquidity above Asian High or below Asian Low and snaps back inside with a pin bar, executes an aggressive reversal targeting the opposite Asian boundary.",
    winRateEst: "70% - 76%",
    rrTarget: "1:2.5 - 1:3.0",
    idealMarket: "London Open (07:00 - 12:00 GMT / 01:00 - 06:00 EST)",
    rules: [
      "Asian Range: Computes 00:00 - 07:00 GMT Asian High & Asian Low consolidation extremes.",
      "London Sweep: Institutional banks spike price outside Asian boundaries to grab retail stop losses.",
      "Rejection Snapback: Candle violently snaps back inside the range with rejection wick (LPR/HPR).",
      "Target: Targets the opposite boundary of the Asian Range with 1:2.5R minimum.",
    ],
    bullishSetup: {
      title: "Bullish Asian Low Sweep",
      summary: "London spikes below Asian Low, triggers sell stop liquidity, then prints an LPR hammer closing back inside the range.",
      entryTrigger: "Buy Market on candle close reclaiming the Asian Low.",
      slPlacement: "1.0 - 1.2 ATR below the sweep wick tip.",
      tpPlacement: "Asian Range High (opposite boundary) for 1:2.5R.",
    },
    bearishSetup: {
      title: "Bearish Asian High Sweep",
      summary: "London spikes above Asian High, triggers buy stop liquidity, then prints an HPR shooting star closing back inside the range.",
      entryTrigger: "Sell Market on candle close rejecting the Asian High.",
      slPlacement: "1.0 - 1.2 ATR above the sweep wick tip.",
      tpPlacement: "Asian Range Low (opposite boundary) for 1:2.5R.",
    },
  },
  {
    id: "ema_pullback",
    name: "50/200 EMA Institutional Trend Pullback",
    shortName: "50-EMA Trend Pullback",
    tag: "TREND FOLLOWING · HIGH ACCURACY",
    category: "TREND",
    description: "Institutional trend continuation engine. Aligns macro 4H trend (EMA50 > EMA200) and enters on shallow price pullbacks to the dynamic 50-EMA value zone with strict Pin Bar (LPR/HPR) confirmation.",
    winRateEst: "65% - 72%",
    rrTarget: "1:2.0 - 1:2.5",
    idealMarket: "Directional trending markets during London and NY sessions",
    rules: [
      "Macro Trend: EMA50 > EMA200 for Longs; EMA50 < EMA200 for Shorts.",
      "Dynamic Value Retest: Price tests within 0.3 ATR of the dynamic 50-EMA support/resistance line.",
      "Morphology Gate: Strictly requires an LPR (Long Pin) or HPR (High Pin) rejection candle.",
      "Killzone Timing: Active exclusively during London, New York, or Overlap market hours.",
    ],
    bullishSetup: {
      title: "Bullish 50-EMA Bounce",
      summary: "In an uptrend, price pulls back to the 50-EMA line and prints a clean bullish rejection pin bar (LPR).",
      entryTrigger: "Buy Market on candle close bouncing off 50-EMA.",
      slPlacement: "1.0 - 1.2 ATR below 50-EMA dynamic support.",
      tpPlacement: "Recent swing high or 1:2.5R expansion.",
    },
    bearishSetup: {
      title: "Bearish 50-EMA Rejection",
      summary: "In a downtrend, price rallies to the 50-EMA line and prints a clean bearish rejection pin bar (HPR).",
      entryTrigger: "Sell Market on candle close rejecting 50-EMA.",
      slPlacement: "1.0 - 1.2 ATR above 50-EMA dynamic resistance.",
      tpPlacement: "Recent swing low or 1:2.5R breakdown.",
    },
  },
  {
    id: "rsi_exhaustion",
    name: "14-Period RSI Exhaustion & Momentum Fade",
    shortName: "RSI Exhaustion Trap",
    tag: "SNIPER REVERSAL · HIGH RR",
    category: "MEAN_REVERSION",
    description: "Exploits extreme liquidity depletion spikes. When 14-period RSI reaches extreme oversold (<= 28) or overbought (>= 72) at key support/resistance levels, it executes swift mean-reversion trades back to fair value.",
    winRateEst: "64% - 70%",
    rrTarget: "1:2.0 - 1:2.5",
    idealMarket: "Panic selling / greed buying spikes into key swing extremes",
    rules: [
      "Exhaustion Extreme: 14-period RSI reaches <= 28 (Oversold) or >= 72 (Overbought).",
      "Location Confluence: Aligned with an active OTE Fibonacci zone or Session Extreme.",
      "Rejection Confirmation: Candle prints an LPR/HPR pin bar rejecting the extreme level.",
      "Target: 1:2.0 to 1:2.5R mean-reversion move toward 50-EMA center.",
    ],
    bullishSetup: {
      title: "RSI Panic Oversold Bounce",
      summary: "RSI drops <= 28 into panic selling at key support, followed by an LPR hammer pin bar.",
      entryTrigger: "Buy Market on hammer close with oversold momentum.",
      slPlacement: "1.0 ATR below the panic spike low.",
      tpPlacement: "Mean-reversion target at 50-EMA (1:2.0R+).",
    },
    bearishSetup: {
      title: "RSI Greed Overbought Fade",
      summary: "RSI surges >= 72 into greed buying at key resistance, followed by an HPR shooting star pin bar.",
      entryTrigger: "Sell Market on shooting star close with overbought momentum.",
      slPlacement: "1.0 ATR above the greed spike high.",
      tpPlacement: "Mean-reversion target at 50-EMA (1:2.0R+).",
    },
  },
  {
    id: "session_breakout",
    name: "Session Range Breakout & Volatility Expansion EA",
    shortName: "Session Breakout EA",
    tag: "VOLATILITY EXPANSION",
    category: "MOMENTUM",
    description: "Captures explosive institutional order flows during London and New York market opens by trading high-momentum breakout expansions with automated point buffer filters.",
    winRateEst: "60% - 66%",
    rrTarget: "1:2.0 - 1:3.0",
    idealMarket: "Session opening volatility spikes & high-volume market hours",
    rules: [
      "Range Formulation: Records pre-market consolidation high and low.",
      "Buffer Filter: Requires price to breach range by >= 20 points to filter fakeouts.",
      "Discipline Gate: Automated execution with hard stop loss placed beyond breakout candle.",
      "Trailing Stop: Automatically activates trailing stop at +1.5R to secure running profits.",
    ],
    bullishSetup: {
      title: "Bullish Session Range Breakout",
      summary: "Price blasts above session range high with institutional volume surge.",
      entryTrigger: "Buy Market on clean breakout past buffer trigger.",
      slPlacement: "1.0 ATR below breakout range midpoint.",
      tpPlacement: "1:2.5R expansion target.",
    },
    bearishSetup: {
      title: "Bearish Session Range Breakdown",
      summary: "Price breaks below session range low with institutional volume surge.",
      entryTrigger: "Sell Market on clean breakdown past buffer trigger.",
      slPlacement: "1.0 ATR above breakout range midpoint.",
      tpPlacement: "1:2.5R breakdown target.",
    },
  },
];

export interface StrategyFlags {
  creamer_4layer: boolean;
  asian_fakeout: boolean;
  ema_pullback: boolean;
  rsi_exhaustion: boolean;
  session_breakout: boolean;
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
  trendFilter: boolean; // 50/200 EMA trend regime filter
  killzoneFilter: boolean; // London & NY killzone session filter
  confluenceGate: number; // minimum confluence score out of 100 (default 75)
  maxDailyTrades: number; // maximum trades per day limit (default 3 to prevent overtrading)
  // Range Breakout EA Configs
  rbEnabled: boolean;
  rbStartH: number;
  rbStartM: number;
  rbEndH: number;
  rbEndM: number;
  rbBufferPoints: number;
}

export interface SessionLevels {
  lonH: number;
  lonL: number;
  nyH: number;
  nyL: number;
  ovlH: number;
  ovlL: number;
}

export type MarketRegime =
  | "STRONG_BULL"
  | "WEAK_BULL"
  | "STRONG_BEAR"
  | "WEAK_BEAR"
  | "RANGING"
  | "VOLATILE_EXPANSION"
  | "LIQUIDITY_GRAB"
  | "NEWS_SPIKE"
  | "TRENDING_BULL"
  | "TRENDING_BEAR"
  | "RANGING_CHOP"
  | "LIQUIDITY_HUNT";

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
  dailyTradesCount: number;
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
  // Institutional filters state
  ema50: number;
  ema200: number;
  lastConfluenceScore: number;
  activeKillzone: "LONDON" | "NEW_YORK" | "OVERLAP" | "OFF_SESSION";
  
  // Range Breakout State
  rbHigh: number | null;
  rbLow: number | null;
  rbState: "WAITING" | "FORMING" | "ACTIVE" | "DONE";
  
  // Gold-Specific Institutional Microstructure
  asianHigh: number | null;
  asianLow: number | null;
  asianTradedDay: number;
  dxyTrend: "BULLISH" | "BEARISH" | "NEUTRAL";
  dxyValue: number;
  mtcAlignment: {
    h4: "BULLISH" | "BEARISH";
    m15: "AOI_TEST" | "CHOP" | "BREAKOUT";
    m5: "LPR" | "HPR" | "NEUTRAL";
    aligned: boolean;
    score: number;
  };
  upcomingNews: {
    event: string;
    timeUTC: string;
    impact: "HIGH" | "MEDIUM";
    minutesUntil: number;
    isCooldownActive: boolean;
  } | null;

  // Chris Creamer 4-Pillar Free Institutional Architecture
  creamerFramework?: {
    // 1. Environment
    gexState: "POSITIVE_GAMMA" | "NEGATIVE_GAMMA" | "NEUTRAL_GAMMA";
    pcrRatio: number; // Put/Call Ratio
    impliedVolProxy: number;
    valueRegime: "VALUE_UP_EXPANSION" | "VALUE_DOWN_EXPANSION" | "VALUE_RANGE_BOUND";

    // 2. Location (Institutional OTE Fibonacci 70.5% - 78.8% - 88.6%)
    swingHigh: number;
    swingLow: number;
    fib705: number;
    fib788: number;
    fib886: number;
    inOteZone: boolean;
    oteZoneType: "DISCOUNT_BUY" | "PREMIUM_SELL" | "NONE";

    // 3. Confirmation (Volume Delta & Absorption)
    barDelta: number; // (Buy Vol - Sell Vol)
    cumulativeDelta: number; // CVD
    absorption: "PASSIVE_BUYER_ABSORPTION" | "PASSIVE_SELLER_ABSORPTION" | "NONE";
    absorptionDesc: string;

    // 4. Execution & Score
    totalConfluenceScore: number; // 0 - 100
    isSetupReady: boolean;
  };
}

export const fmtP = (x: number, digits: number = 2) => x.toFixed(digits);
export const fmtUSD = (x: number, withSignOrDecimals?: boolean | number, decimals: number = 0) => {
  const withSign = typeof withSignOrDecimals === "boolean" ? withSignOrDecimals : false;
  const dec = typeof withSignOrDecimals === "number" ? withSignOrDecimals : decimals;
  const sign = x > 0 && withSign ? "+" : x < 0 ? "-" : "";
  return sign + "$" + Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
};
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

