import React, { useState } from "react";
import type { EngineConfig, EngineState } from "../engine/types";
import { STRATEGY_DEFINITIONS } from "../engine/types";
import { advance } from "../engine/engine";

interface Props {
  st: EngineState;
  cfg: EngineConfig;
  onCfg: (p: Partial<EngineConfig>) => void;
}

export default function StrategiesConfigView({ st, cfg, onCfg }: Props) {
  const [testResult, setTestResult] = useState<string | null>(null);

  const runQuickTest = () => {
    const prevTrades = st.trades.length;
    // Advance 96 bars (1 full trading day of 15m candles)
    for (let i = 0; i < 96; i++) {
      advance(st, cfg);
    }
    const newTrades = st.trades.length - prevTrades;
    setTestResult(`✓ Advanced 96 bars (1 Day). Executed ${newTrades} new strategy trades.`);
    setTimeout(() => setTestResult(null), 5000);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6 custom-scrollbar text-gray-200 font-sans">
      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-2 border-b border-[#1b263b]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-white tracking-tight font-sans">
              Strategies & Algorithmic EA Desk
            </h1>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono">
              INSTITUTIONAL CORE
            </span>
          </div>
          <p className="text-xs text-gray-400 font-mono mt-1">
            Configure BM Range Breakout EA parameters, 5 institutional precision filters, and confluence execution logic
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={runQuickTest}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-black text-xs font-mono shadow-md transition-all flex items-center gap-1.5"
          >
            <span>⚡</span>
            <span>RUN 1-DAY EA SIMULATION TEST</span>
          </button>
        </div>
      </div>

      {testResult && (
        <div className="p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-mono text-xs font-bold animate-fade-in flex items-center justify-between">
          <span>{testResult}</span>
          <span className="text-[10px] opacity-75">Check Trades Ledger or Dashboard to view new trades</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* PANEL 1: BM TRADING RANGE BREAKOUT EA */}
        <div className="bg-[#0f172a] rounded-xl border border-[#1e293b] p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#1e293b]">
            <div className="flex items-center gap-2">
              <span className="text-xl">⏱️</span>
              <div>
                <h2 className="text-sm font-bold text-white font-mono tracking-wide">
                  BM RANGE BREAKOUT EA
                </h2>
                <p className="text-[10px] text-gray-400 font-mono">
                  Time-bounded range formation with automated pending order breakouts
                </p>
              </div>
            </div>

            <button
              onClick={() => onCfg({ rbEnabled: !cfg.rbEnabled })}
              className={`px-3.5 py-1.5 rounded-lg font-mono text-xs font-black transition-all ${
                cfg.rbEnabled
                  ? "bg-amber-400 text-black shadow-md shadow-amber-500/30"
                  : "bg-gray-800 text-gray-400 border border-gray-700 hover:text-white"
              }`}
            >
              {cfg.rbEnabled ? "EA ARMED ⚡" : "DISABLED"}
            </button>
          </div>

          <div className="space-y-4 font-mono text-xs">
            <div className="p-3 rounded-lg bg-[#141f33] border border-[#1e2d4a] flex items-center justify-between">
              <div>
                <span className="text-gray-400 block text-[10px]">CURRENT EA STATUS</span>
                <span className="font-bold text-white text-sm">
                  {cfg.rbEnabled ? `STATE: ${st.rbState}` : "INACTIVE (Click EA ARMED above)"}
                </span>
              </div>
              {st.rbHigh && st.rbLow ? (
                <div className="text-right text-[11px]">
                  <span className="text-emerald-400 block font-bold">Range High: {st.rbHigh.toFixed(2)}</span>
                  <span className="text-rose-400 block font-bold">Range Low: {st.rbLow.toFixed(2)}</span>
                </div>
              ) : (
                <div className="text-right text-[10px] text-gray-500">
                  Range will form at {String(cfg.rbStartH ?? 7).padStart(2, '0')}:{String(cfg.rbStartM ?? 0).padStart(2, '0')} UTC
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-gray-400 block mb-1">RANGE START HOUR (UTC)</label>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={cfg.rbStartH ?? 7}
                  onChange={(e) => onCfg({ rbStartH: Number(e.target.value) })}
                  className="w-full bg-[#162033] border border-[#24334f] rounded-lg px-3 py-2 text-white font-bold"
                />
              </div>

              <div>
                <label className="text-[10px] text-gray-400 block mb-1">RANGE START MINUTE</label>
                <input
                  type="number"
                  min={0}
                  max={55}
                  step={5}
                  value={cfg.rbStartM ?? 0}
                  onChange={(e) => onCfg({ rbStartM: Number(e.target.value) })}
                  className="w-full bg-[#162033] border border-[#24334f] rounded-lg px-3 py-2 text-white font-bold"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-gray-400 block mb-1">RANGE END HOUR (UTC)</label>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={cfg.rbEndH ?? 10}
                  onChange={(e) => onCfg({ rbEndH: Number(e.target.value) })}
                  className="w-full bg-[#162033] border border-[#24334f] rounded-lg px-3 py-2 text-white font-bold"
                />
              </div>

              <div>
                <label className="text-[10px] text-gray-400 block mb-1">RANGE END MINUTE</label>
                <input
                  type="number"
                  min={0}
                  max={55}
                  step={5}
                  value={cfg.rbEndM ?? 0}
                  onChange={(e) => onCfg({ rbEndM: Number(e.target.value) })}
                  className="w-full bg-[#162033] border border-[#24334f] rounded-lg px-3 py-2 text-white font-bold"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] text-gray-400 block mb-1">
                ORDER BUFFER (POINTS BEYOND RANGE)
              </label>
              <input
                type="number"
                min={0}
                step={5}
                value={cfg.rbBufferPoints ?? 20}
                onChange={(e) => onCfg({ rbBufferPoints: Number(e.target.value) })}
                className="w-full bg-[#162033] border border-[#24334f] rounded-lg px-3 py-2 text-white font-bold"
              />
              <span className="text-[10px] text-gray-500 mt-1 block">
                Pending Buy placed at High + Buffer; Pending Sell at Low - Buffer
              </span>
            </div>
          </div>
        </div>

        {/* PANEL 2: INSTITUTIONAL CONFLUENCE & PRECISION FILTERS */}
        <div className="bg-[#0f172a] rounded-xl border border-[#1e293b] p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#1e293b]">
            <div className="flex items-center gap-2">
              <span className="text-xl">🛡️</span>
              <div>
                <h2 className="text-sm font-bold text-white font-mono tracking-wide">
                  INSTITUTIONAL SIGNAL FILTERS
                </h2>
                <p className="text-[10px] text-gray-400 font-mono">
                  5-Layer precision gate to eliminate noise & preserve capital
                </p>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10px] font-mono font-bold">
              GATE {cfg.confluenceGate ?? 75}/100
            </span>
          </div>

          <div className="space-y-3 font-mono text-xs">
            {/* Filter 1: Killzone */}
            <div className="p-3 rounded-lg bg-[#141f33] border border-[#1e2d4a] flex items-center justify-between">
              <div>
                <div className="font-bold text-white text-[11px]">KILLZONE SESSION GATE</div>
                <div className="text-[9.5px] text-gray-400">
                  Blocks trades during dead zones (London 07-12, NY 13-17 UTC)
                </div>
              </div>
              <input
                type="checkbox"
                checked={cfg.killzoneFilter ?? true}
                onChange={(e) => onCfg({ killzoneFilter: e.target.checked })}
                className="h-4 w-4 accent-emerald-500 cursor-pointer"
              />
            </div>

            {/* Filter 2: EMA Trend */}
            <div className="p-3 rounded-lg bg-[#141f33] border border-[#1e2d4a] flex items-center justify-between">
              <div>
                <div className="font-bold text-white text-[11px]">50 / 200 EMA TREND FILTER</div>
                <div className="text-[9.5px] text-gray-400">
                  Blocks counter-trend reversals in established macro flow
                </div>
              </div>
              <input
                type="checkbox"
                checked={cfg.trendFilter ?? true}
                onChange={(e) => onCfg({ trendFilter: e.target.checked })}
                className="h-4 w-4 accent-emerald-500 cursor-pointer"
              />
            </div>

            {/* Confluence Gate Slider */}
            <div className="p-3 rounded-lg bg-[#141f33] border border-[#1e2d4a] space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white text-[11px]">MINIMUM CONFLUENCE GATE</span>
                <span className="font-black text-amber-300 text-sm">
                  {cfg.confluenceGate ?? 75} / 100 PTS
                </span>
              </div>
              <input
                type="range"
                min={50}
                max={95}
                step={5}
                value={cfg.confluenceGate ?? 75}
                onChange={(e) => onCfg({ confluenceGate: Number(e.target.value) })}
                className="w-full accent-amber-400 cursor-pointer"
              />
              <div className="flex justify-between text-[9px] text-gray-500 font-mono">
                <span>50 (Permissive)</span>
                <span>75 (Institutional)</span>
                <span>95 (Ultra-Strict)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* PANEL 3: STRATEGY DEFINITIONS & EXECUTION MODE */}
      <div className="bg-[#0f172a] rounded-xl border border-[#1e293b] p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#1e293b]">
          <div className="flex items-center gap-2">
            <span className="text-xl">⚡</span>
            <div>
              <h2 className="text-sm font-bold text-white font-mono tracking-wide">
                CORE PRICE ACTION STRATEGIES
              </h2>
              <p className="text-[10px] text-gray-400 font-mono">
                Toggle individual price action setups on or off
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 font-mono">
          {STRATEGY_DEFINITIONS.map((p) => {
            const isEnabled = cfg.enabledStrategies[p.id];
            return (
              <button
                key={p.id}
                onClick={() =>
                  onCfg({
                    enabledStrategies: {
                      ...cfg.enabledStrategies,
                      [p.id]: !isEnabled,
                    },
                  })
                }
                className={`p-3 rounded-xl border text-left transition-all ${
                  isEnabled
                    ? "bg-[#172844] border-blue-500 shadow-md text-white"
                    : "bg-[#111928] border-[#1e293b] text-gray-400 hover:text-white hover:bg-[#142033]"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-black text-xs text-blue-300">{p.shortName}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[8.5px] font-bold ${
                      isEnabled ? "bg-emerald-500/20 text-emerald-400" : "bg-gray-800 text-gray-500"
                    }`}
                  >
                    {isEnabled ? "ACTIVE" : "OFF"}
                  </span>
                </div>
                <p className="text-[9.5px] text-gray-400 line-clamp-2 leading-relaxed">
                  {p.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
