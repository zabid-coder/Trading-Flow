import { DEFAULT_CFG } from "./engine";
import type { EngineConfig, SafeScalperConfig } from "./types";

const KEY = "safe_scalper_preferences_v1";
const bounds: Partial<Record<keyof SafeScalperConfig, [number, number]>> = {
  riskPercent: [0.1, 1],
  dailyLossPercent: [0.5, 1.5],
  maxDrawdownPercent: [2, 5],
  maxDailyTrades: [1, 2],
  maxMarginPercent: [5, 25],
  maxSpreadToStopPercent: [5, 12],
  stopLossPoints: [50, 2000],
  takeProfitPoints: [50, 3000],
  maxSpreadPoints: [5, 50],
};
export function loadPreferences(): EngineConfig {
  const cfg = {
    ...DEFAULT_CFG,
    safe: { ...DEFAULT_CFG.safe },
    brokerSpec: { ...DEFAULT_CFG.brokerSpec },
  };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
    for (const [key, range] of Object.entries(bounds)) {
      const value = saved[key];
      if (
        typeof value === "number" &&
        Number.isFinite(value) &&
        value >= range[0] &&
        value <= range[1] &&
        (key !== "maxDailyTrades" || Number.isInteger(value))
      ) {
        Object.assign(cfg.safe, { [key]: value });
      }
    }
  } catch {
    /* Untrusted/corrupt browser storage falls back to safe defaults. */
  }
  return cfg;
}
export function savePreferences(cfg: EngineConfig) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify(
        Object.fromEntries(
          Object.keys(bounds).map((key) => [
            key,
            cfg.safe[key as keyof SafeScalperConfig],
          ]),
        ),
      ),
    );
  } catch {
    /* Storage can be disabled; execution does not depend on this cache. */
  }
}
