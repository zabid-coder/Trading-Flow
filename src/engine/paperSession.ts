import type { EngineConfig, EngineState, Trade } from "./types";
import { createEngine } from "./engine";

const KEY = "safe_scalper_paper_session_v1";
const validTrade = (t: Omit<Trade, "open">) =>
  t &&
  t.source === "simulated" &&
  t.family === "SAFESCALPERPRO" &&
  (t.side === "LONG" || t.side === "SHORT") &&
  typeof t.signalId === "string" &&
  [t.entry, t.sl, t.tp, t.brokerLots, t.risk].every(
    (v) => Number.isFinite(v) && v > 0,
  );

export function savePaperSession(state: EngineState, cfg: EngineConfig) {
  if (cfg.feedMode !== "simulated") return;
  try {
    const { rng: _rng, ...data } = state;
    localStorage.setItem(
      KEY,
      JSON.stringify({
        version: 1,
        symbol: cfg.activeSymbol,
        timeframe: cfg.timeframe,
        data,
      }),
    );
  } catch {
    /* Paper persistence is best effort; never authoritative for MT5. */
  }
}

export function restorePaperSession(
  seed: number,
  cfg: EngineConfig,
): EngineState {
  const fresh = createEngine(seed, cfg);
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null");
    if (
      saved?.version !== 1 ||
      saved.symbol !== cfg.activeSymbol ||
      saved.timeframe !== cfg.timeframe
    )
      return fresh;
    const d = saved.data as EngineState;
    if (
      !d ||
      !Array.isArray(d.bars) ||
      d.bars.length < 600 ||
      d.bars.length > 2400 ||
      typeof d.sessionId !== "string" ||
      ![
        d.balance,
        d.equity,
        d.peakEquity,
        d.dayStartBalance,
        d.dailyTrades,
        d.dailyLoss,
        d.drawdownPercent,
        d.dayKey,
        d.nextT,
        d.nextId,
      ].every(Number.isFinite) ||
      d.balance <= 0 ||
      d.peakEquity <= 0 ||
      d.dayStartBalance <= 0 ||
      d.dailyLoss < 0 ||
      d.drawdownPercent < 0 ||
      !Number.isInteger(d.dailyTrades) ||
      d.dailyTrades < 0 ||
      typeof d.halted !== "boolean" ||
      (d.open && !validTrade(d.open)) ||
      !Array.isArray(d.trades) ||
      !d.trades.every(validTrade) ||
      !Array.isArray(d.queue) ||
      !d.queue.every(
        (q) => validTrade(q) && Number.isFinite(q.expiresAtTime),
      ) ||
      !d.bars.every(
        (b, i) =>
          [b.t, b.o, b.h, b.l, b.c, b.v].every(Number.isFinite) &&
          b.l > 0 &&
          b.l <= Math.min(b.o, b.c) &&
          b.h >= Math.max(b.o, b.c) &&
          (!i || b.t > d.bars[i - 1].t),
      )
    )
      return fresh;
    // Preserve paper position/risk latch on reload; pseudo-random future candles
    // resume with a new seed, not a claim of deterministic market replay.
    return {
      ...fresh,
      ...d,
      rng: fresh.rng,
      telemetry: fresh.telemetry,
      events: fresh.events,
      feedStatus: "connected",
      haltReason: typeof d.haltReason === "string" ? d.haltReason : undefined,
    };
  } catch {
    return fresh;
  }
}
