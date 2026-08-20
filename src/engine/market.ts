import type { Bar, EngineState, MarketRegime } from "./types";

export const BAR_MS = 15 * 60 * 1000; // 15-minute bars
export const DAY_MS = 86400000;

/** mulberry32 seeded RNG */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SessionInfo {
  name: "SYD" | "TOK" | "LON" | "NY" | "OFF";
  mult: number;
  overlap: boolean;
}

/** UTC-hour based session model with volatility profile */
export function sessionInfo(hour: number): SessionInfo {
  if (hour >= 12 && hour <= 15) return { name: "NY", mult: 2.15, overlap: true }; // LON/NY overlap
  if (hour >= 7 && hour <= 11) return { name: "LON", mult: 1.65, overlap: false };
  if (hour === 16) return { name: "LON", mult: 1.45, overlap: false };
  if (hour >= 17 && hour <= 20) return { name: "NY", mult: 1.4, overlap: false };
  if (hour >= 3 && hour <= 6) return { name: "TOK", mult: 1.05, overlap: false };
  if (hour === 2) return { name: "TOK", mult: 0.9, overlap: false };
  return { name: "SYD", mult: 0.68, overlap: false };
}

export function activeSessions(hour: number): Record<string, boolean> {
  return {
    SYD: hour >= 21 || hour <= 5,
    TOK: hour >= 0 && hour <= 8,
    LON: hour >= 7 && hour <= 15,
    NY: hour >= 12 && hour <= 20,
  };
}

function gauss(rng: () => number) {
  const u = Math.max(rng(), 1e-9);
  const v = Math.max(rng(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Transition matrix for market regimes */
function pickNextRegime(current: MarketRegime, rng: () => number): { regime: MarketRegime; duration: number } {
  const r = rng();
  let next: MarketRegime = "RANGING_CHOP";

  if (current === "RANGING_CHOP") {
    if (r < 0.35) next = "RANGING_CHOP";
    else if (r < 0.60) next = "LIQUIDITY_HUNT";
    else if (r < 0.80) next = "TRENDING_BULL";
    else next = "TRENDING_BEAR";
  } else if (current === "TRENDING_BULL") {
    if (r < 0.50) next = "TRENDING_BULL";
    else if (r < 0.75) next = "LIQUIDITY_HUNT"; // blow-off trap top
    else next = "RANGING_CHOP";
  } else if (current === "TRENDING_BEAR") {
    if (r < 0.50) next = "TRENDING_BEAR";
    else if (r < 0.75) next = "LIQUIDITY_HUNT"; // flush trap bottom
    else next = "RANGING_CHOP";
  } else {
    // After LIQUIDITY_HUNT -> usually mean-revert or trend reverse
    if (r < 0.45) next = "RANGING_CHOP";
    else if (r < 0.75) next = "TRENDING_BULL";
    else next = "TRENDING_BEAR";
  }

  // Duration in bars (between 6 and 28 bars)
  const duration = Math.floor(6 + rng() * 22);
  return { regime: next, duration };
}

/** Generate the next bar using an enhanced Markov-switching institutional microstructure model. */
export function nextBar(st: EngineState, intervalMs: number = BAR_MS): Bar {
  const rng = st.rng;
  const t = st.nextT;
  st.nextT += intervalMs;

  const hour = Math.floor(((t % DAY_MS) + DAY_MS) / 3600000) % 24;
  const s = sessionInfo(hour);

  // Initialize or step regime counter
  if (!st.regime || st.regimeBarsLeft == null || st.regimeBarsLeft <= 0) {
    const { regime, duration } = pickNextRegime(st.regime || "RANGING_CHOP", rng);
    st.regime = regime;
    st.regimeBarsLeft = duration;
  } else {
    st.regimeBarsLeft--;
  }

  const tfMult = Math.sqrt(intervalMs / BAR_MS);
  const baseVol = st.price * 0.0011 * s.mult * tfMult;
  const atr = st.atr || baseVol * 1.5;

  // 1. Session Rollover Gaps & High-Impact News Gaps
  const isNewDay = Math.floor(t / DAY_MS) !== Math.floor((t - intervalMs) / DAY_MS);
  let gap = 0;
  if (isNewDay && rng() < 0.35) {
    // 35% of day rollovers experience overnight gap jumps (0.8x to 2.4x ATR)
    const gapDir = rng() < 0.5 ? 1 : -1;
    gap = gapDir * atr * (0.8 + rng() * 1.6);
  } else if (rng() < 0.0035) {
    // Intraday sudden news impulse gap (e.g. CPI / NFP release)
    const gapDir = rng() < 0.5 ? 1 : -1;
    gap = gapDir * atr * (1.0 + rng() * 1.8);
  }

  const o = st.price + gap;
  let c = o;
  let wU = 0;
  let wD = 0;
  let v = s.mult * (0.6 + rng() * 0.8);

  // 2. Regime-Specific Bar Generation
  switch (st.regime) {
    case "TRENDING_BULL": {
      const dirVol = baseVol * (1.15 + rng() * 0.55);
      const body = dirVol * (0.40 + rng() * 0.70);
      c = o + body;
      wU = Math.abs(gauss(rng)) * dirVol * 0.30;
      wD = Math.abs(gauss(rng)) * dirVol * 0.22;
      v *= 1.5;
      break;
    }
    case "TRENDING_BEAR": {
      const dirVol = baseVol * (1.15 + rng() * 0.55);
      const body = dirVol * (0.40 + rng() * 0.70);
      c = o - body;
      wU = Math.abs(gauss(rng)) * dirVol * 0.22;
      wD = Math.abs(gauss(rng)) * dirVol * 0.30;
      v *= 1.5;
      break;
    }
    case "LIQUIDITY_HUNT": {
      // High volatility sweep hunting previous liquidity pools
      const sweepVol = baseVol * (1.5 + rng() * 1.5);
      const huntLow = rng() < 0.5;
      const isCleanRejection = rng() < 0.60; // 60% clean rejection, 40% messy wick fill

      if (isCleanRejection) {
        const body = sweepVol * 0.16 * (rng() - 0.5);
        c = o + body;
        if (huntLow) {
          wD = sweepVol * (1.5 + rng() * 1.3);
          wU = sweepVol * 0.22 * rng();
        } else {
          wU = sweepVol * (1.5 + rng() * 1.3);
          wD = sweepVol * 0.22 * rng();
        }
      } else {
        // Messy rejection (less pronounced wick, larger counter-body)
        const body = sweepVol * 0.45 * (huntLow ? 0.8 : -0.8);
        c = o + body;
        wD = sweepVol * (0.8 + rng() * 0.7);
        wU = sweepVol * (0.8 + rng() * 0.7);
      }
      v *= 2.2;
      break;
    }
    case "RANGING_CHOP":
    default: {
      // Mean-reverting chop with clustering near nearest extremes
      const chopVol = baseVol * (0.75 + rng() * 0.45);
      const stretch = o - st.dayOpen;
      const pull = stretch * 0.09;
      c = o - pull + gauss(rng) * chopVol * 0.40;
      wU = Math.abs(gauss(rng)) * chopVol * 0.48;
      wD = Math.abs(gauss(rng)) * chopVol * 0.48;
      v *= 0.85;
      break;
    }
  }

  // 3. Flash Crash / Liquidity Void Tail Events (~2-3 times per month, 0.12% probability)
  if (rng() < 0.0012) {
    const isCrashDown = rng() < 0.70;
    const flashMagnitude = atr * (3.0 + rng() * 1.4); // 3.0x to 4.4x ATR spike
    if (isCrashDown) {
      wD = Math.max(wD, flashMagnitude);
      c = o - flashMagnitude * (0.10 + rng() * 0.15); // 75-90% rapid wick recovery
    } else {
      wU = Math.max(wU, flashMagnitude);
      c = o + flashMagnitude * (0.10 + rng() * 0.15);
    }
    v *= 3.5;
  }

  const h = Math.max(o, c) + Math.max(0.01, wU);
  const l = Math.min(o, c) - Math.max(0.01, wD);
  v = Math.max(0.1, v * (1 + Math.abs(c - o) / Math.max(1e-5, baseVol)));

  st.price = c;

  return { t, o, h, l, c, v, day: Math.floor(t / DAY_MS) };
}
