import type { Bar, EngineConfig, EngineState, Trade, Aoi } from "./types";
import { fmtP } from "./types";

export interface GexRegime {
  gex: "POSITIVE_GAMMA" | "NEGATIVE_GAMMA" | "NEUTRAL_GAMMA";
  vixEstimate: number;
  structure: "VALUE_UP" | "VALUE_DOWN" | "BALANCE_RANGE";
  description: string;
}

export interface FibOteZone {
  swingHigh: number;
  swingLow: number;
  range: number;
  fib705: number;
  fib788: number; // Golden Pocket sweet spot
  fib886: number; // Deep Discount extreme
  inDiscountZone: boolean; // Buy area
  inPremiumZone: boolean; // Sell area
  activeZoneType: "DISCOUNT_BUY" | "PREMIUM_SELL" | "NO_TRADE_ZONE";
}

export interface OrderFlowAbsorption {
  barDelta: number;
  cumulativeDelta: number;
  isVolumeSpike: boolean;
  volumeRatio: number; // Vol / AvgVol
  absorptionType: "TRAPPED_SELLERS_BUY_ABSORPTION" | "TRAPPED_BUYERS_SELL_ABSORPTION" | "NONE";
  deltaDivergence: boolean;
  divergenceType: "BULLISH_CVD_DIV" | "BEARISH_CVD_DIV" | "NONE";
  details: string;
}

export interface Creamer4LayerResult {
  layer1_Environment: {
    passed: boolean;
    gex: GexRegime;
    score: number;
  };
  layer2_Location: {
    passed: boolean;
    ote: FibOteZone;
    score: number;
  };
  layer3_Confirmation: {
    passed: boolean;
    orderFlow: OrderFlowAbsorption;
    score: number;
  };
  layer4_Execution: {
    isReady: boolean;
    side: "LONG" | "SHORT" | null;
    entry: number;
    sl: number;
    tp: number;
    rr: number;
    reason: string;
  };
  totalScore: number; // 0 - 100
  verdict: string;
}

/** 1. Layer 1: Environment - GEX Proxy & Market Structure Detection */
export function calculateGEXProxy(bars: Bar[], atr: number, lastPrice: number): GexRegime {
  // Approximate VIX / Realized Volatility Proxy
  const annualizedVol = ((atr / Math.max(1, lastPrice)) * 100) * Math.sqrt(252);
  const vixEstimate = Number(Math.max(10, Math.min(45, annualizedVol)).toFixed(1));

  let gex: GexRegime["gex"] = "NEUTRAL_GAMMA";
  if (vixEstimate >= 20) {
    gex = "NEGATIVE_GAMMA"; // High volatility, aggressive directional expansions
  } else if (vixEstimate <= 15.5) {
    gex = "POSITIVE_GAMMA"; // Low volatility, market pinned, mean-reversion favored
  }

  // Market Structure: 3 consecutive Higher Highs/Lows vs Lower Lows/Highs
  let structure: GexRegime["structure"] = "BALANCE_RANGE";
  if (bars.length >= 6) {
    const b0 = bars[bars.length - 1];
    const b1 = bars[bars.length - 2];
    const b2 = bars[bars.length - 3];
    const b3 = bars[bars.length - 4];

    const isHH = b0.h > b1.h && b1.h > b2.h;
    const isHL = b0.l > b1.l && b1.l > b2.l;
    const isLL = b0.l < b1.l && b1.l < b2.l;
    const isLH = b0.h < b1.h && b1.h < b2.h;

    if (isHH && isHL) structure = "VALUE_UP";
    else if (isLL && isLH) structure = "VALUE_DOWN";
    else structure = "BALANCE_RANGE";
  }

  const description =
    gex === "NEGATIVE_GAMMA"
      ? `Negative Gamma (Vol ${vixEstimate}) · Fast Breakout & Trend Runner Environment`
      : gex === "POSITIVE_GAMMA"
      ? `Positive Gamma (Vol ${vixEstimate}) · Range-Bound / Fakeout & Absorption Traps Favored`
      : `Neutral Gamma (Vol ${vixEstimate}) · Balanced Institutional Order Flow`;

  return { gex, vixEstimate, structure, description };
}

/** 2. Layer 2: Location - Chris Creamer OTE Fibonacci Zones (0.705, 0.788, 0.886) */
export function calculateFibOteZones(bars: Bar[], lookback: number = 32): FibOteZone {
  if (bars.length === 0) {
    return {
      swingHigh: 0,
      swingLow: 0,
      range: 0,
      fib705: 0,
      fib788: 0,
      fib886: 0,
      inDiscountZone: false,
      inPremiumZone: false,
      activeZoneType: "NO_TRADE_ZONE",
    };
  }

  const start = Math.max(0, bars.length - lookback);
  let swingHigh = bars[start].h;
  let swingLow = bars[start].l;

  for (let i = start; i < bars.length; i++) {
    if (bars[i].h > swingHigh) swingHigh = bars[i].h;
    if (bars[i].l < swingLow) swingLow = bars[i].l;
  }

  const range = Math.max(0.1, swingHigh - swingLow);
  const curPrice = bars[bars.length - 1].c;

  // Discount OTE for Longs (Calculated from High downward)
  const fib705_buy = Number((swingHigh - range * 0.705).toFixed(2));
  const fib788_buy = Number((swingHigh - range * 0.788).toFixed(2)); // Golden pocket sweet spot
  const fib886_buy = Number((swingHigh - range * 0.886).toFixed(2)); // Deep discount
  const inDiscountZone = curPrice >= fib886_buy && curPrice <= fib705_buy;

  // Premium OTE for Shorts (Calculated from Low upward)
  const fib705_sell = Number((swingLow + range * 0.705).toFixed(2));
  const fib788_sell = Number((swingLow + range * 0.788).toFixed(2));
  const fib886_sell = Number((swingLow + range * 0.886).toFixed(2));
  const inPremiumZone = curPrice <= fib886_sell && curPrice >= fib705_sell;

  const activeZoneType = inDiscountZone
    ? "DISCOUNT_BUY"
    : inPremiumZone
    ? "PREMIUM_SELL"
    : "NO_TRADE_ZONE";

  return {
    swingHigh,
    swingLow,
    range,
    fib705: inDiscountZone ? fib705_buy : fib705_sell,
    fib788: inDiscountZone ? fib788_buy : fib788_sell,
    fib886: inDiscountZone ? fib886_buy : fib886_sell,
    inDiscountZone,
    inPremiumZone,
    activeZoneType,
  };
}

/** 3. Layer 3: Confirmation - Order Flow Delta, CVD Divergence & Absorption Detection */
export function detectOrderFlowAbsorption(
  bars: Bar[],
  atr: number,
  prevCumulativeDelta: number = 0
): OrderFlowAbsorption {
  if (bars.length < 2) {
    return {
      barDelta: 0,
      cumulativeDelta: 0,
      isVolumeSpike: false,
      volumeRatio: 1.0,
      absorptionType: "NONE",
      deltaDivergence: false,
      divergenceType: "NONE",
      details: "Insufficient Data",
    };
  }

  const cur = bars[bars.length - 1];
  const candleRange = Math.max(0.01, cur.h - cur.l);
  const bodySize = Math.abs(cur.c - cur.o);
  const lowerWick = Math.min(cur.o, cur.c) - cur.l;
  const upperWick = cur.h - Math.max(cur.o, cur.c);

  // Compute Volume Delta: Buy Vol vs Sell Vol
  const deltaRatio = (cur.c - cur.o) / candleRange;
  const barDelta = Math.round((cur.v || 500) * deltaRatio);
  const cumulativeDelta = prevCumulativeDelta + barDelta;

  // Average Volume calculation (Last 14 bars)
  const avgLookback = Math.min(14, bars.length);
  let volSum = 0;
  for (let i = bars.length - avgLookback; i < bars.length; i++) {
    volSum += bars[i].v || 500;
  }
  const avgVol = volSum / avgLookback;
  const volumeRatio = Number(((cur.v || 500) / Math.max(1, avgVol)).toFixed(2));
  const isVolumeSpike = volumeRatio >= 2.0;

  // Absorption Detection
  let absorptionType: OrderFlowAbsorption["absorptionType"] = "NONE";
  let deltaDivergence = false;
  let divergenceType: OrderFlowAbsorption["divergenceType"] = "NONE";
  let details = "Normal Order Flow";

  // Check 1: Trapped Sellers (Passive Buyer Absorption)
  // Large negative delta, or High Vol + Small Body at lows, but candle pushed up / holds
  const prevBar = bars[bars.length - 2];
  const isLowerLowPrice = cur.l < prevBar.l;

  if ((barDelta < -120 || (isVolumeSpike && bodySize < 0.35 * candleRange)) && lowerWick >= 0.45 * candleRange) {
    absorptionType = "TRAPPED_SELLERS_BUY_ABSORPTION";
    details = `⚡ TRAPPED SELLERS DETECTED: ${Math.abs(barDelta)} delta absorbed at $${fmtP(cur.l)} by institutional limit buyers`;
  } else if ((barDelta > 120 || (isVolumeSpike && bodySize < 0.35 * candleRange)) && upperWick >= 0.45 * candleRange) {
    absorptionType = "TRAPPED_BUYERS_SELL_ABSORPTION";
    details = `⚡ TRAPPED BUYERS DETECTED: +${barDelta} delta absorbed at $${fmtP(cur.h)} by institutional limit sellers`;
  }

  // Check 2: CVD Divergence
  if (isLowerLowPrice && barDelta > 0) {
    deltaDivergence = true;
    divergenceType = "BULLISH_CVD_DIV";
    details += " | Bullish CVD Divergence (Price Lower Low with Positive Delta)";
  } else if (cur.h > prevBar.h && barDelta < 0) {
    deltaDivergence = true;
    divergenceType = "BEARISH_CVD_DIV";
    details += " | Bearish CVD Divergence (Price Higher High with Negative Delta)";
  }

  return {
    barDelta,
    cumulativeDelta,
    isVolumeSpike,
    volumeRatio,
    absorptionType,
    deltaDivergence,
    divergenceType,
    details,
  };
}

/** 4. Layer 4: Full 4-Layer Master Evaluator */
export function evaluateCreamer4Layer(
  bars: Bar[],
  atr: number,
  lastPrice: number,
  prevCvd: number = 0,
  targetRr: number = 2.5
): Creamer4LayerResult {
  const env = calculateGEXProxy(bars, atr, lastPrice);
  const loc = calculateFibOteZones(bars, 32);
  const conf = detectOrderFlowAbsorption(bars, atr, prevCvd);

  // Scoring
  let score1 = env.gex !== "NEUTRAL_GAMMA" ? 25 : 15;
  let score2 = loc.activeZoneType !== "NO_TRADE_ZONE" ? 25 : 5;
  let score3 = conf.absorptionType !== "NONE" ? 30 : conf.deltaDivergence ? 20 : 10;
  let score4 = (env.structure === "VALUE_UP" && loc.inDiscountZone) || (env.structure === "VALUE_DOWN" && loc.inPremiumZone) ? 20 : 10;

  const totalScore = Math.min(100, score1 + score2 + score3 + score4);

  // Execution Trigger
  let isReady = false;
  let side: "LONG" | "SHORT" | null = null;
  let entry = lastPrice;
  let sl = 0;
  let tp = 0;
  let reason = "";

  const curBar = bars[bars.length - 1];

  if (loc.inDiscountZone && (conf.absorptionType === "TRAPPED_SELLERS_BUY_ABSORPTION" || conf.divergenceType === "BULLISH_CVD_DIV")) {
    isReady = true;
    side = "LONG";
    entry = curBar.c;
    sl = Math.min(curBar.l - 0.25 * atr, entry - 0.8 * atr);
    const slDist = Math.abs(entry - sl);
    tp = entry + slDist * targetRr;
    reason = `4-Layer Creamer Long Setup: Discount OTE Zone (${fmtP(loc.fib705)} - ${fmtP(loc.fib886)}) + Trapped Sellers Absorption at ${fmtP(curBar.l)}.`;
  } else if (loc.inPremiumZone && (conf.absorptionType === "TRAPPED_BUYERS_SELL_ABSORPTION" || conf.divergenceType === "BEARISH_CVD_DIV")) {
    isReady = true;
    side = "SHORT";
    entry = curBar.c;
    sl = Math.max(curBar.h + 0.25 * atr, entry + 0.8 * atr);
    const slDist = Math.abs(entry - sl);
    tp = entry - slDist * targetRr;
    reason = `4-Layer Creamer Short Setup: Premium OTE Zone (${fmtP(loc.fib705)} - ${fmtP(loc.fib886)}) + Trapped Buyers Absorption at ${fmtP(curBar.h)}.`;
  }

  const verdict = isReady
    ? `🎯 CREAMER 4-LAYER SETUP READY: ${reason}`
    : loc.activeZoneType === "NO_TRADE_ZONE"
    ? `WAIT FOR PULLBACK: Price (${fmtP(lastPrice)}) outside 0.705-0.886 OTE Kill Zone. No entry.`
    : `IN OTE ZONE (${loc.activeZoneType.replace("_", " ")}): Awaiting Order Flow Absorption / Delta Divergence.`;

  return {
    layer1_Environment: { passed: env.gex !== "NEUTRAL_GAMMA", gex: env, score: score1 },
    layer2_Location: { passed: loc.activeZoneType !== "NO_TRADE_ZONE", ote: loc, score: score2 },
    layer3_Confirmation: { passed: conf.absorptionType !== "NONE", orderFlow: conf, score: score3 },
    layer4_Execution: { isReady, side, entry, sl, tp, rr: targetRr, reason },
    totalScore,
    verdict,
  };
}
