import { advance, computeStats, DEFAULT_CFG, createEngine } from "../src/engine/engine";

// Synthetic paper smoke test only. This script has no broker transport imports.
const cfg = { ...DEFAULT_CFG, safe: { ...DEFAULT_CFG.safe }, executionMode: "automatic" as const };
const state = createEngine(94821, cfg);
for (let i = 0; i < 8640; i++) advance(state, cfg);
console.log({ source: "SYNTHETIC", liveValidated: false, ...computeStats(state) });
