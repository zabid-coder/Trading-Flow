// src/engine/slippage.ts — Realistic Institutional Session Slippage Model

export function getSessionFromTime(timestamp: number): "LON" | "NY" | "TOK" | "OFF" {
  const hour = Math.floor(((timestamp % 86400000) / 3600000) % 24);
  if (hour >= 12 && hour <= 15) return "NY";   // LON/NY overlap (tight)
  if (hour >= 7 && hour <= 11) return "LON";   // London open (tight)
  if (hour >= 3 && hour <= 6) return "TOK";    // Tokyo (tight)
  return "OFF";                                // Off-hours (wide)
}

export const SLIPPAGE_PIPS: Record<"LON" | "NY" | "TOK" | "OFF", number> = {
  LON: 0.18,   // 1.8 pips
  NY: 0.35,    // 3.5 pips
  TOK: 0.12,   // 1.2 pips
  OFF: 0.50,   // 5.0 pips (very wide)
};

export function applySlippage(
  signalPrice: number,
  side: "LONG" | "SHORT",
  timestamp: number
): number {
  const session = getSessionFromTime(timestamp);
  const slippage = SLIPPAGE_PIPS[session];
  return side === "LONG" ? signalPrice + slippage : signalPrice - slippage;
}
