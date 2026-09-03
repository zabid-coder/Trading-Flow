export interface Bar {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  day: number;
}
export type Side = "LONG" | "SHORT";
export type Timeframe = "1m" | "5m" | "15m" | "30m" | "1h" | "4h";
export const TIMEFRAMES: { label: Timeframe; name: string; ms: number }[] = [
  { label: "1m", name: "1 Minute", ms: 60_000 },
  { label: "5m", name: "5 Minutes", ms: 300_000 },
  { label: "15m", name: "15 Minutes", ms: 900_000 },
  { label: "30m", name: "30 Minutes", ms: 1_800_000 },
  { label: "1h", name: "1 Hour", ms: 3_600_000 },
  { label: "4h", name: "4 Hours", ms: 14_400_000 },
];

export interface SymbolMeta {
  symbol: string;
  label: string;
  digits: number;
  point: number;
  contractSize: number;
  spread: number;
  binanceSymbol?: string;
}
export const SUPPORTED_SYMBOLS: SymbolMeta[] = [
  {
    symbol: "XAUUSD",
    label: "Gold / U.S. Dollar",
    digits: 2,
    point: 0.01,
    contractSize: 100,
    spread: 0.25,
    binanceSymbol: "PAXGUSDT",
  },
  {
    symbol: "XAGUSD",
    label: "Silver / U.S. Dollar",
    digits: 3,
    point: 0.001,
    contractSize: 5000,
    spread: 0.025,
  },
  {
    symbol: "EURUSD",
    label: "Euro / U.S. Dollar",
    digits: 5,
    point: 0.00001,
    contractSize: 100000,
    spread: 0.00012,
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
  mt5Secret: "",
  telegramEnabled: false,
  telegramToken: "",
  telegramChatId: "",
  webhookEnabled: false,
  webhookUrl: "",
  autoDispatch: false,
};

export interface BrokerSymbolSpec {
  ready: boolean;
  symbol: string;
  digits: number;
  point: number;
  tickSize: number;
  tickValue: number;
  contractSize: number;
  volumeMin: number;
  volumeMax: number;
  volumeStep: number;
  stopsLevel: number;
  freezeLevel: number;
  spreadPoints: number;
  balance: number;
  equity: number;
  freeMargin: number;
  currency: string;
  marginPerMinLot: number;
  lossPerLot100Points: number;
  source: "MT5" | "MOCK" | "SIMULATION";
  checkedAt: number;
  warning?: string;
  accountId?: string;
  accountMode?: "DEMO" | "REAL" | "UNKNOWN";
  executionEnabled?: boolean;
}

export interface SafeScalperConfig {
  magicNumber: number;
  riskPercent: number;
  dailyLossPercent: number;
  maxDrawdownPercent: number;
  maxDailyTrades: number;
  maxMarginPercent: number;
  stopLossPoints: number;
  takeProfitPoints: number;
  autoAdjustTwoDigitGold: boolean;
  stopBufferPoints: number;
  useBreakeven: boolean;
  breakevenStartPoints: number;
  breakevenOffsetPoints: number;
  useTrailing: boolean;
  trailStartPoints: number;
  trailStepPoints: number;
  usePartialClose: boolean;
  tp1Points: number;
  tp1ClosePercent: number;
  emaFast: number;
  emaSlow: number;
  trendStrengthAtr: number;
  useMtf: boolean;
  mtfEmaFast: number;
  mtfEmaSlow: number;
  rsiPeriod: number;
  rsiBuyMin: number;
  rsiBuyMax: number;
  rsiSellMin: number;
  rsiSellMax: number;
  breakoutLookback: number;
  breakoutBufferAtr: number;
  atrPeriod: number;
  sessionStartHour: number;
  sessionEndHour: number;
  fridayCutoffHour: number;
  maxSpreadPoints: number;
  maxSpreadToStopPercent: number;
  newsMinsBefore: number;
  newsMinsAfter: number;
}

export interface EngineConfig {
  accountBalance: number;
  activeSymbol: string;
  timeframe: Timeframe;
  feedMode: "simulated" | "mt5";
  executionMode: "supervised" | "automatic";
  soundEnabled: boolean;
  brokerSpec: BrokerSymbolSpec;
  newsLocked: boolean;
  newsLabel?: string;
  safe: SafeScalperConfig;
}
export interface GateResult {
  key:
    | "EMA_DIRECTION"
    | "TREND_STRENGTH"
    | "PRICE_POSITION"
    | "BREAKOUT"
    | "RSI_ZONE"
    | "MOMENTUM"
    | "H1_AGREEMENT";
  label: string;
  passed: boolean;
  detail: string;
}
export interface RiskDecision {
  allowed: boolean;
  reason: string;
  lots: number;
  expectedLoss: number;
  riskBudget: number;
  marginRequired: number;
  effectiveStopPoints: number;
  effectiveTakeProfitPoints: number;
}

export interface Trade {
  signalId: string;
  source: "simulated" | "mt5";
  brokerTicket?: number;
  commission?: number;
  id: number;
  side: Side;
  setup: string;
  family: "SAFESCALPERPRO";
  identity: "breakout";
  entryIndex: number;
  entryTime: number;
  entry: number;
  sl: number;
  tp: number;
  oz: number;
  brokerLots: number;
  risk: number;
  magicNumber: number;
  open: boolean;
  exitIndex?: number;
  exitTime?: number;
  exit?: number;
  pnl?: number;
  r?: number;
  outcome?: "TP" | "SL" | "MANUAL";
  isBreakeven?: boolean;
  partialClosed?: boolean;
  partialRealized?: number;
  trailActive?: boolean;
  notes?: string;
}
export interface QueueItem extends Omit<Trade, "open"> {
  status: "PENDING" | "APPROVED" | "REJECTED";
  expiresAtIndex: number;
  expiresAtTime: number;
  reason?: string;
  dispatchStatus?: "IDLE" | "SENDING" | "SENT" | "FAILED" | "UNKNOWN";
  dispatchMsg?: string;
}
export interface EngineEvent {
  id: number;
  time: number;
  tag: "SYSTEM" | "SIGNAL" | "RISK" | "ENTRY" | "EXIT";
  msg: string;
  tone: "sys" | "long" | "short" | "risk";
}
export interface SafeTelemetry {
  side: Side | "NONE";
  emaFast: number;
  emaSlow: number;
  atr: number;
  rsi: number;
  breakoutHigh: number;
  breakoutLow: number;
  gates: GateResult[];
  blockedBy?: string;
  risk: RiskDecision;
}
export interface EngineState {
  bars: Bar[];
  balance: number;
  equity: number;
  peakEquity: number;
  dayStartBalance: number;
  dayKey: number;
  dailyTrades: number;
  dailyLoss: number;
  drawdownPercent: number;
  halted: boolean;
  haltReason?: string;
  open: Trade | null;
  trades: Trade[];
  queue: QueueItem[];
  events: EngineEvent[];
  telemetry: SafeTelemetry;
  feedStatus: "disconnected" | "connecting" | "connected" | "error";
  feedLatency: number;
  nextId: number;
  rng: () => number;
  nextT: number;
  formingBar?: Bar;
  sessionId: string;
}
export interface EngineStats {
  closed: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnl: number;
  profitFactor: number;
  expectancy: number;
}
export const fmtP = (value: number, digits = 2) =>
  Number.isFinite(value) ? value.toFixed(digits) : "—";
export const fmtUSD = (value: number, withSign = false, decimals = 2) => {
  const sign = withSign && value > 0 ? "+" : "";
  return `${sign}${value < 0 ? "-" : ""}$${Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
};
