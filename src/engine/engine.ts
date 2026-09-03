import type {
  Bar,
  BrokerSymbolSpec,
  EngineConfig,
  EngineState,
  EngineStats,
  GateResult,
  QueueItem,
  RiskDecision,
  SafeTelemetry,
  Side,
  Trade,
} from "./types";
import { SUPPORTED_SYMBOLS, TIMEFRAMES } from "./types";
import {
  ACCOUNT_BALANCE,
  COMMISSION_PER_LOT,
  MAX_DEVIATION_POINTS,
  SAFE_DEFAULTS,
} from "./config";

const EMPTY_RISK: RiskDecision = {
  allowed: false,
  reason: "Waiting for market data",
  lots: 0,
  expectedLoss: 0,
  riskBudget: 0,
  marginRequired: 0,
  effectiveStopPoints: 0,
  effectiveTakeProfitPoints: 0,
};
const EMPTY_TELEMETRY: SafeTelemetry = {
  side: "NONE",
  emaFast: 0,
  emaSlow: 0,
  atr: 0,
  rsi: 50,
  breakoutHigh: 0,
  breakoutLow: 0,
  gates: [],
  risk: EMPTY_RISK,
};

export const DEFAULT_SIM_SPEC: BrokerSymbolSpec = {
  ready: true,
  symbol: "XAUUSD",
  digits: 2,
  point: 0.01,
  tickSize: 0.01,
  tickValue: 1,
  contractSize: 100,
  volumeMin: 0.01,
  volumeMax: 100,
  volumeStep: 0.01,
  stopsLevel: 0,
  freezeLevel: 0,
  spreadPoints: 2.5,
  balance: 500,
  equity: 500,
  freeMargin: 500,
  currency: "USD",
  marginPerMinLot: 26.5,
  lossPerLot100Points: 100,
  source: "SIMULATION",
  checkedAt: Date.now(),
  warning:
    "Simulation contract specification — connect MT5 before live execution.",
};

export const DEFAULT_CFG: EngineConfig = {
  accountBalance: ACCOUNT_BALANCE,
  activeSymbol: "XAUUSD",
  timeframe: "5m",
  feedMode: "simulated",
  executionMode: "supervised",
  soundEnabled: true,
  brokerSpec: DEFAULT_SIM_SPEC,
  newsLocked: false,
  safe: { ...SAFE_DEFAULTS },
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function addEvent(
  st: EngineState,
  tag: EngineState["events"][number]["tag"],
  tone: EngineState["events"][number]["tone"],
  msg: string,
  time = Date.now(),
) {
  st.events.unshift({ id: st.nextId++, time, tag, tone, msg });
  if (st.events.length > 120) st.events.length = 120;
}

function ema(bars: Bar[], period: number, end = bars.length - 1) {
  const start = 0;
  let value = bars[start]?.c ?? 0;
  const k = 2 / (period + 1);
  for (let i = start + 1; i <= end; i++)
    value = bars[i].c * k + value * (1 - k);
  return value;
}

function atr(bars: Bar[], period: number, end = bars.length - 1) {
  const start = 0;
  let value = 0;
  let count = 0;
  for (let i = start; i <= end; i++) {
    const prev = bars[i - 1]?.c ?? bars[i].o;
    const tr = Math.max(
      bars[i].h - bars[i].l,
      Math.abs(bars[i].h - prev),
      Math.abs(bars[i].l - prev),
    );
    value = count === 0 ? tr : (value * (period - 1) + tr) / period;
    count++;
  }
  return value;
}

function rsi(bars: Bar[], period: number, end = bars.length - 1) {
  const start = 0;
  let gain = 0,
    loss = 0,
    count = 0;
  for (let i = start; i <= end; i++) {
    const d = i === 0 ? 0 : bars[i].c - bars[i - 1].c;
    if (count === 0) {
      gain = Math.max(0, d);
      loss = Math.max(0, -d);
    } else {
      gain = (gain * (period - 1) + Math.max(0, d)) / period;
      loss = (loss * (period - 1) + Math.max(0, -d)) / period;
    }
    count++;
  }
  return loss === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / loss);
}

function hourlyBars(bars: Bar[], currentTime: number, timeframeMs: number) {
  const currentHour = Math.floor(currentTime / 3_600_000);
  const grouped = new Map<number, Bar>();
  const counts = new Map<number, number>();
  for (const bar of bars) {
    const hour = Math.floor(bar.t / 3_600_000);
    if (hour >= currentHour) continue;
    counts.set(hour, (counts.get(hour) ?? 0) + 1);
    const existing = grouped.get(hour);
    if (!existing) grouped.set(hour, { ...bar });
    else {
      existing.h = Math.max(existing.h, bar.h);
      existing.l = Math.min(existing.l, bar.l);
      existing.c = bar.c;
      existing.v += bar.v;
    }
  }
  return [...grouped.entries()]
    .filter(([hour]) => counts.get(hour) === 3_600_000 / timeframeMs)
    .map(([, bar]) => bar)
    .sort((a, b) => a.t - b.t);
}

function adjustedPoints(points: number, cfg: EngineConfig) {
  const isGold = /^XAU/i.test(cfg.activeSymbol);
  return isGold &&
    cfg.brokerSpec.digits === 2 &&
    cfg.safe.autoAdjustTwoDigitGold
    ? points / 10
    : points;
}

function floorVolume(value: number, step: number, digits = 8) {
  return Number((Math.floor((value + 1e-12) / step) * step).toFixed(digits));
}

export function calculateRisk(
  st: EngineState,
  cfg: EngineConfig,
): RiskDecision {
  const spec = cfg.brokerSpec;
  const positive = [
    st.equity,
    spec.point,
    spec.tickSize,
    spec.contractSize,
    spec.volumeMin,
    spec.volumeMax,
    spec.volumeStep,
    spec.marginPerMinLot,
    spec.lossPerLot100Points,
  ];
  if (
    positive.some((n) => !Number.isFinite(n) || n <= 0) ||
    Object.values(cfg.safe).some(
      (n) => typeof n === "number" && !Number.isFinite(n),
    ) ||
    cfg.safe.riskPercent < 0.1 ||
    cfg.safe.riskPercent > 1 ||
    cfg.safe.maxMarginPercent <= 0 ||
    cfg.safe.maxMarginPercent > 25 ||
    !Number.isFinite(spec.freeMargin) ||
    spec.freeMargin < 0 ||
    spec.volumeMax < spec.volumeMin
  )
    return {
      ...EMPTY_RISK,
      reason: "Invalid risk or broker metadata — fail closed",
    };
  if (
    cfg.feedMode === "mt5" &&
    (spec.source !== "MT5" ||
      !Number.isFinite(spec.checkedAt) ||
      Date.now() - spec.checkedAt > 30_000 ||
      spec.checkedAt > Date.now() + 5000)
  )
    return { ...EMPTY_RISK, reason: "Broker profile missing, mock or stale" };
  const stopInput = adjustedPoints(cfg.safe.stopLossPoints, cfg);
  const tpInput = adjustedPoints(cfg.safe.takeProfitPoints, cfg);
  const brokerMin =
    Math.max(spec.stopsLevel, spec.freezeLevel) + cfg.safe.stopBufferPoints;
  const stopPoints = Math.max(stopInput, brokerMin);
  const takeProfitPoints = Math.max(tpInput, brokerMin);
  const riskBudget = (st.equity * cfg.safe.riskPercent) / 100;
  const stopDistance = stopPoints * spec.point;
  const lossPerLot =
    ((stopDistance + MAX_DEVIATION_POINTS * spec.point) / (100 * spec.point)) *
      spec.lossPerLot100Points +
    COMMISSION_PER_LOT;
  if (!spec.ready || lossPerLot <= 0)
    return {
      ...EMPTY_RISK,
      riskBudget,
      effectiveStopPoints: stopPoints,
      effectiveTakeProfitPoints: takeProfitPoints,
      reason: "Broker contract specification unavailable",
    };
  const rawLots = riskBudget / lossPerLot;
  const marginPerLot = spec.marginPerMinLot / Math.max(spec.volumeMin, 1e-12);
  const marginLotCap =
    Math.min(spec.freeMargin, (st.equity * cfg.safe.maxMarginPercent) / 100) /
    marginPerLot;
  const lots = floorVolume(
    Math.min(rawLots, marginLotCap, spec.volumeMax),
    spec.volumeStep,
  );
  const minLotLoss = lossPerLot * spec.volumeMin;
  if (rawLots < spec.volumeMin || lots < spec.volumeMin)
    return {
      allowed: false,
      reason:
        rawLots < spec.volumeMin
          ? `Minimum lot loss ${minLotLoss.toFixed(2)} exceeds risk budget ${riskBudget.toFixed(2)}`
          : "Free margin or margin cap cannot fund the minimum lot",
      lots: 0,
      expectedLoss: minLotLoss,
      riskBudget,
      marginRequired: spec.marginPerMinLot,
      effectiveStopPoints: stopPoints,
      effectiveTakeProfitPoints: takeProfitPoints,
    };
  const expectedLoss = lossPerLot * lots;
  const marginRequired = marginPerLot * lots;
  const marginLimited =
    lots + spec.volumeStep / 2 < Math.min(rawLots, spec.volumeMax);
  return {
    allowed: true,
    reason: marginLimited
      ? "Risk passed; volume reduced to respect the margin cap"
      : "Risk, minimum-lot and margin checks passed",
    lots,
    expectedLoss,
    riskBudget,
    marginRequired,
    effectiveStopPoints: stopPoints,
    effectiveTakeProfitPoints: takeProfitPoints,
  };
}

function safetyBlock(
  st: EngineState,
  cfg: EngineConfig,
  bar: Bar,
  risk: RiskDecision,
  ignorePending = false,
) {
  if (st.halted) return st.haltReason ?? "Risk circuit breaker latched";
  if (cfg.feedMode === "mt5" && st.feedStatus !== "connected")
    return "Broker feed is not connected";
  const d = new Date(bar.t);
  const hour = d.getUTCHours();
  const weekday = d.getUTCDay();
  const spreadPct =
    risk.effectiveStopPoints > 0
      ? (cfg.brokerSpec.spreadPoints / risk.effectiveStopPoints) * 100
      : 100;
  if (weekday === 0 || weekday === 6) return "Weekend lock";
  if (hour < cfg.safe.sessionStartHour || hour >= cfg.safe.sessionEndHour)
    return "Outside London/New York window";
  if (weekday === 5 && hour >= cfg.safe.fridayCutoffHour)
    return "Friday cutoff";
  if (cfg.newsLocked)
    return cfg.newsLabel
      ? `High-impact news: ${cfg.newsLabel}`
      : "High-impact news lock";
  if (cfg.brokerSpec.spreadPoints > cfg.safe.maxSpreadPoints)
    return `Spread ${cfg.brokerSpec.spreadPoints.toFixed(0)}p exceeds ${cfg.safe.maxSpreadPoints}p`;
  if (spreadPct > cfg.safe.maxSpreadToStopPercent)
    return `Spread is ${spreadPct.toFixed(1)}% of stop distance`;
  if (st.dailyTrades >= cfg.safe.maxDailyTrades)
    return "Daily two-trade cap reached";
  if (st.dailyLoss >= (st.dayStartBalance * cfg.safe.dailyLossPercent) / 100)
    return "Daily loss circuit breaker";
  if (st.drawdownPercent >= cfg.safe.maxDrawdownPercent)
    return "Maximum drawdown circuit breaker";
  if (!risk.allowed) return risk.reason;
  if (st.open) return "One-trade mode: position already open";
  if (!ignorePending && st.queue.some((q) => q.status === "PENDING"))
    return "Signal awaiting review";
  return "";
}

function evaluate(st: EngineState, cfg: EngineConfig, allowEntry: boolean) {
  // Match the server's bounded 900-bar signal window and indicator seeding.
  const bars = st.bars.slice(-900);
  const i = bars.length - 1;
  const s = cfg.safe;
  const minimum = Math.max(
    s.emaSlow + 5,
    s.breakoutLookback + 5,
    s.atrPeriod + 5,
    s.rsiPeriod + 5,
  );
  const risk = calculateRisk(st, cfg);
  if (bars.length < minimum || i < 2) {
    st.telemetry = {
      ...EMPTY_TELEMETRY,
      risk,
      blockedBy: `Warming indicators ${bars.length}/${minimum}`,
    };
    return;
  }
  const bar = bars[i],
    previous = bars[i - 1];
  const fast = ema(bars, s.emaFast, i),
    slow = ema(bars, s.emaSlow, i),
    volatility = atr(bars, s.atrPeriod, i),
    strength = Math.abs(fast - slow),
    momentum = rsi(bars, s.rsiPeriod, i);
  const lookback = bars.slice(i - s.breakoutLookback, i);
  const high = Math.max(...lookback.map((b) => b.h)),
    low = Math.min(...lookback.map((b) => b.l)),
    buffer = volatility * s.breakoutBufferAtr;
  const h1 = hourlyBars(
      bars,
      bar.t + TIMEFRAMES.find((tf) => tf.label === cfg.timeframe)!.ms,
      TIMEFRAMES.find((tf) => tf.label === cfg.timeframe)!.ms,
    ),
    h1Ready = !s.useMtf || h1.length >= s.mtfEmaSlow + 2;
  const h1Fast = h1Ready && s.useMtf ? ema(h1, s.mtfEmaFast) : 0,
    h1Slow = h1Ready && s.useMtf ? ema(h1, s.mtfEmaSlow) : 0;
  const bull = [
    fast > slow,
    strength >= volatility * s.trendStrengthAtr,
    bar.c > fast && bar.c > slow,
    bar.c > high - buffer && previous.c <= high,
    momentum >= s.rsiBuyMin && momentum <= s.rsiBuyMax,
    bar.c > previous.c,
    !s.useMtf || (h1Ready && h1Fast > h1Slow),
  ];
  const bear = [
    fast < slow,
    strength >= volatility * s.trendStrengthAtr,
    bar.c < fast && bar.c < slow,
    bar.c < low + buffer && previous.c >= low,
    momentum >= s.rsiSellMin && momentum <= s.rsiSellMax,
    bar.c < previous.c,
    !s.useMtf || (h1Ready && h1Fast < h1Slow),
  ];
  const side: Side | "NONE" = bull.every(Boolean)
    ? "LONG"
    : bear.every(Boolean)
      ? "SHORT"
      : "NONE";
  const selected =
    side === "SHORT"
      ? bear
      : side === "LONG"
        ? bull
        : fast >= slow
          ? bull
          : bear;
  const labels = [
    "EMA direction",
    "ATR trend strength",
    "Price beyond both EMAs",
    "Buffered N-bar breakout",
    "Healthy RSI zone",
    "Close momentum",
    "H1 EMA agreement",
  ];
  const keys: GateResult["key"][] = [
    "EMA_DIRECTION",
    "TREND_STRENGTH",
    "PRICE_POSITION",
    "BREAKOUT",
    "RSI_ZONE",
    "MOMENTUM",
    "H1_AGREEMENT",
  ];
  const details = [
    `${fast.toFixed(2)} / ${slow.toFixed(2)}`,
    `${strength.toFixed(2)} / ${(volatility * s.trendStrengthAtr).toFixed(2)}`,
    `Close ${bar.c.toFixed(2)}`,
    `${low.toFixed(2)} — ${high.toFixed(2)}`,
    momentum.toFixed(1),
    `${previous.c.toFixed(2)} → ${bar.c.toFixed(2)}`,
    s.useMtf
      ? h1Ready
        ? `${h1Fast.toFixed(2)} / ${h1Slow.toFixed(2)}`
        : "Warming H1"
      : "Disabled",
  ];
  const gates = keys.map((key, n) => ({
    key,
    label: labels[n],
    passed: selected[n],
    detail: details[n],
  }));
  const blockedBy = safetyBlock(st, cfg, bar, risk);
  st.telemetry = {
    side,
    emaFast: fast,
    emaSlow: slow,
    atr: volatility,
    rsi: momentum,
    breakoutHigh: high,
    breakoutLow: low,
    gates,
    risk,
    blockedBy: blockedBy || undefined,
  };
  if (!allowEntry || side === "NONE" || blockedBy) return;
  const halfSpread = (cfg.brokerSpec.spreadPoints * cfg.brokerSpec.point) / 2;
  // MT5 FX/metal chart bars are Bid, whereas synthetic bars are modeled mid-prices.
  const entry =
    cfg.feedMode === "mt5"
      ? side === "LONG"
        ? bar.c + 2 * halfSpread
        : bar.c
      : side === "LONG"
        ? bar.c + halfSpread
        : bar.c - halfSpread;
  const slDistance = risk.effectiveStopPoints * cfg.brokerSpec.point;
  const tpDistance = risk.effectiveTakeProfitPoints * cfg.brokerSpec.point;
  const base = {
    id: st.nextId++,
    signalId: `${st.sessionId}:${bar.t}:${side}`,
    source: cfg.feedMode,
    side,
    setup: `SAFE SCALPER · ${side} 7-GATE BREAKOUT`,
    family: "SAFESCALPERPRO" as const,
    identity: "breakout" as const,
    entryIndex: i,
    entryTime: bar.t,
    entry,
    sl: side === "LONG" ? entry - slDistance : entry + slDistance,
    tp: side === "LONG" ? entry + tpDistance : entry - tpDistance,
    oz: risk.lots * cfg.brokerSpec.contractSize,
    brokerLots: risk.lots,
    risk: risk.expectedLoss,
    magicNumber: s.magicNumber,
  };
  if (cfg.executionMode === "supervised" || cfg.feedMode === "mt5") {
    const queued: QueueItem = {
      ...base,
      status: "PENDING",
      expiresAtIndex: i + 3,
      expiresAtTime:
        bar.t + 3 * TIMEFRAMES.find((tf) => tf.label === cfg.timeframe)!.ms,
      dispatchStatus: "IDLE",
    };
    st.queue.unshift(queued);
    addEvent(
      st,
      "SIGNAL",
      side === "LONG" ? "long" : "short",
      `${side} seven-gate signal held for review · ${risk.lots.toFixed(2)} lots`,
      bar.t,
    );
  } else openTrade(st, { ...base, open: true }, bar.t);
}

function openTrade(st: EngineState, trade: Trade, time: number) {
  trade.commission = trade.brokerLots * COMMISSION_PER_LOT;
  st.open = trade;
  st.dailyTrades++;
  addEvent(
    st,
    "ENTRY",
    trade.side === "LONG" ? "long" : "short",
    `${trade.side} opened · ${trade.brokerLots.toFixed(2)} lots @ ${trade.entry.toFixed(2)} · risk $${trade.risk.toFixed(2)}`,
    time,
  );
}

function closeTrade(
  st: EngineState,
  trade: Trade,
  exit: number,
  outcome: Trade["outcome"],
  bar: Bar,
) {
  const direction = trade.side === "LONG" ? 1 : -1;
  const pnl =
    direction * (exit - trade.entry) * trade.oz +
    (trade.partialRealized ?? 0) -
    (trade.commission ?? 0);
  trade.exit = exit;
  trade.exitIndex = st.bars.length - 1;
  trade.exitTime = bar.t;
  trade.pnl = pnl;
  trade.r = trade.risk > 0 ? pnl / trade.risk : 0;
  trade.outcome = outcome;
  trade.open = false;
  st.balance += pnl - (trade.partialRealized ?? 0);
  st.equity = st.balance;
  if (pnl < 0) st.dailyLoss += Math.abs(pnl);
  st.trades.unshift(trade);
  st.open = null;
  addEvent(
    st,
    "EXIT",
    pnl >= 0 ? "long" : "risk",
    `${outcome} · ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)} (${trade.r?.toFixed(2)}R)`,
    bar.t,
  );
}

function manageOpen(st: EngineState, cfg: EngineConfig, bar: Bar) {
  const t = st.open;
  if (!t || cfg.feedMode === "mt5") return;
  const direction = t.side === "LONG" ? 1 : -1;
  if (
    (t.side === "LONG" && bar.l <= t.sl) ||
    (t.side === "SHORT" && bar.h >= t.sl)
  ) {
    closeTrade(
      st,
      t,
      t.side === "LONG" ? Math.min(t.sl, bar.o) : Math.max(t.sl, bar.o),
      "SL",
      bar,
    );
    return;
  }
  if (
    (t.side === "LONG" && bar.h >= t.tp) ||
    (t.side === "SHORT" && bar.l <= t.tp)
  ) {
    closeTrade(st, t, t.tp, "TP", bar);
    return;
  }
  const favorable = direction * ((t.side === "LONG" ? bar.h : bar.l) - t.entry);
  const point = cfg.brokerSpec.point;
  if (
    cfg.safe.useBreakeven &&
    !t.isBreakeven &&
    favorable >= adjustedPoints(cfg.safe.breakevenStartPoints, cfg) * point
  ) {
    t.sl =
      t.entry +
      direction * adjustedPoints(cfg.safe.breakevenOffsetPoints, cfg) * point;
    t.isBreakeven = true;
    addEvent(
      st,
      "SYSTEM",
      "sys",
      `Breakeven armed at ${t.sl.toFixed(cfg.brokerSpec.digits)}`,
      bar.t,
    );
  }
  if (
    cfg.safe.usePartialClose &&
    !t.partialClosed &&
    favorable >= adjustedPoints(cfg.safe.tp1Points, cfg) * point
  ) {
    const ratio = cfg.safe.tp1ClosePercent / 100,
      closeLots = floorVolume(t.brokerLots * ratio, cfg.brokerSpec.volumeStep);
    if (
      closeLots >= cfg.brokerSpec.volumeMin &&
      t.brokerLots - closeLots >= cfg.brokerSpec.volumeMin
    ) {
      const price =
        t.entry + direction * adjustedPoints(cfg.safe.tp1Points, cfg) * point;
      t.partialRealized =
        direction * (price - t.entry) * closeLots * cfg.brokerSpec.contractSize;
      st.balance += t.partialRealized;
      t.brokerLots -= closeLots;
      t.oz = t.brokerLots * cfg.brokerSpec.contractSize;
      t.partialClosed = true;
      addEvent(
        st,
        "EXIT",
        "long",
        `TP1 partial · ${closeLots.toFixed(2)} lots · +$${t.partialRealized.toFixed(2)}`,
        bar.t,
      );
    } else t.partialClosed = true;
  }
  if (
    cfg.safe.useTrailing &&
    favorable >= adjustedPoints(cfg.safe.trailStartPoints, cfg) * point
  ) {
    const candidate =
      (t.side === "LONG" ? bar.h : bar.l) -
      direction * adjustedPoints(cfg.safe.trailStepPoints, cfg) * point;
    if (
      (t.side === "LONG" && candidate > t.sl) ||
      (t.side === "SHORT" && candidate < t.sl)
    ) {
      t.sl = candidate;
      t.trailActive = true;
    }
  }
}

function updateCircuitBreakers(st: EngineState, cfg: EngineConfig, bar: Bar) {
  // Broker account values and risk latch are authoritative in MT5 mode.
  if (cfg.feedMode === "mt5") return;
  if (bar.day !== st.dayKey) {
    st.dayKey = bar.day;
    st.dayStartBalance = st.balance;
    st.dailyTrades = 0;
    st.dailyLoss = 0;
    if (st.drawdownPercent < cfg.safe.maxDrawdownPercent * 0.7) {
      st.halted = false;
      st.haltReason = undefined;
    }
  }
  const mark = st.open
    ? st.balance +
      (st.open.side === "LONG" ? 1 : -1) *
        (bar.c - st.open.entry) *
        st.open.oz -
      (st.open.commission ?? 0)
    : st.balance;
  st.equity = mark;
  st.peakEquity = Math.max(st.peakEquity, mark);
  st.drawdownPercent =
    st.peakEquity > 0
      ? Math.max(0, ((st.peakEquity - mark) / st.peakEquity) * 100)
      : 0;
  if (st.dailyLoss >= (st.dayStartBalance * cfg.safe.dailyLossPercent) / 100) {
    st.halted = true;
    st.haltReason = "Daily loss limit";
  }
  if (st.drawdownPercent >= cfg.safe.maxDrawdownPercent) {
    st.halted = true;
    st.haltReason = "Maximum drawdown";
  }
}

function gaussian(rng: () => number) {
  return (
    Math.sqrt(-2 * Math.log(Math.max(rng(), 1e-9))) *
    Math.cos(2 * Math.PI * rng())
  );
}
function nextSimBar(st: EngineState, cfg: EngineConfig): Bar {
  const tf = TIMEFRAMES.find((x) => x.label === cfg.timeframe)?.ms ?? 300_000;
  const previous =
    st.bars[st.bars.length - 1]?.c ??
    (/^XAU/.test(cfg.activeSymbol)
      ? 2650
      : /^XAG/.test(cfg.activeSymbol)
        ? 30
        : 1.08);
  const hour = new Date(st.nextT).getUTCHours();
  const liquid = hour >= 7 && hour < 18 ? 1.4 : 0.65;
  const drift = Math.sin(st.bars.length / 55) * previous * 0.00005;
  const sigma = previous * 0.00045 * Math.sqrt(tf / 300_000) * liquid;
  const o = previous,
    c = Math.max(0.00001, o + drift + gaussian(st.rng) * sigma);
  const wick = Math.abs(gaussian(st.rng)) * sigma * 0.45;
  const bar = {
    t: st.nextT,
    o,
    h: Math.max(o, c) + wick,
    l: Math.min(o, c) - wick,
    c,
    v: 20 + st.rng() * 80,
    day: Math.floor(st.nextT / 86_400_000),
  };
  st.nextT += tf;
  return bar;
}

export function createEngine(
  seed = 42,
  cfg: EngineConfig = DEFAULT_CFG,
): EngineState {
  const rng = mulberry32(seed),
    tf = TIMEFRAMES.find((x) => x.label === cfg.timeframe)?.ms ?? 300_000;
  const now = Math.floor(Date.now() / tf) * tf,
    start = now - 720 * tf;
  const st: EngineState = {
    sessionId: crypto.randomUUID(),
    bars: [],
    balance: cfg.accountBalance,
    equity: cfg.accountBalance,
    peakEquity: cfg.accountBalance,
    dayStartBalance: cfg.accountBalance,
    dayKey: Math.floor(start / 86_400_000),
    dailyTrades: 0,
    dailyLoss: 0,
    drawdownPercent: 0,
    halted: false,
    open: null,
    trades: [],
    queue: [],
    events: [],
    telemetry: EMPTY_TELEMETRY,
    feedStatus: "connected",
    feedLatency: 0,
    nextId: 1,
    rng,
    nextT: start,
  };
  for (let i = 0; i < 720; i++) st.bars.push(nextSimBar(st, cfg));
  st.dayKey = st.bars[st.bars.length - 1].day;
  st.dayStartBalance = st.balance;
  evaluate(st, cfg, false);
  addEvent(
    st,
    "SYSTEM",
    "sys",
    "SafeScalper-only engine armed · seven gates · small-account guard active",
  );
  return st;
}

export function createLiveEngine(bars: Bar[], cfg: EngineConfig): EngineState {
  const st = createEngine(11, cfg);
  st.bars = [...bars].sort((a, b) => a.t - b.t);
  const latest = st.bars[st.bars.length - 1];
  st.nextT =
    (latest?.t ?? Date.now()) +
    (TIMEFRAMES.find((x) => x.label === cfg.timeframe)?.ms ?? 300_000);
  st.feedStatus = "connected";
  st.balance = cfg.brokerSpec.balance || cfg.accountBalance;
  st.equity = cfg.brokerSpec.equity || st.balance;
  st.peakEquity = Math.max(st.balance, st.equity);
  st.dayStartBalance = st.balance;
  st.dayKey = latest?.day ?? Math.floor(Date.now() / 86_400_000);
  evaluate(st, cfg, false);
  return st;
}

export function processClosedBar(
  st: EngineState,
  cfg: EngineConfig,
  bar: Bar,
  allowEntries = true,
) {
  const last = st.bars[st.bars.length - 1];
  if (last && bar.t <= last.t) return;
  st.bars.push(bar);
  if (st.bars.length > 2400) st.bars.splice(0, st.bars.length - 2400);
  updateCircuitBreakers(st, cfg, bar);
  manageOpen(st, cfg, bar);
  updateCircuitBreakers(st, cfg, bar);
  for (const q of st.queue)
    if (
      q.status === "PENDING" &&
      bar.t >= q.expiresAtTime &&
      q.dispatchStatus !== "SENDING" &&
      q.dispatchStatus !== "UNKNOWN"
    ) {
      q.status = "REJECTED";
      q.reason = "Signal expired after three closed bars";
    }
  evaluate(st, cfg, !st.halted && allowEntries);
}

export function advance(st: EngineState, cfg: EngineConfig) {
  processClosedBar(st, cfg, nextSimBar(st, cfg));
}
export function feedLiveBar(
  st: EngineState,
  cfg: EngineConfig,
  bar: Bar,
  closed: boolean,
  allowEntries = true,
) {
  if (closed) processClosedBar(st, cfg, bar, allowEntries);
  else st.formingBar = { ...bar };
}

export function refreshTelemetry(st: EngineState, cfg: EngineConfig) {
  evaluate(st, cfg, false);
}

export function approvalBlock(
  st: EngineState,
  cfg: EngineConfig,
  q: QueueItem,
): string {
  if (
    q.status !== "PENDING" ||
    q.dispatchStatus === "SENDING" ||
    q.dispatchStatus === "UNKNOWN"
  )
    return "Signal is not available for approval";
  const bar = st.bars[st.bars.length - 1];
  if (
    !bar ||
    bar.t >= q.expiresAtTime ||
    (cfg.feedMode === "mt5" && Date.now() >= q.expiresAtTime)
  )
    return "Signal expired";
  if (q.source !== cfg.feedMode) return "Signal/feed mode mismatch";
  const risk = calculateRisk(st, cfg);
  const blocked = safetyBlock(st, cfg, bar, risk, true);
  if (blocked) return blocked;
  if (q.risk > risk.riskBudget + 1e-8 || q.brokerLots > risk.lots + 1e-8)
    return "Risk settings changed — wait for a new signal";
  const mark = st.formingBar?.c ?? bar.c;
  if (
    (q.side === "LONG" && (mark <= q.sl || mark >= q.tp)) ||
    (q.side === "SHORT" && (mark >= q.sl || mark <= q.tp))
  )
    return "Price has passed a protective level";
  return "";
}

export function decideQueue(
  st: EngineState,
  id: number,
  approve: boolean,
  cfg: EngineConfig,
): Trade | null {
  const q = st.queue.find(
    (item) => item.id === id && item.status === "PENDING",
  );
  if (!q) return null;
  if (q.dispatchStatus === "SENDING" || q.dispatchStatus === "UNKNOWN")
    return null;
  if (!approve) {
    q.status = "REJECTED";
    q.reason = "Rejected by operator";
    return null;
  }
  const reason = approvalBlock(st, cfg, q);
  // Only broker receipts may open an MT5 position. Never simulate a broker fill.
  if (reason || cfg.feedMode === "mt5") {
    q.reason = reason || "Broker acknowledgement required";
    return null;
  }
  q.status = "APPROVED";
  const trade: Trade = { ...q, open: true };
  openTrade(st, trade, Date.now());
  return trade;
}

export function computeStats(st: EngineState): EngineStats {
  const closed = st.trades.filter((t) => !t.open),
    wins = closed.filter((t) => (t.pnl ?? 0) > 0),
    losses = closed.filter((t) => (t.pnl ?? 0) < 0);
  const grossWin = wins.reduce((sum, t) => sum + (t.pnl ?? 0), 0),
    grossLoss = Math.abs(losses.reduce((sum, t) => sum + (t.pnl ?? 0), 0)),
    netPnl = closed.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
  return {
    closed: closed.length,
    wins: wins.length,
    losses: losses.length,
    winRate: closed.length ? (wins.length / closed.length) * 100 : 0,
    netPnl,
    profitFactor: grossLoss
      ? grossWin / grossLoss
      : grossWin > 0
        ? Infinity
        : 0,
    expectancy: closed.length ? netPnl / closed.length : 0,
  };
}

export function simulationSpec(
  symbol: string,
  balance: number,
): BrokerSymbolSpec {
  const meta =
    SUPPORTED_SYMBOLS.find((x) => x.symbol === symbol) ?? SUPPORTED_SYMBOLS[0];
  return {
    ...DEFAULT_SIM_SPEC,
    symbol: meta.symbol,
    digits: meta.digits,
    point: meta.point,
    tickSize: meta.point,
    tickValue: meta.point * meta.contractSize,
    lossPerLot100Points: 100 * meta.point * meta.contractSize,
    marginPerMinLot:
      ((symbol === "XAUUSD" ? 2650 : symbol === "XAGUSD" ? 30 : 1.08) *
        meta.contractSize *
        0.01) /
      100,
    contractSize: meta.contractSize,
    spreadPoints: meta.spread / meta.point,
    balance,
    equity: balance,
    freeMargin: balance,
    checkedAt: Date.now(),
  };
}
