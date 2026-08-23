import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import type { EngineConfig, EngineState } from '../engine/types';
import type { Stats } from '../engine/engine';
import { fmtUSD } from '../engine/types';
import MarketTickerTape from './MarketTickerTape';
import CommandCenter from './CommandCenter';
import MarketVision from './MarketVision';
import BrainPanel from './BrainPanel';
import { ShieldCheck, Wifi, Settings, User } from 'lucide-react';

interface Props {
  st: EngineState;
  cfg: EngineConfig;
  stats: Stats;
  onExecuteOrder: (trade: {
    side: 'LONG' | 'SHORT';
    entry: number;
    sl: number;
    tp: number;
    oz: number;
    risk: number;
  }) => void;
  onClosePosition: () => void;
  onMoveToBreakeven: () => void;
  onScaleOut: (ratio?: number) => void;
    onDecide: (id: number, approved: boolean) => void;
  onOpenSettings: () => void;
  onToggleAutoMode?: () => void;
}

export const DashboardLayout: React.FC<Props> = ({
  st,
  cfg,
  stats,
  onExecuteOrder,
  onClosePosition,
  onMoveToBreakeven,
  onScaleOut,
  onDecide,
  onOpenSettings,
  onToggleAutoMode,
}) => {
  const currentEquity = st.equity?.length ? st.equity[st.equity.length - 1] : st.balance;
  const netPnl = stats.netPnl || 0;
  const isConnected = st.liveStatus === 'connected' || st.feedMode === 'simulated';
  const isAutoMode = !cfg.actionCenter;

  // Profit Rain Confetti Effect when TP is achieved
  useEffect(() => {
    const lastTrade = st.trades[st.trades.length - 1];
    if (lastTrade && !lastTrade.open && lastTrade.outcome === 'TP') {
      try {
        confetti({
          particleCount: 80,
          spread: 60,
          origin: { y: 0.6 },
          colors: ['#fcd34d', '#10b981', '#f59e0b'],
        });
      } catch {
        // Fallback gracefully if canvas is blocked
      }
    }
  }, [st.trades.length]);

  return (
    <div className="flex flex-col min-h-screen bg-[#050505] text-[#e5e5e5] font-sans antialiased selection:bg-[#f59e0b]/30 selection:text-[#fcd34d]">
      {/* 1. GLOBAL TOP HEADER */}
      <header className="sticky top-0 z-50 flex flex-wrap items-center justify-between px-4 md:px-6 py-2.5 border-b border-white/5 bg-[#080808]/95 backdrop-blur-xl gap-3">
        {/* Left: Animated Logo & Brand Badge */}
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-[#fcd34d] via-[#f59e0b] to-[#b45309] shadow-lg shadow-[#f59e0b]/20">
            <span className="font-mono font-black text-black text-xs tracking-tighter">TF</span>
            <div className="absolute -inset-0.5 rounded-lg bg-gradient-to-br from-[#fcd34d] to-[#b45309] opacity-40 blur-sm -z-10 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-sm tracking-wide text-white font-sans">
                TRADING FLOW
              </span>
              <span className="px-1.5 py-0.2 rounded bg-gradient-to-r from-[#fcd34d]/20 to-[#b45309]/20 border border-[#f59e0b]/40 text-[#fcd34d] text-[9px] font-black tracking-widest uppercase font-mono">
                PRO
              </span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono tracking-tight block">
              Institutional Gold Trading Suite
            </span>
          </div>
        </div>

        {/* Center/Right Controls: Global AUTO vs MANUAL Mode Switch + Telemetry */}
        <div className="flex flex-wrap items-center gap-3 md:gap-4 font-mono">
          {/* GLOBAL EXECUTION MODE: AUTO vs MANUAL */}
          <div className="flex items-center rounded-xl border border-white/10 p-1 bg-[#101010] shadow-inner">
            <button
              onClick={onToggleAutoMode}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all duration-200 cursor-pointer ${
                isAutoMode
                  ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 text-black shadow-lg shadow-emerald-900/50 border border-emerald-400/60 font-black'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
              title="Auto Mode: Signals execute automatically without confirmation"
            >
              <span className={`w-2 h-2 rounded-full ${isAutoMode ? 'bg-black animate-ping' : 'bg-slate-700'}`} />
              <span>⚡ AUTO PILOT</span>
            </button>

            <button
              onClick={onToggleAutoMode}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all duration-200 cursor-pointer ${
                !isAutoMode
                  ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-900/50 border border-blue-400/60 font-black'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
              title="Manual Mode: Signals held in Action Center for discretionary approval"
            >
              <span className={`w-2 h-2 rounded-full ${!isAutoMode ? 'bg-white' : 'bg-slate-700'}`} />
              <span>🎯 MANUAL</span>
            </button>
          </div>

          {/* Connection Status Pill */}
          <div
            className={`hidden sm:flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold border ${
              isConnected
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
            }`}
          >
            <div
              className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
              }`}
            />
            <span className="text-[10px] tracking-wider uppercase">
              {st.feedMode === 'live' ? 'MT5 CONNECTED' : 'SIMULATION LIVE'}
            </span>
          </div>

          {/* Account Balance */}
          <div className="text-right">
            <div className="text-[9px] text-slate-400 uppercase tracking-wider">EQUITY</div>
            <div className="text-sm md:text-base font-extrabold text-white">
              {fmtUSD(currentEquity, false, 2)}
            </div>
          </div>

          {/* Daily PnL Pill */}
          <div
            className={`px-2.5 py-1 rounded-lg border text-xs font-extrabold flex items-center gap-1 ${
              netPnl >= 0
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 glow-text-green'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-400 glow-text-red'
            }`}
          >
            <span>{fmtUSD(netPnl, true, 2)}</span>
          </div>

          {/* Settings Trigger */}
          <button
            onClick={onOpenSettings}
            className="p-2 rounded-lg bg-[#141414] hover:bg-[#222] border border-white/5 text-slate-300 transition-colors cursor-pointer"
            title="Broker & Risk Settings"
          >
            <Settings size={16} />
          </button>
        </div>
      </header>

      {/* 2. LIVE TICKER TAPE */}
      <MarketTickerTape goldPrice={st.price} dxyValue={st.dxyValue} />

      {/* 3. MAIN WORKSPACE (3-COLUMN BENTO GRID) */}
      <main className="flex-1 p-3 md:p-5 max-w-[1920px] mx-auto w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-5 items-start">
          {/* Column 1: The Command Center (Left - 3 Cols / 25%) */}
          <aside className="col-span-12 lg:col-span-3">
            <CommandCenter
              st={st}
              cfg={cfg}
              onExecuteOrder={onExecuteOrder}
              onClosePosition={onClosePosition}
              onMoveToBreakeven={onMoveToBreakeven}
              onScaleOut={onScaleOut}
            />
          </aside>

          {/* Column 2: The Vision (Center - 6 Cols / 50%) */}
          <section className="col-span-12 lg:col-span-6">
            <MarketVision st={st} cfg={cfg} onDecide={onDecide} />
          </section>

          {/* Column 3: The Brain (Right - 3 Cols / 25%) */}
          <aside className="col-span-12 lg:col-span-3">
            <BrainPanel st={st} cfg={cfg} />
          </aside>
        </div>
      </main>
    </div>
  );
};

export default DashboardLayout;
