import React, { useState, useMemo } from 'react';
import { Card } from './ui/Card';
import type { EngineConfig, EngineState, Trade } from '../engine/types';
import { fmtP, fmtUSD } from '../engine/types';
import { ShieldAlert, Zap, ArrowUpRight, ArrowDownRight, CheckCircle2, AlertTriangle, Crosshair } from 'lucide-react';

interface Props {
  st: EngineState;
  cfg: EngineConfig;
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
}

export const CommandCenter: React.FC<Props> = ({
  st,
  cfg,
  onExecuteOrder,
  onClosePosition,
  onMoveToBreakeven,
  onScaleOut,
}) => {
  const [side, setSide] = useState<'LONG' | 'SHORT'>('LONG');
  const [riskUSD, setRiskUSD] = useState<number>(cfg.riskUSD || 25);
  const [slPips, setSlPips] = useState<number>(3.5); // $3.50 in gold = 35 pips
  const [rrRatio, setRrRatio] = useState<number>(cfg.rr || 2.5);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);

  const lastPrice = st.price || 2714.5;
  const spreadHalf = (cfg.spread || 0.35) / 2;
  const estimatedEntry = side === 'LONG' ? lastPrice + spreadHalf : lastPrice - spreadHalf;
  const estimatedSL = side === 'LONG' ? estimatedEntry - slPips : estimatedEntry + slPips;
  const estimatedTP = side === 'LONG' ? estimatedEntry + slPips * rrRatio : estimatedEntry - slPips * rrRatio;

  // Dynamic Position Sizing (Ounces / Lots)
  const calculatedLotSize = useMemo(() => {
    const riskPerOz = slPips * (cfg.pointValue || 1.0);
    if (riskPerOz <= 0) return 1.0;
    const rawOz = riskUSD / riskPerOz;
    return Math.max(0.1, Math.round(rawOz * 100) / 100);
  }, [riskUSD, slPips, cfg.pointValue]);

  const dailySLCount = st.dailySL || 0;
  const maxDailySL = cfg.maxDailySL || 2;
  const riskUsagePct = Math.min(100, Math.round((dailySLCount / maxDailySL) * 100));
  const isRiskWarning = riskUsagePct >= 50;
  const isRiskCritical = riskUsagePct >= 100;

  const handleExecute = () => {
    setIsExecuting(true);
    onExecuteOrder({
      side,
      entry: estimatedEntry,
      sl: estimatedSL,
      tp: estimatedTP,
      oz: calculatedLotSize,
      risk: riskUSD,
    });
    setTimeout(() => setIsExecuting(false), 400);
  };

  const openTrade = st.open;
  const floatingPnl = useMemo(() => {
    if (!openTrade) return 0;
    const cur = st.price;
    return openTrade.side === 'LONG'
      ? (cur - openTrade.entry) * openTrade.oz
      : (openTrade.entry - cur) * openTrade.oz;
  }, [openTrade, st.price]);

  return (
    <div className="flex flex-col gap-4 font-sans select-none">
      {/* 1. SMART ORDER PANEL */}
      <Card
        title="Command Center · Smart Execution"
        icon={<Crosshair size={16} className="text-[#f59e0b]" />}
        status={side === 'LONG' ? 'active' : 'error'}
        className="relative overflow-hidden"
      >
        {/* BUY / SELL SEGMENTED TOGGLE */}
        <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#090909] border border-white/5 mb-4">
          <button
            onClick={() => setSide('LONG')}
            className={`py-2.5 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-all duration-200 ${
              side === 'LONG'
                ? 'bg-[#10b981] text-black shadow-lg shadow-[#10b981]/30 font-extrabold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ArrowUpRight size={15} />
            <span>BUY / LONG</span>
          </button>

          <button
            onClick={() => setSide('SHORT')}
            className={`py-2.5 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-all duration-200 ${
              side === 'SHORT'
                ? 'bg-[#ef4444] text-white shadow-lg shadow-[#ef4444]/30 font-extrabold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ArrowDownRight size={15} />
            <span>SELL / SHORT</span>
          </button>
        </div>

        {/* Dynamic Calculations */}
        <div className="space-y-3 font-mono text-xs mb-4">
          <div className="flex justify-between items-center bg-[#141414] p-2.5 rounded-lg border border-white/5">
            <span className="text-slate-400">Account Risk ($)</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setRiskUSD(Math.max(10, riskUSD - 5))}
                className="w-6 h-6 rounded bg-[#222] text-slate-300 hover:text-white font-bold"
              >
                -
              </button>
              <span className="font-bold text-white px-2">${riskUSD}</span>
              <button
                onClick={() => setRiskUSD(riskUSD + 5)}
                className="w-6 h-6 rounded bg-[#222] text-slate-300 hover:text-white font-bold"
              >
                +
              </button>
            </div>
          </div>

          <div className="flex justify-between items-center bg-[#141414] p-2.5 rounded-lg border border-white/5">
            <span className="text-slate-400">Stop Distance ($)</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setSlPips(Math.max(1.0, Math.round((slPips - 0.5) * 10) / 10))}
                className="w-6 h-6 rounded bg-[#222] text-slate-300 hover:text-white font-bold"
              >
                -
              </button>
              <span className="font-bold text-amber-300 px-2">${slPips.toFixed(1)}</span>
              <button
                onClick={() => setSlPips(Math.round((slPips + 0.5) * 10) / 10)}
                className="w-6 h-6 rounded bg-[#222] text-slate-300 hover:text-white font-bold"
              >
                +
              </button>
            </div>
          </div>

          <div className="flex justify-between items-center bg-[#141414] p-2.5 rounded-lg border border-white/5">
            <span className="text-slate-400">Calculated Size</span>
            <span className="font-extrabold text-white text-sm">
              {calculatedLotSize.toFixed(2)} oz <span className="text-[10px] text-slate-500 font-normal">({(calculatedLotSize / 100).toFixed(2)} lots)</span>
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
            <div className="p-2 rounded bg-[#0f172a]/80 border border-blue-500/20 text-blue-300">
              <div className="text-[9px] text-slate-400">SL PRICE</div>
              <div className="font-bold text-xs">{fmtP(estimatedSL)}</div>
            </div>
            <div className="p-2 rounded bg-[#064e3b]/40 border border-emerald-500/20 text-emerald-300">
              <div className="text-[9px] text-slate-400">TP PRICE (1:{rrRatio})</div>
              <div className="font-bold text-xs">{fmtP(estimatedTP)}</div>
            </div>
          </div>
        </div>

        {/* ONE-CLICK EXECUTE BUTTON */}
        <button
          disabled={st.halted || !!openTrade || isRiskCritical}
          onClick={handleExecute}
          className={`w-full py-3.5 rounded-xl font-extrabold text-sm tracking-wider uppercase transition-all duration-200 flex items-center justify-center gap-2 relative overflow-hidden ${
            st.halted || openTrade || isRiskCritical
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
              : side === 'LONG'
              ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-black shadow-lg shadow-emerald-900/40 border border-emerald-400/50 active:scale-[0.98]'
              : 'bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white shadow-lg shadow-rose-900/40 border border-rose-400/50 active:scale-[0.98]'
          }`}
        >
          {isExecuting ? (
            <span className="animate-pulse">DISPATCHING ORDER...</span>
          ) : openTrade ? (
            <span>POSITION ACTIVE · IN MARKET</span>
          ) : st.halted || isRiskCritical ? (
            <span>CIRCUIT BREAKER · LOCKED</span>
          ) : (
            <>
              <Zap size={16} />
              <span>1-CLICK {side} {cfg.activeSymbol}</span>
            </>
          )}
        </button>
      </Card>

      {/* 2. RISK MONITOR & CIRCULAR DRAWDOWN RING */}
      <Card title="Risk Monitor" icon={<ShieldAlert size={16} className="text-rose-400" />} status={isRiskCritical ? 'error' : isRiskWarning ? 'warning' : 'neutral'}>
        <div className="flex items-center gap-4">
          {/* Progress Gauge */}
          <div className="relative w-16 h-16 flex items-center justify-center flex-shrink-0">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
              <path
                className="text-slate-800"
                strokeWidth="3.5"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className={isRiskCritical ? 'text-rose-500' : isRiskWarning ? 'text-amber-500' : 'text-emerald-500'}
                strokeDasharray={`${riskUsagePct}, 100`}
                strokeWidth="3.5"
                strokeLinecap="round"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <span className="absolute font-mono text-xs font-extrabold text-white">
              {riskUsagePct}%
            </span>
          </div>

          <div className="flex-1 font-mono text-xs">
            <div className="flex justify-between items-center mb-1">
              <span className="text-slate-400">Daily SL Hits</span>
              <span className="font-bold text-white">{dailySLCount} / {maxDailySL}</span>
            </div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-slate-400">Circuit Breaker</span>
              <span className={`font-bold ${isRiskCritical ? 'text-rose-400' : 'text-emerald-400'}`}>
                {isRiskCritical ? 'ENGAGED' : 'ARMED'}
              </span>
            </div>
            {isRiskWarning && (
              <div className="text-[10px] text-amber-400 mt-1 flex items-center gap-1 font-sans">
                <AlertTriangle size={11} /> High risk exposure reached
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* 3. ACTIVE POSITIONS DESK */}
      {openTrade ? (
        <Card title="Active Position" icon={<CheckCircle2 size={16} className="text-emerald-400" />} status="active" className="border-l-4 border-l-emerald-500 animate-pulse-dot">
          <div className="space-y-3 font-mono text-xs">
            <div className="flex justify-between items-center">
              <span className="font-bold text-white text-sm flex items-center gap-1.5">
                {cfg.activeSymbol}
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold ${openTrade.side === 'LONG' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                  {openTrade.side} {openTrade.oz.toFixed(2)} oz
                </span>
              </span>
              <span className={`text-base font-extrabold ${floatingPnl >= 0 ? 'text-emerald-400 glow-text-green' : 'text-rose-400 glow-text-red'}`}>
                {fmtUSD(floatingPnl, true, 2)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] bg-[#141414] p-2 rounded-lg border border-white/5">
              <div>
                <span className="text-slate-500 block text-[9px]">ENTRY</span>
                <span className="text-slate-200 font-bold">{fmtP(openTrade.entry)}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[9px]">MARKET</span>
                <span className="text-white font-bold">{fmtP(st.price)}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[9px]">STOP LOSS</span>
                <span className="text-rose-400 font-bold">{fmtP(openTrade.sl)}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[9px]">TAKE PROFIT</span>
                <span className="text-emerald-400 font-bold">{fmtP(openTrade.tp)}</span>
              </div>
            </div>

            {/* In-Flight Actions */}
            <div className="grid grid-cols-3 gap-2 pt-1">
              <button
                onClick={onMoveToBreakeven}
                className="py-1.5 rounded bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 font-bold text-[10px] border border-blue-500/30 transition-colors"
              >
                Move to BE
              </button>
              <button
                onClick={() => onScaleOut(0.5)}
                className="py-1.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-bold text-[10px] border border-amber-500/30 transition-colors"
              >
                Scale 50%
              </button>
              <button
                onClick={onClosePosition}
                className="py-1.5 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-bold text-[10px] border border-rose-500/30 transition-colors"
              >
                Close All
              </button>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
};

export default CommandCenter;
