import React, { useMemo } from 'react';
import { Card } from './ui/Card';
import type { EngineState, EngineConfig } from '../engine/types';
import { fmtP } from '../engine/types';
import { evaluateCreamer4Layer } from '../engine/creamerEngine';
import { ShieldCheck, Crosshair, Zap, Layers, AlertCircle, CheckCircle2, TrendingUp, TrendingDown, Radio } from 'lucide-react';

interface Props {
  st: EngineState;
  cfg: EngineConfig;
  onExecute?: (side: 'LONG' | 'SHORT') => void;
}

export const TrappedTradersRadar: React.FC<Props> = ({ st, cfg, onExecute }) => {
  const result = useMemo(() => {
    return evaluateCreamer4Layer(
      st.bars,
      st.atr,
      st.price || (st.bars[st.bars.length - 1]?.c || 2714.5),
      st.creamerFramework?.cumulativeDelta || 0,
      cfg.rr || 2.5
    );
  }, [st.bars, st.atr, st.price, cfg.rr]);

  const { layer1_Environment: l1, layer2_Location: l2, layer3_Confirmation: l3, layer4_Execution: l4 } = result;

  return (
    <Card
      title="Creamer 4-Layer Institutional Radar"
      icon={<Layers size={16} className="text-[#f59e0b]" />}
      status={l4.isReady ? 'active' : 'neutral'}
      className="p-3 md:p-4 relative overflow-hidden font-sans select-none"
    >
      {/* 1. TOP PIPELINE PROGRESS (4-LAYER GATES) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3.5 font-mono text-[10.5px]">
        {/* Layer 1: Environment */}
        <div
          className={`p-2 rounded-lg border ${
            l1.passed
              ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
              : 'bg-[#121212] border-white/5 text-slate-500'
          }`}
        >
          <div className="flex items-center justify-between font-bold text-[9.5px]">
            <span>1. ENVIRONMENT</span>
            {l1.passed ? <CheckCircle2 size={12} className="text-blue-400" /> : <div className="w-2 h-2 rounded-full bg-slate-700" />}
          </div>
          <div className="font-extrabold text-xs text-white mt-1">
            {l1.gex.gex.replace('_GAMMA', '')}
          </div>
          <div className="text-[9px] text-slate-400 truncate">{l1.gex.structure.replace('_', ' ')}</div>
        </div>

        {/* Layer 2: Location */}
        <div
          className={`p-2 rounded-lg border ${
            l2.passed
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-[#121212] border-white/5 text-slate-500'
          }`}
        >
          <div className="flex items-center justify-between font-bold text-[9.5px]">
            <span>2. LOCATION (FIB)</span>
            {l2.passed ? <CheckCircle2 size={12} className="text-emerald-400" /> : <div className="w-2 h-2 rounded-full bg-slate-700" />}
          </div>
          <div className="font-extrabold text-xs text-white mt-1 truncate">
            {l2.ote.activeZoneType.replace('_', ' ')}
          </div>
          <div className="text-[9px] text-slate-400">0.705 - 0.886 OTE</div>
        </div>

        {/* Layer 3: Confirmation */}
        <div
          className={`p-2 rounded-lg border ${
            l3.passed
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
              : 'bg-[#121212] border-white/5 text-slate-500'
          }`}
        >
          <div className="flex items-center justify-between font-bold text-[9.5px]">
            <span>3. CONFIRMATION</span>
            {l3.passed ? <CheckCircle2 size={12} className="text-amber-400" /> : <div className="w-2 h-2 rounded-full bg-slate-700" />}
          </div>
          <div className="font-extrabold text-xs text-white mt-1">
            {l3.orderFlow.absorptionType !== 'NONE' ? 'ABSORPTION' : 'DELTA FLOW'}
          </div>
          <div className="text-[9px] text-slate-400 truncate">Δ {l3.orderFlow.barDelta}</div>
        </div>

        {/* Layer 4: Execution */}
        <div
          className={`p-2 rounded-lg border ${
            l4.isReady
              ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 animate-pulse'
              : 'bg-[#121212] border-white/5 text-slate-500'
          }`}
        >
          <div className="flex items-center justify-between font-bold text-[9.5px]">
            <span>4. TRIGGER</span>
            {l4.isReady ? <Zap size={12} className="text-emerald-400" /> : <div className="w-2 h-2 rounded-full bg-slate-700" />}
          </div>
          <div className="font-extrabold text-xs text-white mt-1">
            {l4.isReady ? `${l4.side} READY` : 'WAITING'}
          </div>
          <div className="text-[9px] text-slate-400">Score: {result.totalScore}%</div>
        </div>
      </div>

      {/* 2. ORDER FLOW ABSORPTION ALERT & VOLUME DELTA HISTOGRAM */}
      <div className="p-3 rounded-xl bg-[#090909] border border-white/5 mb-3 font-mono">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="text-slate-400 flex items-center gap-1.5 font-bold">
            <Radio size={13} className="text-[#3b82f6] animate-ping" />
            Order Flow Delta & Trapped Traders Telemetry
          </span>
          <span className={`font-extrabold ${l3.orderFlow.barDelta >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
            Bar Delta: {l3.orderFlow.barDelta >= 0 ? `+${l3.orderFlow.barDelta}` : l3.orderFlow.barDelta}
          </span>
        </div>

        {/* Absorption Flashing Badge */}
        {l3.orderFlow.absorptionType !== 'NONE' ? (
          <div className="p-2 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-extrabold flex items-center gap-2 animate-pulse mb-2">
            <Zap size={14} className="text-amber-400" />
            <span>{l3.orderFlow.details}</span>
          </div>
        ) : (
          <div className="p-2 rounded-lg bg-[#141414] border border-white/5 text-slate-400 text-[11px] flex items-center gap-1.5 mb-2">
            <AlertCircle size={13} className="text-slate-500" />
            <span>Scanning for passive buyer/seller absorption at key swing extremes...</span>
          </div>
        )}

        {/* Fibonacci OTE Zone Boundaries */}
        <div className="grid grid-cols-3 gap-2 text-[10px] text-center pt-1 border-t border-white/5">
          <div className="p-1.5 rounded bg-[#121212] border border-white/5">
            <span className="text-slate-500 block text-[8px]">OTE 70.5%</span>
            <span className="font-bold text-slate-200">{fmtP(l2.ote.fib705)}</span>
          </div>
          <div className="p-1.5 rounded bg-[#121212] border border-amber-500/30 text-amber-300 font-bold">
            <span className="text-slate-500 block text-[8px]">SWEET SPOT 78.8%</span>
            <span>{fmtP(l2.ote.fib788)}</span>
          </div>
          <div className="p-1.5 rounded bg-[#121212] border border-white/5">
            <span className="text-slate-500 block text-[8px]">DEEP 88.6%</span>
            <span className="font-bold text-slate-200">{fmtP(l2.ote.fib886)}</span>
          </div>
        </div>
      </div>

      {/* 3. EXECUTION VERDICT & 1-CLICK TRIGGER BUTTON */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-xl bg-[#0c121e] border border-blue-500/20 font-mono text-xs">
        <div className="text-slate-300 text-[11px] flex-1 leading-tight">
          <span className="text-amber-400 font-extrabold block mb-0.5">CREAMER VERDICT:</span>
          {result.verdict}
        </div>

        {l4.isReady && l4.side && (
          <button
            onClick={() => onExecute?.(l4.side!)}
            className={`px-4 py-2.5 rounded-lg font-black text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-lg cursor-pointer ${
              l4.side === 'LONG'
                ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 text-black shadow-emerald-900/40 hover:from-emerald-500 hover:to-emerald-400 border border-emerald-400/50 animate-bounce'
                : 'bg-gradient-to-r from-rose-600 to-rose-500 text-white shadow-rose-900/40 hover:from-rose-500 hover:to-rose-400 border border-rose-400/50 animate-bounce'
            }`}
          >
            <Zap size={14} />
            <span>EXECUTE {l4.side} (1:{l4.rr}R)</span>
          </button>
        )}
      </div>
    </Card>
  );
};

export default TrappedTradersRadar;
