import React from "react";
import type { EngineConfig, EngineState, Timeframe } from "../engine/types";
import { fmtP, fmtUSD, SUPPORTED_SYMBOLS, TIMEFRAMES } from "../engine/types";
import { activeSessions } from "../engine/market";
import {
  Volume2,
  VolumeX,
  Settings,
  HelpCircle,
  Play,
  Pause,
  BarChart2,
  Zap,
  Radio,
  Sparkles,
} from "lucide-react";

export const SPEEDS = [
  { label: "1×", ms: 1150 },
  { label: "3×", ms: 430 },
  { label: "8×", ms: 150 },
  { label: "MAX", ms: 55 },
];

interface Props {
  st: EngineState;
  cfg: EngineConfig;
  running: boolean;
  onToggleRun: () => void;
  speed: number;
  onSpeed: (i: number) => void;
  onNewScenario: () => void;
  onToggleLiveMode: () => void;
  onSelectSymbol: (sym: string) => void;
  onSelectTimeframe: (tf: Timeframe) => void;
  onToggleChartView: () => void;
  onToggleSound: () => void;
  onOpenBrokerSettings: () => void;
  onOpenGuide: () => void;
  onOpenQuickOrder?: (side: "LONG" | "SHORT") => void;
  onToggleAutoMode?: () => void;
  tick: number;
}

export default function HeaderBar({
  st,
  cfg,
  running,
  onToggleRun,
  speed,
  onSpeed,
  onNewScenario,
  onToggleLiveMode,
  onSelectSymbol,
  onSelectTimeframe,
  onToggleChartView,
  onToggleSound,
  onOpenBrokerSettings,
  onOpenGuide,
  onOpenQuickOrder,
  onToggleAutoMode,
  tick,
}: Props) {
  const last = st.bars[st.bars.length - 1] || {
    t: Date.now(),
    o: 2750,
    h: 2750,
    l: 2750,
    c: 2750,
    v: 0,
    day: 0,
  };
  const prev = st.bars[st.bars.length - 2] ?? last;
  const chg = last.c - st.dayOpen;
  const chgPct = st.dayOpen ? (chg / st.dayOpen) * 100 : 0;
  const hour = Math.floor((((last.t % 86400000) + 86400000) % 86400000) / 3600000);
  const ses = activeSessions(hour);

  const activeMeta =
    SUPPORTED_SYMBOLS.find((s) => s.symbol === cfg.activeSymbol) || SUPPORTED_SYMBOLS[0];
  const isLive = cfg.feedMode === "live";

  const halfSpread = cfg.spread / 2;
  const buyPrice = last.c + halfSpread;
  const sellPrice = last.c - halfSpread;
  const spreadPoints = (cfg.spread * (activeMeta.symbol.startsWith("XAU") ? 10 : 10000)).toFixed(
    1
  );

  const isAutoMode = !cfg.actionCenter;

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 px-4 py-2 bg-[#080808]/95 backdrop-blur-xl select-none font-sans z-20">
      {/* 1. Left Section: Asset Selector, Timeframe Pills & Live Stats */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Asset Selector */}
        <div className="flex items-center gap-2 bg-[#121212] border border-white/10 rounded-lg px-2.5 py-1.5 shadow-inner">
          <span className="w-2 h-2 rounded-full bg-[#f59e0b] animate-ping" />
          <select
            value={cfg.activeSymbol}
            onChange={(e) => onSelectSymbol(e.target.value)}
            className="bg-transparent text-white font-bold text-xs outline-none cursor-pointer pr-1 font-mono"
          >
            {SUPPORTED_SYMBOLS.map((s) => (
              <option key={s.symbol} value={s.symbol} className="bg-[#121212] text-white">
                {s.label} ({s.symbol})
              </option>
            ))}
          </select>
        </div>

        {/* Timeframe Selector Pills */}
        <div className="flex items-center bg-[#121212] border border-white/10 rounded-lg p-0.5 font-mono">
          {TIMEFRAMES.map((tf) => {
            const isActive = cfg.timeframe === tf.label;
            return (
              <button
                key={tf.label}
                onClick={() => onSelectTimeframe(tf.label)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                  isActive
                    ? "bg-[#222] text-white shadow-sm border border-white/10 font-extrabold"
                    : "text-slate-500 hover:text-white"
                }`}
              >
                {tf.label}
              </button>
            );
          })}
        </div>

        {/* Live Price & Spread Telemetry */}
        <div className="hidden xl:flex items-center gap-2 px-3 py-1 rounded-lg bg-[#101010] border border-white/5 font-mono text-xs">
          <span className="text-slate-400">SPREAD:</span>
          <span className="font-bold text-amber-300">{spreadPoints} pts</span>
          <span className="text-slate-600">|</span>
          <span
            className={`font-extrabold ${
              chg >= 0 ? "text-[#10b981]" : "text-[#ef4444]"
            }`}
          >
            {chg >= 0 ? "+" : ""}
            {chgPct.toFixed(2)}%
          </span>
        </div>
      </div>

      {/* 2. Center: Instant Buy / Sell Action Boxes */}
      <div className="flex items-center gap-2">
        <div className="flex items-center bg-[#101010] border border-white/10 rounded-xl p-1 gap-2 shadow-inner">
          {/* Sell Box Button */}
          <button
            onClick={() => onOpenQuickOrder?.("SHORT")}
            className="flex flex-col items-center justify-center px-3 py-1 rounded-lg bg-[#ef4444]/10 border border-[#ef4444]/40 text-center min-w-[85px] hover:bg-[#ef4444]/25 active:scale-[0.98] transition-all cursor-pointer"
            title="Click to open Universal Order Desk (SELL)"
          >
            <span className="text-xs font-bold text-[#ef4444] leading-tight font-mono">
              {fmtP(sellPrice, activeMeta.digits)}
            </span>
            <span className="text-[8px] font-black text-[#ef4444] tracking-wider">▼ SELL / SHORT</span>
          </button>

          {/* Quick Price Indicator */}
          <div className="flex flex-col items-center justify-center px-1 text-center font-mono">
            <span className="text-xs font-black text-white">{fmtP(last.c, activeMeta.digits)}</span>
            <span className="text-[7.5px] text-slate-500 tracking-tighter">MID PRICE</span>
          </div>

          {/* Buy Box Button */}
          <button
            onClick={() => onOpenQuickOrder?.("LONG")}
            className="flex flex-col items-center justify-center px-3 py-1 rounded-lg bg-[#10b981]/10 border border-[#10b981]/40 text-center min-w-[85px] hover:bg-[#10b981]/25 active:scale-[0.98] transition-all cursor-pointer"
            title="Click to open Universal Order Desk (BUY)"
          >
            <span className="text-xs font-bold text-[#10b981] leading-tight font-mono">
              {fmtP(buyPrice, activeMeta.digits)}
            </span>
            <span className="text-[8px] font-black text-[#10b981] tracking-wider">▲ BUY / LONG</span>
          </button>
        </div>
      </div>

      {/* 3. Right: Auto/Manual Switch, Live/Sim Mode & Global Tools */}
      <div className="flex items-center gap-2.5 font-mono">
        {/* GLOBAL AUTO vs MANUAL SWITCH */}
        <div className="flex items-center rounded-lg border border-white/10 p-0.5 bg-[#101010]">
          <button
            onClick={onToggleAutoMode}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[10.5px] font-extrabold transition-all cursor-pointer ${
              isAutoMode
                ? "bg-gradient-to-r from-emerald-600 to-emerald-500 text-black shadow font-black"
                : "text-slate-500 hover:text-slate-300"
            }`}
            title="Auto-Pilot: Algorithmic signals execute directly to broker"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${isAutoMode ? "bg-black animate-ping" : "bg-slate-700"}`} />
            <span>⚡ AUTO</span>
          </button>
          <button
            onClick={onToggleAutoMode}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[10.5px] font-extrabold transition-all cursor-pointer ${
              !isAutoMode
                ? "bg-blue-600 text-white shadow font-black"
                : "text-slate-500 hover:text-slate-300"
            }`}
            title="Manual: Signals held in Action Center for approval"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${!isAutoMode ? "bg-white" : "bg-slate-700"}`} />
            <span>🎯 MANUAL</span>
          </button>
        </div>

        {/* FEED MODE SWITCH (SIM vs LIVE) */}
        <div className="flex items-center rounded-lg border border-white/10 p-0.5 bg-[#101010]">
          <button
            onClick={onToggleLiveMode}
            className={`px-2.5 py-1 rounded-md text-[10.5px] font-bold transition-all cursor-pointer ${
              !isLive ? "bg-[#f59e0b] text-black font-extrabold shadow" : "text-slate-500 hover:text-white"
            }`}
          >
            SIM
          </button>
          <button
            onClick={onToggleLiveMode}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10.5px] font-bold transition-all cursor-pointer ${
              isLive
                ? "bg-[#10b981] text-black font-extrabold shadow animate-pulse"
                : "text-slate-500 hover:text-white"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-black" />
            <span>LIVE</span>
          </button>
        </div>

        {/* Simulator Replay Controls (When in SIM mode) */}
        {!isLive && (
          <div className="hidden lg:flex items-center overflow-hidden rounded-lg border border-white/10 bg-[#101010]">
            <button
              onClick={onToggleRun}
              className="px-2.5 py-1 transition-colors hover:bg-[#222] text-[#fcd34d] font-bold cursor-pointer"
              title={running ? "Pause replay" : "Resume replay"}
            >
              {running ? <Pause size={13} /> : <Play size={13} />}
            </button>
            {SPEEDS.map((s, i) => (
              <button
                key={s.label}
                onClick={() => onSpeed(i)}
                className={`border-l border-white/10 px-2 py-1 text-[10px] font-bold cursor-pointer ${
                  speed === i ? "bg-[#f59e0b]/20 text-[#fcd34d]" : "text-slate-500 hover:text-white"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        {/* Settings & Guide Buttons */}
        <button
          onClick={onOpenBrokerSettings}
          className="p-1.5 rounded-lg bg-[#141414] hover:bg-[#222] border border-white/5 text-slate-300 transition-colors cursor-pointer"
          title="Broker & Telegram Wire"
        >
          <Settings size={15} />
        </button>

        <button
          onClick={onOpenGuide}
          className="p-1.5 rounded-lg bg-[#141414] hover:bg-[#222] border border-white/5 text-slate-300 transition-colors cursor-pointer"
          title="Visual Strategy Guide"
        >
          <HelpCircle size={15} />
        </button>
      </div>
    </header>
  );
}
