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

/** Generate the next bar using a multi-regime Markov-switching model. */
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

  const o = st.price;
  let c = o;
  let wU = 0;
  let wD = 0;
  let v = s.mult * (0.6 + rng() * 0.8);

  switch (st.regime) {
    case "TRENDING_BULL": {
      const dirVol = baseVol * (1.1 + rng() * 0.5);
      const body = dirVol * (0.45 + rng() * 0.65);
      c = o + body;
      wU = Math.abs(gauss(rng)) * dirVol * 0.35;
      wD = Math.abs(gauss(rng)) * dirVol * 0.25;
      v *= 1.45;
      break;
    }
    case "TRENDING_BEAR": {
      const dirVol = baseVol * (1.1 + rng() * 0.5);
      const body = dirVol * (0.45 + rng() * 0.65);
      c = o - body;
      wU = Math.abs(gauss(rng)) * dirVol * 0.25;
      wD = Math.abs(gauss(rng)) * dirVol * 0.35;
      v *= 1.45;
      break;
    }
    case "LIQUIDITY_HUNT": {
      // High volatility spike sweeping levels and closing inside (Trap/Rejection)
      const sweepVol = baseVol * (1.6 + rng() * 1.4);
      const huntLow = rng() < 0.5;
      const body = sweepVol * 0.18 * (rng() - 0.5);
      c = o + body;
      if (huntLow) {
        // Long lower shadow (LPR)
        wD = sweepVol * (1.6 + rng() * 1.2);
        wU = sweepVol * 0.18 * rng();
      } else {
        // Long upper shadow (HPR)
        wU = sweepVol * (1.6 + rng() * 1.2);
        wD = sweepVol * 0.18 * rng();
      }
      v *= 2.1; // Significant volume confluence during sweeps
      break;
    }
    case "RANGING_CHOP":
    default: {
      // Mean-reversion toward day open / range centroid
      const chopVol = baseVol * (0.75 + rng() * 0.45);
      const stretch = o - st.dayOpen;
      const pull = stretch * 0.08;
      c = o - pull + gauss(rng) * chopVol * 0.45;
      wU = Math.abs(gauss(rng)) * chopVol * 0.55;
      wD = Math.abs(gauss(rng)) * chopVol * 0.55;
      v *= 0.85;
      break;
    }
  }

  const h = Math.max(o, c) + Math.max(0.01, wU);
  const l = Math.min(o, c) - Math.max(0.01, wD);
  v = Math.max(0.1, v * (1 + Math.abs(c - o) / Math.max(1e-5, baseVol)));

  st.price = c;

  return { t, o, h, l, c, v, day: Math.floor(t / DAY_MS) };
}
