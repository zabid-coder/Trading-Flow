import type { Bar, EngineState } from "./types";

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

/** Generate the next bar with dynamic timeframe interval. */
export function nextBar(st: EngineState, intervalMs: number = BAR_MS): Bar {
  const rng = st.rng;
  const t = st.nextT;
  st.nextT += intervalMs;

  const hour = Math.floor(((t % DAY_MS) + DAY_MS) / 3600000) % 24;
  const s = sessionInfo(hour);

  // regime drift — occasional flips between trend and chop
  if (rng() < 0.016) st.trend = (rng() - 0.5) * 2;

  const tfMult = Math.sqrt(intervalMs / BAR_MS);
  const vol = (st.price * 0.0012) * s.mult * (0.72 + rng() * 0.56) * tfMult;
  const drift = st.trend * vol * 0.16;

  const o = st.price;
  let c = o + drift + gauss(rng) * vol * 0.52;

  // stretch reversion toward the day's opening price
  const stretch = c - st.dayOpen;
  if (Math.abs(stretch) > (st.price * 0.01)) c -= stretch * 0.11;

  let wU = Math.abs(gauss(rng)) * vol * 0.42;
  let wD = Math.abs(gauss(rng)) * vol * 0.42;

  // liquidity-sweep / rejection bars occur naturally at the edges —
  // inject realistic hunt-and-reject wicks ~9% of the time
  if (rng() < 0.09) {
    const huntLow = rng() < 0.5;
    const body = vol * 0.22 * rng();
    if (huntLow) {
      c = o + body * 0.6;
      wD = vol * (1.7 + rng() * 1.5);
      wU = vol * 0.14;
    } else {
      c = o - body * 0.6;
      wU = vol * (1.7 + rng() * 1.5);
      wD = vol * 0.14;
    }
  }

  const h = Math.max(o, c) + wU;
  const l = Math.min(o, c) - wD;
  const v = s.mult * (0.45 + rng()) * (1 + Math.abs(c - o) / Math.max(1e-5, vol));

  st.price = c;

  return { t, o, h, l, c, v, day: Math.floor(t / DAY_MS) };
}
