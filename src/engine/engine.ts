import { BAR_MS, DAY_MS, mulberry32, nextBar } from "./market";
import type {
  Aoi,
  Bar,
  CandleClass,
  CheckStep,
  EngineConfig,
  EngineState,
  SessionLevels,
  Trade,
} from "./types";
import { DAY_NAMES, defaultWindowGrid, fmtP, windowParts } from "./types";

const BASE_T = Date.UTC(2025, 2, 3, 0, 0, 0); // simulated feed epoch

export const DEFAULT_CFG: EngineConfig = {
  identity: "reversal",
  selectedStrategy: "sweep_reversal",
  strategyMode: "single",
  enabledStrategies: {
    sweep_reversal: true,
    ob_fvg_retest: true,
    session_breakout: true,
    ema_pullback: true,
    rsi_exhaustion: true,
  },
  minConfluenceCount: 2,
  account: 1000,
  riskUSD: 20,
  rr: 2.0,
  maxDailySL: 2,
  rejThresh: 0.58,
  powerAtr: 1.2,
  pointValue: 1.0, // XAUUSD: $1.00 P&L per oz per $1.00 move
  tripleTol: 0.14,
  spread: 0.35, // realistic gold spread
  actionCenter: true, // supervised execution ON
  windowEnabled: false,
  windowGrid: defaultWindowGrid(),
  telegram: false,
  aoi: { pdh: true, triple: true, ob: true, session: true },
  feedMode: "simulated",
  activeSymbol: "XAUUSD",
  timeframe: "15m",
  chartView: "native",
  autoBreakeven: true,
  beThresholdR: 1.0,
  soundEnabled: true,
  sizingMode: "percentEquity",
  equityRiskPct: 2.0,
  kellyFraction: 0.35,
  trailingStop: true,
  trailThresholdR: 1.5,
  trailAtrDist: 1.0,
  slippagePoints: 0.15,
  minSlAtr: 0.2,
  maxSlAtr: 4.0,
  trendFilter: true,
  killzoneFilter: true,
  confluenceGate: 75,
  rbEnabled: false,
  rbStartH: 7,
  rbStartM: 0,
  rbEndH: 10,
  rbEndM: 0,
  rbBufferPoints: 20, // points (like $2.00 in gold)
};

const seenZones = new WeakMap<EngineState, Set<string>>();

function ev(
  st: EngineState,
  time: number,
  tag: "ENTRY" | "SL" | "TP" | "SYS" | "AOI" | "RISK" | "HOLD" | "DECIDE",
  tone: "long" | "short" | "sys" | "risk" | "aoi",
  msg: string
) {
  st.events.push({ id: st.nextId++, time, tag, msg, tone });
  if (st.events.length > 140) st.events.splice(0, st.events.length - 140);
}

/* ------------------------------------------------------------------ */
/*  Candle classification — Strict Reaction Morphology filter          */
/* ------------------------------------------------------------------ */
export function classify(bar: Bar, atr: number, cfg: EngineConfig): CandleClass {
  const range = bar.h - bar.l;
  if (range <= 0 || range < 0.25 * atr) return "BORING";
  const body = Math.abs(bar.c - bar.o);
  const up = bar.h - Math.max(bar.o, bar.c);
  const dn = Math.min(bar.o, bar.c) - bar.l;

  // Strict wick-to-body & opposing-wick morphology
  if (dn >= range * cfg.rejThresh && dn > body * 1.35 && up <= range * 0.28) return "LPR";
  if (up >= range * cfg.rejThresh && up > body * 1.35 && dn <= range * 0.28) return "HPR";
  if (body >= 0.65 * range && range >= cfg.powerAtr * atr)
    return bar.c > bar.o ? "POWER_BULL" : "POWER_BEAR";
  if (body <= 0.15 * range) return "BORING"; // spinning top / doji
  if (bar.c > bar.o && up >= range * 0.38 && dn < range * 0.18) return "BORING"; // wick fighting momentum
  if (bar.c < bar.o && dn >= range * 0.38 && up < range * 0.18) return "BORING";
  return "NEUTRAL";
}

/* ------------------------------------------------------------------ */
/*  Areas of Interest                                                  */
/* ------------------------------------------------------------------ */
function hourOf(t: number) {
  return Math.floor(((t % DAY_MS) + DAY_MS) / 3600000) % 24;
}

function dayStartIndex(bars: Bar[]): number {
  const d = bars[bars.length - 1].day;
  let i = bars.length - 1;
  while (i > 0 && bars[i - 1].day === d) i--;
  return i;
}

function computeSessionLevels(bars: Bar[], day: number): SessionLevels | null {
  let lonH = -1e9, lonL = 1e9, nyH = -1e9, nyL = 1e9, ovlH = -1e9, ovlL = 1e9;
  let hasLon = false, hasNy = false, hasOvl = false;
  for (const b of bars) {
    if (b.day !== day) continue;
    const h = hourOf(b.t);
    if (h >= 7 && h <= 15) { lonH = Math.max(lonH, b.h); lonL = Math.min(lonL, b.l); hasLon = true; }
    if (h >= 12 && h <= 20) { nyH = Math.max(nyH, b.h); nyL = Math.min(nyL, b.l); hasNy = true; }
    if (h >= 12 && h <= 15) { ovlH = Math.max(ovlH, b.h); ovlL = Math.min(ovlL, b.l); hasOvl = true; }
  }
  if (!hasLon || !hasNy || !hasOvl) return null;
  return { lonH, lonL, nyH, nyL, ovlH, ovlL };
}

function buildAois(st: EngineState, cfg: EngineConfig, cdhPrev: number, cdlPrev: number) {
  const A: Aoi[] = [];
  const bars = st.bars;
  const n = bars.length;
  const atr = st.atr || 1.0;
  const close = bars[n - 1].c;
  const dsi = dayStartIndex(bars);
  const barsInDay = n - dsi;

  const dedupSet = new Set<string>();
  const addZone = (aoi: Aoi) => {
    const key = `${aoi.role}:${Math.round(aoi.ty / Math.max(0.01, 0.25 * atr))}`;
    if (!dedupSet.has(key)) {
      dedupSet.add(key);
      A.push(aoi);
    }
  };

  // Type D — PDH / PDL + live CDH / CDL
  if (cfg.aoi.pdh) {
    if (st.pdh != null) addZone({ kind: "PDH", role: "R", y1: st.pdh, y2: st.pdh, ty: st.pdh, from: dsi, label: "PDH", active: true });
    if (st.pdl != null) addZone({ kind: "PDL", role: "S", y1: st.pdl, y2: st.pdl, ty: st.pdl, from: dsi, label: "PDL", active: true });
    if (barsInDay >= 10 && cdhPrev > 0) {
      addZone({ kind: "CDH", role: "R", y1: cdhPrev, y2: cdhPrev, ty: cdhPrev, from: dsi, label: "CDH", active: true });
      addZone({ kind: "CDL", role: "S", y1: cdlPrev, y2: cdlPrev, ty: cdlPrev, from: dsi, label: "CDL", active: true });
    }
  }

  // Type C — previous-session highs / lows + London–NY overlap
  if (cfg.aoi.session && st.ses) {
    const s = st.ses;
    addZone({ kind: "LON_H", role: "R", y1: s.lonH, y2: s.lonH, ty: s.lonH, from: dsi, label: "LON HIGH", active: true });
    addZone({ kind: "LON_L", role: "S", y1: s.lonL, y2: s.lonL, ty: s.lonL, from: dsi, label: "LON LOW", active: true });
    addZone({ kind: "NY_H", role: "R", y1: s.nyH, y2: s.nyH, ty: s.nyH, from: dsi, label: "NY HIGH", active: true });
    addZone({ kind: "NY_L", role: "S", y1: s.nyL, y2: s.nyL, ty: s.nyL, from: dsi, label: "NY LOW", active: true });
    addZone({ kind: "OVL_H", role: "R", y1: s.ovlH, y2: s.ovlH, ty: s.ovlH, from: dsi, label: "OVL HIGH", active: true });
    addZone({ kind: "OVL_L", role: "S", y1: s.ovlL, y2: s.ovlL, ty: s.ovlL, from: dsi, label: "OVL LOW", active: true });
  }

  // Type A — triple tops / triple bottoms from confirmed pivots with volume confluence
  if (cfg.aoi.triple) {
    const ph: { i: number; p: number; v: number }[] = [];
    const pl: { i: number; p: number; v: number }[] = [];
    const from = Math.max(2, n - 130);
    const avgVol = bars.slice(Math.max(0, n - 25)).reduce((acc, b) => acc + (b.v || 1), 0) / 25;

    for (let i = from; i <= n - 3; i++) {
      const b = bars[i];
      if (b.h > bars[i - 1].h && b.h > bars[i - 2].h && b.h > bars[i + 1].h && b.h > bars[i + 2].h) {
        if ((b.v || 1) >= 0.72 * avgVol) ph.push({ i, p: b.h, v: b.v || 1 });
      }
      if (b.l < bars[i - 1].l && b.l < bars[i - 2].l && b.l < bars[i + 1].l && b.l < bars[i + 2].l) {
        if ((b.v || 1) >= 0.72 * avgVol) pl.push({ i, p: b.l, v: b.v || 1 });
      }
    }
    if (ph.length >= 3) {
      const [p1, p2, p3] = ph.slice(-3);
      if (p2.i - p1.i >= 3 && p3.i - p2.i >= 3) {
        const mx = Math.max(p1.p, p2.p, p3.p);
        const mn = Math.min(p1.p, p2.p, p3.p);
        if (mx - mn <= (close * cfg.tripleTol) / 100 || mx - mn <= 0.35 * atr) {
          let dead = false;
          for (let j = p3.i + 2; j < n; j++) if (bars[j].c > mx + 0.45 * atr) { dead = true; break; }
          if (!dead) addZone({ kind: "TT", role: "R", y1: mn, y2: mx, ty: mx, from: p1.i, label: "TRIPLE TOP", active: true });
        }
      }
    }
    if (pl.length >= 3) {
      const [p1, p2, p3] = pl.slice(-3);
      if (p2.i - p1.i >= 3 && p3.i - p2.i >= 3) {
        const mx = Math.max(p1.p, p2.p, p3.p);
        const mn = Math.min(p1.p, p2.p, p3.p);
        if (mx - mn <= (close * cfg.tripleTol) / 100 || mx - mn <= 0.35 * atr) {
          let dead = false;
          for (let j = p3.i + 2; j < n; j++) if (bars[j].c < mn - 0.45 * atr) { dead = true; break; }
          if (!dead) addZone({ kind: "TB", role: "S", y1: mn, y2: mx, ty: mn, from: p1.i, label: "TRIPLE BOTTOM", active: true });
        }
      }
    }
  }

  // Type B — multi-bar (3-candle) order blocks anchored to valid fair value gaps
  if (cfg.aoi.ob) {
    let dCount = 0, sCount = 0;
    for (let i = n - 3; i >= Math.max(2, n - 90); i--) {
      if (dCount >= 2 && sCount >= 2) break;
      const b = bars[i];     // Candle 3
      const a = bars[i - 2]; // Candle 1 (Order Block origin)
      const gapMin = 0.10 * atr;

      if (b.l > a.h + gapMin) {
        // Bullish 3-bar FVG → candle i-2 is the demand order block
        const y1 = Math.min(a.o, a.c);
        const y2 = Math.max(a.o, a.c);
        if (dCount < 2 && y2 <= close - 0.12 * atr && y2 - y1 <= 3.5 * atr && y2 - y1 >= 0.12) {
          let mit = false;
          for (let j = i; j < n; j++) if (bars[j].c < y1) { mit = true; break; }
          if (!mit) {
            addZone({ kind: "OB_D", role: "S", y1, y2, ty: y1, from: i - 2, label: "DEMAND OB", active: true });
            dCount++;
          }
        }
      } else if (b.h < a.l - gapMin) {
        // Bearish 3-bar FVG → candle i-2 is the supply order block
        const y1 = Math.min(a.o, a.c);
        const y2 = Math.max(a.o, a.c);
        if (sCount < 2 && y1 >= close + 0.12 * atr && y2 - y1 <= 3.5 * atr && y2 - y1 >= 0.12) {
          let mit = false;
          for (let j = i; j < n; j++) if (bars[j].c > y2) { mit = true; break; }
          if (!mit) {
            addZone({ kind: "OB_S", role: "R", y1, y2, ty: y2, from: i - 2, label: "SUPPLY OB", active: true });
            sCount++;
          }
        }
      }
    }
  }

  st.aois = A;

  // announce newly formed zones once
  let seen = seenZones.get(st);
  if (!seen) { seen = new Set(); seenZones.set(st, seen); }
  for (const a of A) {
    if (a.kind === "TT" || a.kind === "TB" || a.kind === "OB_D" || a.kind === "OB_S") {
      const key = `${a.kind}:${a.ty.toFixed(1)}:${a.from}`;
      if (!seen.has(key)) {
        seen.add(key);
        ev(st, bars[n - 1].t, "AOI", "aoi", `${a.label} armed · ${fmtP(Math.min(a.y1, a.y2))}–${fmtP(Math.max(a.y1, a.y2))}`);
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Trade management & risk engine                                     */
/* ------------------------------------------------------------------ */
function settle(st: EngineState, cfg: EngineConfig, t: Trade, bar: Bar, outcome: "TP" | "SL", px: number) {
  const idx = st.bars.length - 1;
  const dir = t.side === "LONG" ? 1 : -1;
  // Account for realistic execution slippage
  const slippage = (cfg.slippagePoints || 0.15) * (st.regime === "LIQUIDITY_HUNT" ? 1.5 : 1.0);
  const realizedPx = outcome === "TP" ? px - (dir === 1 ? slippage : -slippage) : px + (dir === 1 ? -slippage : slippage);
  const pnl = dir * t.oz * (realizedPx - t.entry);

  t.open = false;
  t.outcome = outcome;
  t.exit = realizedPx;
  t.exitIndex = idx;
  t.exitTime = bar.t;
  t.pnl = pnl;
  t.slippage = slippage;
  t.r = pnl / Math.max(1, t.risk);
  st.balance += pnl;
  st.open = null;

  if (outcome === "TP") {
    ev(st, bar.t, "TP", t.side === "LONG" ? "long" : "short",
      `TP filled +$${pnl.toFixed(0)} (+${t.r.toFixed(1)}R) · ${t.setup}`);
  } else {
    st.dailySL += 1;
    ev(st, bar.t, "SL", "risk",
      `SL filled −$${Math.abs(pnl).toFixed(0)} · ${t.setup} · daily ${st.dailySL}/${cfg.maxDailySL}`);
    if (st.dailySL >= cfg.maxDailySL) {
      st.halted = true;
      ev(st, bar.t, "SYS", "sys",
        `Daily loss limit reached — engine HALTED until the next session day. Discipline is the edge.`);
    }
  }
}

function manage(st: EngineState, cfg: EngineConfig, bar: Bar) {
  const t = st.open;
  if (!t) return;
  const half = cfg.spread / 2;
  const atr = st.atr || 1.0;

  // 1. Check Exit conditions (SL and TP)
  if (t.side === "LONG") {
    if (bar.l - half <= t.sl) {
      settle(st, cfg, t, bar, "SL", t.sl);
      return;
    }
    if (bar.h - half >= t.tp) {
      settle(st, cfg, t, bar, "TP", t.tp);
      return;
    }
  } else {
    if (bar.h + half >= t.sl) {
      settle(st, cfg, t, bar, "SL", t.sl);
      return;
    }
    if (bar.l + half <= t.tp) {
      settle(st, cfg, t, bar, "TP", t.tp);
      return;
    }
  }

  // 2. Trailing Stop & Auto-Breakeven Automation if trade remains open
  if (st.open) {
    const curTrade = st.open;
    const curPrice = bar.c;
    const upnl = curTrade.side === "LONG"
      ? curTrade.oz * (curPrice - half - curTrade.entry)
      : curTrade.oz * (curTrade.entry - (curPrice + half));
    const currentR = upnl / Math.max(1, curTrade.risk);

    // Pyramid BE Step 1: Lock 25% partial profit at +0.5R
    if (cfg.autoBreakeven && currentR >= 0.5 && !curTrade.partialClosed && !curTrade.partialLock_50) {
      const partialPnl = (curTrade.risk * 0.5) * 0.25;
      st.balance += partialPnl;
      curTrade.partialRealized = (curTrade.partialRealized || 0) + partialPnl;
      curTrade.partialLock_50 = true;
      ev(st, bar.t, "TP", curTrade.side === "LONG" ? "long" : "short", `💰 Locked 25% partial profit @ +0.5R (+$${partialPnl.toFixed(0)})`);
    }

    // Pyramid BE Step 2: Move SL to breakeven at threshold (default +1.0R)
    if (cfg.autoBreakeven && !curTrade.isBreakeven && currentR >= (cfg.beThresholdR || 1.0)) {
      const buffer = Math.max(0.04 * atr, 0.10);
      const beSl = curTrade.side === "LONG" ? curTrade.entry + half + buffer : curTrade.entry - (half + buffer);
      curTrade.sl = beSl;
      curTrade.isBreakeven = true;
      ev(
        st,
        bar.t,
        "SYS",
        "sys",
        `⚡ Breakeven locked (+${currentR.toFixed(1)}R) · Stop moved to entry ${fmtP(beSl)}`
      );
    }

    // Pyramid BE Step 3: Dynamic ATR Trailing Stop (activates past +1.5R)
    if (cfg.trailingStop && currentR >= (cfg.trailThresholdR || 1.5)) {
      const trailDist = (cfg.trailAtrDist || 1.0) * atr;
      if (curTrade.side === "LONG") {
        const potentialSl = curPrice - half - trailDist;
        if (potentialSl > curTrade.sl) {
          curTrade.sl = potentialSl;
          curTrade.trailActive = true;
          curTrade.trailSl = potentialSl;
          curTrade.trailStop = potentialSl;
        }
      } else {
        const potentialSl = curPrice + half + trailDist;
        if (potentialSl < curTrade.sl) {
          curTrade.sl = potentialSl;
          curTrade.trailActive = true;
          curTrade.trailSl = potentialSl;
          curTrade.trailStop = potentialSl;
        }
      }
    }
  }
}

export function moveToBreakeven(st: EngineState, cfg: EngineConfig): boolean {
  if (!st.open) return false;
  const t = st.open;
  const half = cfg.spread / 2;
  const atr = st.atr || 1.0;
  const buffer = Math.max(0.04 * atr, 0.10);
  const beSl = t.side === "LONG" ? t.entry + half + buffer : t.entry - (half + buffer);
  t.sl = beSl;
  t.isBreakeven = true;
  const bar = st.bars[st.bars.length - 1];
  const time = bar ? bar.t : Date.now();
  ev(st, time, "SYS", "sys", `⚡ Stop manually moved to Breakeven (${fmtP(beSl)})`);
  return true;
}

export function partialClose(st: EngineState, cfg: EngineConfig, ratio: number = 0.5): boolean {
  if (!st.open) return false;
  const t = st.open;
  const bar = st.bars[st.bars.length - 1];
  const px = bar ? bar.c : t.entry;
  const half = cfg.spread / 2;
  const closedOz = t.oz * ratio;
  const dir = t.side === "LONG" ? 1 : -1;
  const partialPnl = dir * closedOz * (px - (dir === 1 ? half : -half) - t.entry);

  t.oz -= closedOz;
  t.partialClosed = true;
  t.partialRealized = (t.partialRealized || 0) + partialPnl;
  t.risk *= (1 - ratio);
  st.balance += partialPnl;

  const time = bar ? bar.t : Date.now();
  ev(st, time, "TP", t.side === "LONG" ? "long" : "short",
    `💰 Scaled out ${(ratio * 100).toFixed(0)}% (+${partialPnl >= 0 ? "$" : "-$"}${Math.abs(partialPnl).toFixed(0)}) · Remaining size: ${t.oz.toFixed(2)} units`);
  return true;
}

function familyOf(kind: Aoi["kind"]): string {
  if (kind === "PDH" || kind === "PDL" || kind === "CDH" || kind === "CDL") return "DAY EXTREMES";
  if (kind === "TT" || kind === "TB") return "TRIPLES";
  if (kind === "OB_D" || kind === "OB_S") return "ORDER BLOCKS";
  return "SESSIONS";
}

interface TradePlan {
  entry: number;
  sl: number;
  tp: number;
  oz: number;
  risk: number;
  slDist: number;
}

/** size a trade against current bar and risk model (fixedUSD, percentEquity, fractionalKelly) */
function planTrade(st: EngineState, cfg: EngineConfig, bar: Bar, side: "LONG" | "SHORT", atr: number): TradePlan | null {
  const half = cfg.spread / 2;
  const entry = side === "LONG" ? bar.c + half : bar.c - half;
  const buffer = Math.max(0.12 * atr, 0.25);
  const sl = side === "LONG" ? bar.l - buffer : bar.h + buffer;
  const slDist = Math.abs(entry - sl);

  const minSl = (cfg.minSlAtr || 0.2) * atr;
  const maxSl = (cfg.maxSlAtr || 4.0) * atr;
  if (slDist < minSl || slDist > maxSl) return null; // reject degenerate geometry

  // Dynamic Risk Sizing Calculation
  let targetRiskUSD = cfg.riskUSD;
  if (cfg.sizingMode === "percentEquity") {
    targetRiskUSD = Math.max(5, st.balance * ((cfg.equityRiskPct || 2.0) / 100));
  } else if (cfg.sizingMode === "fractionalKelly") {
    const closed = st.trades.filter((t) => !t.open);
    const wins = closed.filter((t) => (t.pnl ?? 0) > 0).length;
    const p = closed.length >= 8 ? wins / closed.length : 0.48;
    const b = Math.max(1.0, cfg.rr);
    const rawKelly = p - (1 - p) / b;
    const kellyPct = Math.max(0.005, Math.min(0.035, rawKelly * (cfg.kellyFraction || 0.35)));
    targetRiskUSD = Math.max(5, st.balance * kellyPct);
  }

  // Sizing = targetRisk ÷ (stop distance × point value per unit) with margin safety cap
  const marginCapUnits = (st.balance * 25) / Math.max(1, bar.c * cfg.pointValue);
  const rawOz = targetRiskUSD / (slDist * cfg.pointValue);
  const oz = Math.max(0.01, Math.min(rawOz, marginCapUnits));
  const risk = oz * slDist * cfg.pointValue;
  const tp = side === "LONG" ? entry + slDist * cfg.rr : entry - slDist * cfg.rr;
  return { entry, sl, tp, oz, risk, slDist };
}

function openTrade(
  st: EngineState,
  cfg: EngineConfig,
  bar: Bar,
  side: "LONG" | "SHORT",
  a: Aoi,
  cooldownKey: string,
  familyOverride?: string
) {
  const idx = st.bars.length - 1;
  const plan = planTrade(st, cfg, bar, side, st.atr);
  if (!plan) return false;
  if (st.balance < plan.risk * 0.5) {
    ev(st, bar.t, "RISK", "risk",
      `Equity $${st.balance.toFixed(0)} below required risk — standing down to protect capital.`);
    return false;
  }
  const { entry, sl, tp, oz, risk, slDist } = plan;
  const setup = `${cfg.identity === "reversal" ? "TRAP" : "BREAK"} · ${a.label}`;

  const t: Trade = {
    id: st.nextId++,
    side,
    setup,
    family: familyOverride ?? familyOf(a.kind),
    identity: cfg.identity,
    entryIndex: idx,
    entryTime: bar.t,
    entry,
    sl,
    tp,
    oz,
    risk,
    open: true,
  };
  st.open = t;
  st.trades.push(t);
  st.cooldown[cooldownKey] = idx;

  ev(st, bar.t, "ENTRY", side === "LONG" ? "long" : "short",
    `${side} ${oz.toFixed(2)} units @ ${fmtP(entry)} · ${setup}`);
  ev(st, bar.t, "RISK", "risk",
    `Risk locked $${risk.toFixed(0)} (${cfg.sizingMode}) · stop ${fmtP(sl)} ($${slDist.toFixed(2)}) · TP ${fmtP(tp)} (${cfg.rr.toFixed(1)}R)`);
  return true;
}

function enqueueSignal(
  st: EngineState,
  cfg: EngineConfig,
  bar: Bar,
  side: "LONG" | "SHORT",
  a: Aoi,
  cooldownKey: string
): boolean {
  if (st.queue.some((q) => q.status === "PENDING")) return false; // one decision at a time
  const plan = planTrade(st, cfg, bar, side, st.atr);
  if (!plan) return false;
  if (st.balance < plan.risk * 0.5) {
    ev(st, bar.t, "RISK", "risk",
      `Equity $${st.balance.toFixed(0)} below risk sizing — signal suppressed.`);
    return false;
  }
  const idx = st.bars.length - 1;
  st.cooldown[cooldownKey] = idx;
  st.queue.push({
    id: st.nextId++,
    time: bar.t,
    side,
    setup: `${cfg.identity === "reversal" ? "TRAP" : "BREAK"} · ${a.label}`,
    family: familyOf(a.kind),
    entry: plan.entry,
    sl: plan.sl,
    tp: plan.tp,
    oz: plan.oz,
    risk: plan.risk,
    aoiKey: cooldownKey,
    aoiLabel: a.label,
    entryIndex: idx,
    status: "PENDING",
  });
  if (st.queue.length > 40) st.queue.splice(0, st.queue.length - 40);
  ev(st, bar.t, "HOLD", "risk",
    `${side} signal HELD in Action Center · ${a.label} @ ${fmtP(plan.entry)} · approve or reject`);
  return true;
}

export function decideQueue(st: EngineState, cfg: EngineConfig, id: number, approve: boolean) {
  const q = st.queue.find((x) => x.id === id);
  if (!q || q.status !== "PENDING") return;
  const idx = st.bars.length - 1;
  const bar = st.bars[idx];
  if (approve) {
    if (st.open) {
      ev(st, bar.t, "DECIDE", "sys", `Approval ignored — a position is already open.`);
      return;
    }
    if (st.halted) {
      ev(st, bar.t, "DECIDE", "sys", `Approval blocked — daily loss limit active. Discipline first.`);
      return;
    }
    if (cfg.windowEnabled) {
      const { wd, hr } = windowParts(bar.t);
      if (!cfg.windowGrid[wd]?.[hr]) {
        ev(st, bar.t, "DECIDE", "sys",
          `Approval blocked — trading window closed at ${DAY_NAMES[wd]} ${String(hr).padStart(2, "0")}:00 UTC.`);
        return;
      }
    }
    const synth = { label: q.aoiLabel, kind: "PDH" } as Aoi;
    const ok = openTrade(st, cfg, bar, q.side, synth, q.aoiKey, q.family);
    q.status = ok ? "APPROVED" : "REJECTED";
    if (ok) {
      ev(st, bar.t, "DECIDE", q.side === "LONG" ? "long" : "short",
        `APPROVED by trader · ${q.side} dispatched @ ${fmtP(bar.c)} · ${q.setup}`);
    } else {
      q.reason = "USER";
      ev(st, bar.t, "DECIDE", "sys", `Approval failed — stop geometry degenerate at current bar.`);
    }
  } else {
    q.status = "REJECTED";
    q.reason = "USER";
    ev(st, bar.t, "DECIDE", "sys",
      `REJECTED by trader · tracking ${fmtP(q.sl)} / ${fmtP(q.tp)} to score the decision`);
  }
}

/** expire stale pending signals and score rejected ones against price action */
function maintainQueue(st: EngineState, cfg: EngineConfig, bar: Bar) {
  const idx = st.bars.length - 1;
  for (const q of st.queue) {
    if (q.status === "PENDING" && idx - q.entryIndex > 4) {
      q.status = "REJECTED";
      q.reason = "EXPIRED";
      ev(st, bar.t, "DECIDE", "sys", `Signal expired unanswered (4-bar window) — auto-rejected.`);
    }
    if (q.status === "REJECTED" && !q.result) {
      const long = q.side === "LONG";
      const hitSL = long ? bar.l <= q.sl : bar.h >= q.sl;
      const hitTP = long ? bar.h >= q.tp : bar.l <= q.tp;
      if (hitSL) {
        q.result = "AVOIDED_SL";
        st.avoidedSlUSD += q.risk;
        ev(st, bar.t, "DECIDE", "long", `Rejection scored AVOIDED −$${q.risk.toFixed(0)} loss · ${q.setup}`);
      } else if (hitTP) {
        q.result = "MISSED_TP";
        st.missedTpUSD += q.risk * cfg.rr;
        ev(st, bar.t, "DECIDE", "short", `Rejection cost +$${(q.risk * cfg.rr).toFixed(0)} missed profit · ${q.setup}`);
      } else if (idx - q.entryIndex > 40) {
        q.result = "FLAT";
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Entry evaluation — the two identities                              */
/* ------------------------------------------------------------------ */
function coolKey(a: Aoi) {
  return a.kind === "CDH" || a.kind === "CDL" ? a.kind : `${a.kind}:${a.ty.toFixed(1)}`;
}

function clsLabel(c: CandleClass) {
  switch (c) {
    case "LPR": return "LPR rejection";
    case "HPR": return "HPR rejection";
    case "POWER_BULL": return "bull power candle";
    case "POWER_BEAR": return "bear power candle";
    case "BORING": return "boring candle";
    default: return "neutral candle";
  }
}

function evaluate(st: EngineState, cfg: EngineConfig, bar: Bar, cls: CandleClass) {
  const atr = st.atr;
  const idx = st.bars.length - 1;
  const act = st.aois.filter((a) => a.active);
  const warm = st.bars.length <= 60;

  const setEval = (checks: CheckStep[], verdict: string) => {
    st.lastEval = { cls, checks, verdict };
  };
  const riskIdle = `flat · sizing $${cfg.riskUSD} ÷ stop distance`;

  // swept levels: price hunted through and closed back inside
  const swept: { a: Aoi; side: "LONG" | "SHORT"; dist: number }[] = [];
  let nearest: Aoi | null = null;
  let nearestD = 1e9;
  for (const a of act) {
    if (a.role === "S" && bar.l < a.ty && bar.c > a.ty) swept.push({ a, side: "LONG", dist: a.ty - bar.l });
    if (a.role === "R" && bar.h > a.ty && bar.c < a.ty) swept.push({ a, side: "SHORT", dist: bar.h - a.ty });
    const d = Math.min(Math.abs(bar.c - a.ty), Math.abs(bar.h - a.ty), Math.abs(bar.l - a.ty));
    if (d < nearestD) { nearestD = d; nearest = a; }
  }
  const nearAoi = nearest && nearestD < 0.8 * atr ? nearest : null;

  if (warm) {
    setEval(
      [
        { k: "AOI CONTACT", ok: null, v: "seeding levels" },
        { k: "REACTION", ok: null, v: clsLabel(cls) },
        { k: "GATE", ok: null, v: "warm-up" },
        { k: "RISK", ok: null, v: "calibrating ATR" },
      ],
      "Warming up — calibrating ATR and arming Areas of Interest."
    );
    return;
  }

  // scheduler gate — entries only inside armed windows (open trades still managed)
  if (cfg.windowEnabled) {
    const { wd, hr } = windowParts(bar.t);
    if (!cfg.windowGrid[wd]?.[hr]) {
      setEval(
        [
          { k: "AOI CONTACT", ok: !!nearAoi, v: nearAoi ? nearAoi.label : "none" },
          { k: "REACTION", ok: null, v: clsLabel(cls) },
          { k: "SCHEDULE", ok: false, v: `${DAY_NAMES[wd]} ${String(hr).padStart(2, "0")}:00 UTC` },
          { k: "GATE", ok: false, v: "window closed" },
        ],
        `Trading window closed — ${DAY_NAMES[wd]} ${String(hr).padStart(2, "0")}:00 UTC is not armed. The engine waits; overtrading is the enemy.`
      );
      return;
    }
  }

  if (st.halted) {
    setEval(
      [
        { k: "AOI CONTACT", ok: !!nearAoi, v: nearAoi ? nearAoi.label : "none" },
        { k: "REACTION", ok: null, v: clsLabel(cls) },
        { k: "GATE", ok: false, v: "blocked — daily limit" },
        { k: "RISK", ok: false, v: "engine halted" },
      ],
      `Daily loss limit hit (${st.dailySL}/${cfg.maxDailySL}). The engine stands down until the next session — no FOMO re-entries.`
    );
    return;
  }

  // discipline (spec §6): once a trade hits target OR stop, the bar it exited on is closed
  // to new entries — no revenge trades after SL, no FOMO re-entries after TP
  const lastClosed = st.trades.length ? st.trades[st.trades.length - 1] : null;
  if (lastClosed && !lastClosed.open && lastClosed.exitIndex === idx) {
    setEval(
      [
        { k: "AOI CONTACT", ok: !!nearAoi, v: nearAoi ? nearAoi.label : "none" },
        { k: "REACTION", ok: null, v: clsLabel(cls) },
        { k: "GATE", ok: false, v: `exited ${lastClosed.outcome} this bar` },
        { k: "RISK", ok: false, v: "re-entry locked" },
      ],
      lastClosed.outcome === "SL"
        ? "Stop loss just filled. The engine takes its hands off the keyboard — next setup only, no revenge entries."
        : "Target just filled. The day's job is done for this setup — the engine waits for the next programmatic signal."
    );
    return;
  }

  if (st.open) {
    const t = st.open;
    const halfSpread = cfg.spread / 2;
    const upnl = t.oz * (t.side === "LONG" ? bar.c - halfSpread - t.entry : t.entry - (bar.c + halfSpread));
    setEval(
      [
        { k: "POSITION", ok: true, v: `${t.side} ${t.oz.toFixed(1)} oz · ${t.setup}` },
        { k: "REACTION", ok: null, v: clsLabel(cls) },
        { k: "MANAGEMENT", ok: null, v: `SL ${fmtP(t.sl)} · TP ${fmtP(t.tp)}` },
        { k: "UNREALIZED", ok: upnl >= 0, v: `${upnl >= 0 ? "+" : "−"}$${Math.abs(upnl).toFixed(0)}` },
      ],
      `Managing ${t.side.toLowerCase()} position — no overrides, no adds. The plan exits the trade.`
    );
    return;
  }

  // --- RANGE BREAKOUT EA LOGIC ---
  if (cfg.rbEnabled && st.rbState === "ACTIVE" && st.rbHigh && st.rbLow) {
    const buffer = cfg.rbBufferPoints * cfg.pointValue;
    const longTrigger = st.rbHigh + buffer;
    const shortTrigger = st.rbLow - buffer;
    
    // Check if price broke the triggers
    let entered = false;
    let rbSide: "LONG" | "SHORT" | null = null;
    let rbEntry = 0;
    
    // Simulate pending orders filling during the bar
    if (bar.h > longTrigger) { rbSide = "LONG"; rbEntry = longTrigger; }
    else if (bar.l < shortTrigger) { rbSide = "SHORT"; rbEntry = shortTrigger; }
    
    if (rbSide) {
      // Create a virtual AOI for the openTrade function
      const a: Aoi = {
        kind: "PDH", // Dummy
        role: rbSide === "LONG" ? "R" : "S",
        y1: rbEntry, y2: rbEntry, ty: rbEntry,
        from: idx, label: "RANGE BREAKOUT", active: true
      };
      
      entered = cfg.actionCenter
        ? enqueueSignal(st, cfg, bar, rbSide, a, `RB_${rbSide}_${st.dayKey}`)
        : openTrade(st, cfg, bar, rbSide, a, `RB_${rbSide}_${st.dayKey}`);
        
      if (entered) {
        st.rbState = "DONE";
        const t = st.open as Trade | null;
        if (t) {
          // Adjust SL to opposite side of range by default, or factor
          t.sl = rbSide === "LONG" ? st.rbLow : st.rbHigh;
          // Apply R:R
          const dist = Math.abs(t.entry - t.sl);
          t.tp = rbSide === "LONG" ? t.entry + (dist * cfg.rr) : t.entry - (dist * cfg.rr);
        }
        
        setEval(
          [
            { k: "RANGE TRIGGER", ok: true, v: `Broke ${rbSide === "LONG" ? "HIGH" : "LOW"}` },
            { k: "EXECUTION", ok: true, v: `${rbSide} @ ${fmtP(rbEntry)}` },
          ],
          `Range Breakout EA placed pending order which filled. State is now DONE.`
        );
        return;
      }
    }
  }
  // --- END RANGE BREAKOUT ---
  if (cfg.identity === "reversal") {
    /* ------- INSTITUTIONAL FILTER LAYER ------- */

    // Filter 1: Killzone Session Gate
    if (cfg.killzoneFilter && st.activeKillzone === "OFF_SESSION") {
      setEval(
        [
          { k: "AOI CONTACT", ok: !!nearAoi, v: nearAoi ? nearAoi.label : "none" },
          { k: "KILLZONE", ok: false, v: `OFF-SESSION (${String(hourOf(bar.t)).padStart(2, "0")}:00 UTC)` },
          { k: "GATE", ok: false, v: "dead zone — no entries" },
          { k: "RISK", ok: null, v: "engine resting" },
        ],
        "Off-session dead zone (21:00–07:00 UTC). Smart money is absent — no entries until London or NY killzone opens."
      );
      return;
    }

    /* ------- RIGHT-SIDE · TRAP / REVERSAL ------- */
    const valid = swept.filter((s) => {
      const cd = st.cooldown[coolKey(s.a)];
      if (cd != null && idx - cd < 10) return false;
      // Filter 3: Eliminate standalone CDH/CDL entries — keep only major static pools
      if (s.a.kind === "CDH" || s.a.kind === "CDL") return false;
      // Filter 4: OB requires FVG displacement — check for 3-bar FVG nearby
      if (s.a.kind === "OB_D" || s.a.kind === "OB_S") {
        let hasFvg = false;
        for (let j = Math.max(0, idx - 6); j < idx - 1; j++) {
          const b1 = st.bars[j], b3 = st.bars[j + 2];
          if (!b1 || !b3) continue;
          // bullish FVG: bar3.low > bar1.high (gap up)
          if (s.a.kind === "OB_D" && b3.l > b1.h && (b3.l - b1.h) >= 0.3 * atr) { hasFvg = true; break; }
          // bearish FVG: bar3.high < bar1.low (gap down)
          if (s.a.kind === "OB_S" && b3.h < b1.l && (b1.l - b3.h) >= 0.3 * atr) { hasFvg = true; break; }
        }
        if (!hasFvg) return false; // reject naked OB without FVG displacement
      }
      return true;
    });
    const longs = valid.filter((s) => s.side === "LONG");
    const shorts = valid.filter((s) => s.side === "SHORT");

    let entered = false;
    let chosen: typeof swept[number] | null = null;

    // Pre-compute confluence score for the best candidate
    const scoreCandidate = (s: typeof swept[number], side: "LONG" | "SHORT"): number => {
      let score = 0;
      // 30 pts: Major liquidity pool (PDH, PDL, session extremes, triple top/bottom)
      const majorKinds = ["PDH", "PDL", "LON_H", "LON_L", "NY_H", "NY_L", "OVL_H", "OVL_L", "TT", "TB"];
      if (majorKinds.includes(s.a.kind)) score += 30;
      else score += 10; // minor pool (FVG OB with displacement gets partial credit)

      // 25 pts: Rejection morphology (already confirmed by cls === LPR/HPR)
      const clsMatch = (side === "LONG" && cls === "LPR") || (side === "SHORT" && cls === "HPR");
      if (clsMatch) score += 25;

      // 25 pts: Trend alignment (50/200 EMA)
      const bullTrend = st.ema50 > st.ema200;
      const bearTrend = st.ema50 < st.ema200;
      if ((side === "LONG" && bullTrend) || (side === "SHORT" && bearTrend)) score += 25;
      else if (!cfg.trendFilter) score += 15; // partial credit if filter disabled

      // 20 pts: Killzone timing
      if (st.activeKillzone === "LONDON" || st.activeKillzone === "NEW_YORK" || st.activeKillzone === "OVERLAP") score += 20;
      else if (!cfg.killzoneFilter) score += 10;

      return score;
    };

    const tryEnter = (side: "LONG" | "SHORT", a: Aoi, key: string) =>
      cfg.actionCenter ? enqueueSignal(st, cfg, bar, side, a, key) : openTrade(st, cfg, bar, side, a, key);

    if (longs.length && cls === "LPR") {
      chosen = longs.reduce((m, s) => (s.dist > m.dist ? s : m), longs[0]);

      // Filter 2: Trend direction — block counter-trend longs in bear regime
      if (cfg.trendFilter && st.ema50 < st.ema200 && bar.c < st.ema50) {
        const score = scoreCandidate(chosen, "LONG");
        st.lastConfluenceScore = score;
        setEval(
          [
            { k: "AOI CONTACT", ok: true, v: `${chosen.a.label} swept` },
            { k: "TREND", ok: false, v: `BEARISH (EMA50 < EMA200)` },
            { k: "CONFLUENCE", ok: false, v: `${score}/100 — LONG blocked` },
            { k: "GATE", ok: false, v: "counter-trend" },
          ],
          `${chosen.a.label} swept with LPR rejection, but macro trend is bearish (50 EMA < 200 EMA). Counter-trend LONG blocked.`
        );
        chosen = null;
      }

      // Filter 5: Confluence score gate
      if (chosen) {
        const score = scoreCandidate(chosen, "LONG");
        st.lastConfluenceScore = score;
        if (score < cfg.confluenceGate) {
          setEval(
            [
              { k: "AOI CONTACT", ok: true, v: chosen.a.label },
              { k: "REACTION", ok: true, v: clsLabel(cls) },
              { k: "CONFLUENCE", ok: false, v: `${score}/100 < ${cfg.confluenceGate} gate` },
              { k: "GATE", ok: false, v: "low confluence" },
            ],
            `Signal at ${chosen.a.label} scored ${score}/100 — below ${cfg.confluenceGate} institutional confluence gate. Discarded.`
          );
          chosen = null;
        }
      }

      if (chosen) entered = tryEnter("LONG", chosen.a, coolKey(chosen.a));
    } else if (shorts.length && cls === "HPR") {
      chosen = shorts.reduce((m, s) => (s.dist > m.dist ? s : m), shorts[0]);

      // Filter 2: Trend direction — block counter-trend shorts in bull regime
      if (cfg.trendFilter && st.ema50 > st.ema200 && bar.c > st.ema50) {
        const score = scoreCandidate(chosen, "SHORT");
        st.lastConfluenceScore = score;
        setEval(
          [
            { k: "AOI CONTACT", ok: true, v: `${chosen.a.label} swept` },
            { k: "TREND", ok: false, v: `BULLISH (EMA50 > EMA200)` },
            { k: "CONFLUENCE", ok: false, v: `${score}/100 — SHORT blocked` },
            { k: "GATE", ok: false, v: "counter-trend" },
          ],
          `${chosen.a.label} swept with HPR rejection, but macro trend is bullish (50 EMA > 200 EMA). Counter-trend SHORT blocked.`
        );
        chosen = null;
      }

      // Filter 5: Confluence score gate
      if (chosen) {
        const score = scoreCandidate(chosen, "SHORT");
        st.lastConfluenceScore = score;
        if (score < cfg.confluenceGate) {
          setEval(
            [
              { k: "AOI CONTACT", ok: true, v: chosen.a.label },
              { k: "REACTION", ok: true, v: clsLabel(cls) },
              { k: "CONFLUENCE", ok: false, v: `${score}/100 < ${cfg.confluenceGate} gate` },
              { k: "GATE", ok: false, v: "low confluence" },
            ],
            `Signal at ${chosen.a.label} scored ${score}/100 — below ${cfg.confluenceGate} institutional confluence gate. Discarded.`
          );
          chosen = null;
        }
      }

      if (chosen) entered = tryEnter("SHORT", chosen.a, coolKey(chosen.a));
    }

    if (entered && chosen) {
      const held = cfg.actionCenter;
      const q = held ? st.queue[st.queue.length - 1] : null;
      const ot = st.open as Trade | null;
      const riskTxt = held && q
        ? `${q.oz.toFixed(1)} oz · SL $${Math.abs(q.entry - q.sl).toFixed(2)} · held for approval`
        : ot
          ? `${ot.oz.toFixed(1)} oz · SL $${Math.abs(ot.entry - ot.sl).toFixed(2)} · TP ${fmtP(ot.tp)}`
          : "entry withheld";
      setEval(
        [
          { k: "AOI CONTACT", ok: true, v: `${chosen.a.label} swept $${chosen.dist.toFixed(2)}` },
          { k: "REACTION", ok: true, v: clsLabel(cls) },
          { k: "TRAP GATE", ok: true, v: `${chosen.side === "LONG" ? "buy low" : "sell high"} confirmed` },
          { k: "RISK", ok: true, v: riskTxt },
        ],
        held
          ? `Liquidity trap sprung at ${chosen.a.label} — signal HELD in the Action Center. Approve to dispatch, reject to leave the money on the table.`
          : `Liquidity trap sprung at ${chosen.a.label} — ${chosen.side === "LONG" ? "swept low, rejected, LONG" : "swept high, rejected, SHORT"} on the ${clsLabel(cls)}.`
      );
    } else {
      const contactTxt = swept.length
        ? swept.map((s) => s.a.label).join(" + ") + " swept"
        : nearAoi
          ? `near ${nearAoi.label} · no sweep`
          : "none — mid-range";
      const reactionOk = swept.length ? cls === "LPR" || cls === "HPR" : null;
      const gateTxt = !swept.length
        ? "stand down — no sweep"
        : cls === "LPR" || cls === "HPR"
          ? "level on cooldown"
          : `needs ${swept.some((s) => s.side === "LONG") ? "LPR" : "HPR"}, got ${clsLabel(cls)}`;
      setEval(
        [
          { k: "AOI CONTACT", ok: swept.length > 0, v: contactTxt },
          { k: "REACTION", ok: reactionOk, v: clsLabel(cls) },
          { k: "TRAP GATE", ok: false, v: gateTxt },
          { k: "RISK", ok: null, v: swept.length ? "entry withheld" : riskIdle },
        ],
        !swept.length
          ? nearAoi
            ? `Drifting near ${nearAoi.label}. No sweep, no rejection — the engine waits and leaves this money on the table.`
            : "Price is mid-range, away from every AOI. No level, no trade — patience is a position."
          : `Swept ${swept.map((s) => s.a.label).join(", ")} but the close printed a ${clsLabel(cls)}. Trap not confirmed — no entry.`
      );
    }
  } else {
    /* ------- LEFT-SIDE · BREAKOUT / MOMENTUM ------- */
    const bars = st.bars;
    let best: { a: Aoi; side: "LONG" | "SHORT" } | null = null;
    let approach = false, pullback = false, power = false;
    let nearLabel = "";

    for (const a of act) {
      const cd = st.cooldown[coolKey(a)];
      if (cd != null && idx - cd < 10) continue;
      if (a.role === "R") {
        let app = false, pb = false;
        for (let j = Math.max(0, idx - 12); j < idx; j++) {
          const c = bars[j].c;
          if (c < a.ty && c > a.ty - 1.6 * atr) app = true;
        }
        for (let j = Math.max(0, idx - 4); j < idx; j++) if (bars[j].c < bars[j].o) pb = true;
        if (app) { approach = true; nearLabel = a.label; if (pb) pullback = true; }
        if (app && pb && cls === "POWER_BULL" && bar.c > a.ty) { best = { a, side: "LONG" }; break; }
      } else {
        let app = false, pb = false;
        for (let j = Math.max(0, idx - 12); j < idx; j++) {
          const c = bars[j].c;
          if (c > a.ty && c < a.ty + 1.6 * atr) app = true;
        }
        for (let j = Math.max(0, idx - 4); j < idx; j++) if (bars[j].c > bars[j].o) pb = true;
        if (app) { approach = true; nearLabel = a.label; if (pb) pullback = true; }
        if (app && pb && cls === "POWER_BEAR" && bar.c < a.ty) { best = { a, side: "SHORT" }; break; }
      }
    }
    power = cls === "POWER_BULL" || cls === "POWER_BEAR";

    let entered = false;
    if (best)
      entered = cfg.actionCenter
        ? enqueueSignal(st, cfg, bar, best.side, best.a, coolKey(best.a))
        : openTrade(st, cfg, bar, best.side, best.a, coolKey(best.a));

    if (entered && best) {
      const held = cfg.actionCenter;
      const t = st.open as Trade | null;
      const q = held ? st.queue[st.queue.length - 1] : null;
      const riskTxt = held && q
        ? `${q.oz.toFixed(1)} oz · SL $${Math.abs(q.entry - q.sl).toFixed(2)} · held for approval`
        : t
          ? `${t.oz.toFixed(1)} oz · SL $${Math.abs(t.entry - t.sl).toFixed(2)} · TP ${fmtP(t.tp)}`
          : "entry withheld";
      setEval(
        [
          { k: "APPROACH", ok: true, v: `${best.a.label} tested, held` },
          { k: "PULLBACK", ok: true, v: "compression logged" },
          { k: "POWER CANDLE", ok: true, v: clsLabel(cls) },
          { k: "RISK", ok: true, v: riskTxt },
        ],
        held
          ? `${clsLabel(cls)} smashed through ${best.a.label} — breakout signal HELD in the Action Center. Approve to dispatch.`
          : `${clsLabel(cls)} smashed through ${best.a.label} — ${best.side} on momentum, sized to $${cfg.riskUSD} risk.`
      );
    } else {
      setEval(
        [
          { k: "APPROACH", ok: approach, v: approach ? `${nearLabel} under test` : "no level under test" },
          { k: "PULLBACK", ok: pullback, v: pullback ? "consolidation seen" : "no pullback yet" },
          { k: "POWER CANDLE", ok: power ? null : false, v: clsLabel(cls) },
          { k: "RISK", ok: null, v: riskIdle },
        ],
        power && approach
          ? `Power candle away from a clean approach — breakout gate not satisfied. Chasing is not a setup.`
          : approach
            ? `Price working ${nearLabel}. Waiting for pullback + power candle to confirm the break.`
            : "No resistance or support under test. Momentum identity stands down."
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/*  One full bar cycle                                                 */
/* ------------------------------------------------------------------ */
export function advance(st: EngineState, cfg: EngineConfig) {
  const tfMap: Record<string, number> = {
    "1m": 60 * 1000,
    "5m": 5 * 60 * 1000,
    "15m": 15 * 60 * 1000,
    "30m": 30 * 60 * 1000,
    "1h": 60 * 60 * 1000,
    "4h": 4 * 60 * 60 * 1000,
  };
  const intervalMs = tfMap[cfg.timeframe] || BAR_MS;
  const bar = nextBar(st, intervalMs);
  st.bars.push(bar);
  const idx = st.bars.length - 1;

  // day rollover — reset the discipline counters, arm fresh PDH/PDL
  if (bar.day !== st.dayKey) {
    if (st.dayKey >= 0) {
      st.pdh = st.dayHigh;
      st.pdl = st.dayLow;
      st.ses = computeSessionLevels(st.bars, st.dayKey);
      ev(st, bar.t, "SYS", "sys",
        `Session day ${bar.day - st.startDay + 1} open · PDH ${fmtP(st.pdh)} / PDL ${fmtP(st.pdl)} armed`);
    }
    st.dayKey = bar.day;
    if (st.startDay < 0) st.startDay = bar.day;
    st.dayOpen = bar.o;
    st.dayHigh = -1e9;
    st.dayLow = 1e9;
    st.dailySL = 0;
    st.halted = false;
  }

  // 14-Period Wilder RMA ATR
  const prevC = idx > 0 ? st.bars[idx - 1].c : bar.o;
  const tr = Math.max(bar.h - bar.l, Math.abs(bar.h - prevC), Math.abs(bar.l - prevC));
  st.atr = st.atr > 0 ? (st.atr * 13 + tr) / 14 : tr;

  // 50-EMA & 200-EMA Trend Regime Filter
  const k50 = 2 / (50 + 1);
  const k200 = 2 / (200 + 1);
  st.ema50 = idx === 0 ? bar.c : bar.c * k50 + st.ema50 * (1 - k50);
  st.ema200 = idx === 0 ? bar.c : bar.c * k200 + st.ema200 * (1 - k200);

  // Institutional Killzone Detection (UTC hours)
  const barHour = hourOf(bar.t);
  const barMin = Math.floor(((bar.t % DAY_MS) + DAY_MS) / 60000) % 60;
  
  if (barHour >= 13 && barHour < 17) {
    st.activeKillzone = "NEW_YORK";
  } else if (barHour >= 12 && barHour < 13) {
    st.activeKillzone = "OVERLAP"; // London/NY overlap
  } else if (barHour >= 7 && barHour < 12) {
    st.activeKillzone = "LONDON";
  } else {
    st.activeKillzone = "OFF_SESSION";
  }

  // Range Breakout Tracker
  if (cfg.rbEnabled) {
    const isStart = barHour === cfg.rbStartH && barMin >= cfg.rbStartM;
    const isEnd = barHour === cfg.rbEndH && barMin >= cfg.rbEndM;
    
    if (st.rbState === "WAITING" && isStart) {
      st.rbState = "FORMING";
      st.rbHigh = bar.h;
      st.rbLow = bar.l;
    }
    
    if (st.rbState === "FORMING") {
      st.rbHigh = Math.max(st.rbHigh!, bar.h);
      st.rbLow = Math.min(st.rbLow!, bar.l);
      if (isEnd) st.rbState = "ACTIVE";
    }
    
    // Reset range at end of day (or specific time)
    if (barHour === 23 && barMin === 45) {
      st.rbState = "WAITING";
      st.rbHigh = null;
      st.rbLow = null;
    }
  }

  const cls = classify(bar, st.atr, cfg);
  st.classes.push(cls);

  // manage any open position with this bar's range (SL checked first — conservative)
  manage(st, cfg, bar);

  // Action Center maintenance — expire stale holds, score past rejections
  maintainQueue(st, cfg, bar);

  // capture pre-bar intraday extremes for CDH/CDL, then update
  const cdhPrev = st.dayHigh;
  const cdlPrev = st.dayLow;
  st.dayHigh = Math.max(st.dayHigh, bar.h);
  st.dayLow = Math.min(st.dayLow, bar.l);

  buildAois(st, cfg, cdhPrev, cdlPrev);
  evaluate(st, cfg, bar, cls);

  // mark-to-market equity — marked through the spread (bid for longs, ask for shorts)
  const half = cfg.spread / 2;
  const unreal = st.open
    ? st.open.oz * (st.open.side === "LONG" ? bar.c - half - st.open.entry : st.open.entry - (bar.c + half))
    : 0;
  st.equity.push(st.balance + unreal);
}

export function createEngine(seed: number, cfg: EngineConfig): EngineState {
  const basePrice = cfg.activeSymbol?.startsWith("BTC")
    ? 68500
    : cfg.activeSymbol?.startsWith("ETH")
      ? 3600
      : cfg.activeSymbol?.startsWith("EUR")
        ? 1.085
        : 2750; // Accurate Gold base price

  const st: EngineState = {
    seed,
    bars: [],
    classes: [],
    atr: 0,
    atrPeriod: 14,
    timeframeAtrs: {},
    balance: cfg.account,
    startDay: -1,
    dayKey: -1,
    dayOpen: basePrice,
    dayHigh: -1e9,
    dayLow: 1e9,
    pdh: null,
    pdl: null,
    ses: null,
    dailySL: 0,
    halted: false,
    open: null,
    trades: [],
    queue: [],
    missedTpUSD: 0,
    avoidedSlUSD: 0,
    equity: [],
    aois: [],
    events: [],
    lastEval: {
      cls: "NEUTRAL",
      checks: [],
      verdict: "Initialising engine…",
    },
    cooldown: {},
    feedMode: "simulated",
    activeSymbol: cfg.activeSymbol || "XAUUSD",
    liveStatus: "disconnected",
    liveLatency: 0,
    liveLastBarTime: 0,
    rng: mulberry32(seed),
    regime: "RANGING_CHOP",
    regimeBarsLeft: 12,
    trend: 0,
    nextT: BASE_T,
    price: basePrice,
    nextId: 1,
    ema50: basePrice,
    ema200: basePrice,
    lastConfluenceScore: 0,
    activeKillzone: "OFF_SESSION",
    rbHigh: null,
    rbLow: null,
    rbState: "WAITING",
  };
  ev(st, BASE_T, "SYS", "sys", `Trading Flow online · ${cfg.activeSymbol} (${cfg.timeframe})`);
  ev(st, BASE_T, "SYS", "aoi", `Simulator feed synchronized to market levels`);
  // history replay runs unattended — the Action Center only supervises live bars
  const warmCfg: EngineConfig = { ...cfg, actionCenter: false };
  for (let k = 0; k < 120; k++) advance(st, warmCfg);
  return st;
}

/**
 * Initialize engine with real historical bars from a live market provider
 */
export function createLiveEngine(symbol: string, initialBars: Bar[], cfg: EngineConfig): EngineState {
  const lastBar = initialBars[initialBars.length - 1];
  const lastClose = lastBar ? lastBar.c : 2000;

  const st: EngineState = {
    seed: 1337,
    bars: [],
    classes: [],
    atr: 0,
    atrPeriod: 14,
    timeframeAtrs: {},
    balance: cfg.account,
    startDay: -1,
    dayKey: -1,
    dayOpen: initialBars[0]?.o || lastClose,
    dayHigh: -1e9,
    dayLow: 1e9,
    pdh: null,
    pdl: null,
    ses: null,
    dailySL: 0,
    halted: false,
    open: null,
    trades: [],
    queue: [],
    missedTpUSD: 0,
    avoidedSlUSD: 0,
    equity: [cfg.account],
    aois: [],
    events: [],
    lastEval: {
      cls: "NEUTRAL",
      checks: [],
      verdict: `Live feed connected · streaming ${symbol} 15m klines`,
    },
    cooldown: {},
    feedMode: "live",
    activeSymbol: symbol,
    liveStatus: "connected",
    liveLatency: 24,
    liveLastBarTime: lastBar ? lastBar.t : Date.now(),
    rng: mulberry32(1337),
    regime: "RANGING_CHOP",
    regimeBarsLeft: 12,
    trend: 0,
    nextT: Date.now(),
    price: lastClose,
    nextId: 1,
  };

  ev(st, Date.now(), "SYS", "sys", `⚡ LIVE MARKET FEED ATTACHED: ${symbol}`);
  ev(st, Date.now(), "SYS", "aoi", `Loaded ${initialBars.length} real historical 15m bars`);

  // Warm up the live engine across the real historical bars
  const warmCfg: EngineConfig = { ...cfg, actionCenter: false };
  for (let i = 0; i < initialBars.length; i++) {
    const b = initialBars[i];
    st.bars.push(b);
    const idx = st.bars.length - 1;

    if (b.day !== st.dayKey) {
      if (st.dayKey >= 0) {
        st.pdh = st.dayHigh;
        st.pdl = st.dayLow;
        st.ses = computeSessionLevels(st.bars, st.dayKey);
      }
      st.dayKey = b.day;
      if (st.startDay < 0) st.startDay = b.day;
      st.dayOpen = b.o;
      st.dayHigh = -1e9;
      st.dayLow = 1e9;
      st.dailySL = 0;
      st.halted = false;
    }

    const prevC = idx > 0 ? st.bars[idx - 1].c : b.o;
    const tr = Math.max(b.h - b.l, Math.abs(b.h - prevC), Math.abs(b.l - prevC));
    st.atr = st.atr > 0 ? (st.atr * 13 + tr) / 14 : tr;

    const cls = classify(b, st.atr, warmCfg);
    st.classes.push(cls);

    const cdhPrev = st.dayHigh;
    const cdlPrev = st.dayLow;
    st.dayHigh = Math.max(st.dayHigh, b.h);
    st.dayLow = Math.min(st.dayLow, b.l);

    buildAois(st, warmCfg, cdhPrev, cdlPrev);
  }

  return st;
}

/**
 * Handle incoming live tick or closed 15m candle
 */
export function feedLiveBar(st: EngineState, cfg: EngineConfig, bar: Bar, isClosed: boolean) {
  st.price = bar.c;
  st.liveLastBarTime = bar.t;

  if (isClosed) {
    // Bar finalized - push and advance engine cycle
    const lastBar = st.bars[st.bars.length - 1];
    if (lastBar && lastBar.t === bar.t) {
      st.bars[st.bars.length - 1] = bar;
    } else {
      st.bars.push(bar);
    }
    const idx = st.bars.length - 1;

    // Day rollover check
    if (bar.day !== st.dayKey) {
      if (st.dayKey >= 0) {
        st.pdh = st.dayHigh;
        st.pdl = st.dayLow;
        st.ses = computeSessionLevels(st.bars, st.dayKey);
        ev(st, bar.t, "SYS", "sys", `New trading day · Armed PDH ${fmtP(st.pdh)} / PDL ${fmtP(st.pdl)}`);
      }
      st.dayKey = bar.day;
      if (st.startDay < 0) st.startDay = bar.day;
      st.dayOpen = bar.o;
      st.dayHigh = -1e9;
      st.dayLow = 1e9;
      st.dailySL = 0;
      st.halted = false;
    }

    const prevC = idx > 0 ? st.bars[idx - 1].c : bar.o;
    const tr = Math.max(bar.h - bar.l, Math.abs(bar.h - prevC), Math.abs(bar.l - prevC));
    st.atr = st.atr > 0 ? st.atr * 0.92 + tr * 0.08 : tr;

    const cls = classify(bar, st.atr, cfg);
    st.classes.push(cls);

    manage(st, cfg, bar);
    maintainQueue(st, cfg, bar);

    const cdhPrev = st.dayHigh;
    const cdlPrev = st.dayLow;
    st.dayHigh = Math.max(st.dayHigh, bar.h);
    st.dayLow = Math.min(st.dayLow, bar.l);

    buildAois(st, cfg, cdhPrev, cdlPrev);
    evaluate(st, cfg, bar, cls);

    const half = cfg.spread / 2;
    const unreal = st.open
      ? st.open.oz * (st.open.side === "LONG" ? bar.c - half - st.open.entry : st.open.entry - (bar.c + half))
      : 0;
    st.equity.push(st.balance + unreal);
  } else {
    // In-flight tick update for the forming candle
    if (st.bars.length === 0) {
      st.bars.push({ ...bar });
    } else {
      const last = st.bars[st.bars.length - 1];
      if (last.t === bar.t) {
        st.bars[st.bars.length - 1] = {
          ...last,
          h: Math.max(last.h, bar.h),
          l: Math.min(last.l, bar.l),
          c: bar.c,
          v: bar.v,
        };
      } else {
        st.bars.push({ ...bar });
      }
    }

    // Real-time mark to market and intra-candle SL/TP hit checking
    if (st.open) {
      manage(st, cfg, bar);
      const half = cfg.spread / 2;
      const unreal = st.open
        ? st.open.oz * (st.open.side === "LONG" ? bar.c - half - st.open.entry : st.open.entry - (bar.c + half))
        : 0;
      if (st.equity.length > 0) {
        st.equity[st.equity.length - 1] = st.balance + unreal;
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Stats                                                              */
/* ------------------------------------------------------------------ */
export interface Stats {
  closed: Trade[];
  wins: number;
  losses: number;
  winRate: number;
  net: number;
  grossWin: number;
  grossLoss: number;
  pf: number;
  avgR: number;
  bestR: number;
  worstR: number;
  maxDD: number;
  maxDDPct: number;
  equityNow: number;
  openPnl: number;
}

export function computeStats(st: EngineState, cfg: EngineConfig): Stats {
  const closed = st.trades.filter((t) => !t.open);
  const wins = closed.filter((t) => (t.pnl ?? 0) > 0).length;
  const losses = closed.length - wins;
  const net = closed.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const grossWin = closed.filter((t) => (t.pnl ?? 0) > 0).reduce((s, t) => s + (t.pnl ?? 0), 0);
  const grossLoss = Math.abs(closed.filter((t) => (t.pnl ?? 0) <= 0).reduce((s, t) => s + (t.pnl ?? 0), 0));
  const rs = closed.map((t) => t.r ?? 0);
  let peak = -1e18, maxDD = 0;
  for (const e of st.equity) {
    peak = Math.max(peak, e);
    maxDD = Math.max(maxDD, peak - e);
  }
  const half = cfg.spread / 2;
  const lastC = st.bars[st.bars.length - 1].c;
  const openPnl = st.open
    ? st.open.oz * (st.open.side === "LONG" ? lastC - half - st.open.entry : st.open.entry - (lastC + half))
    : 0;
  return {
    closed,
    wins,
    losses,
    winRate: closed.length ? (wins / closed.length) * 100 : 0,
    net,
    grossWin,
    grossLoss,
    pf: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0,
    avgR: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 0,
    bestR: rs.length ? Math.max(...rs) : 0,
    worstR: rs.length ? Math.min(...rs) : 0,
    maxDD,
    maxDDPct: st.equity.length ? (maxDD / Math.max(1, peak)) * 100 : 0,
    equityNow: st.equity.length ? st.equity[st.equity.length - 1] : st.balance,
    openPnl,
  };
}

export { BAR_MS };
