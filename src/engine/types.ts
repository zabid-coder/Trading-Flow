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

export interface EngineConfig {
  identity: "reversal" | "breakout";
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

