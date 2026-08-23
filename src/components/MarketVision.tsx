import React, { useState, useMemo } from 'react';
import { Card } from './ui/Card';
import CandleChart from './CandleChart';
import type { EngineConfig, EngineState } from '../engine/types';
import { fmtP } from '../engine/types';
import { Sparkles, Layers, Eye, EyeOff, ShieldCheck, Check, Clock, TrendingUp } from 'lucide-react';

interface Props {
  st: EngineState;
  cfg: EngineConfig;
  onDecide: (id: number, approved: boolean) => void;
}

export const MarketVision: React.FC<Props> = ({ st, cfg }) => {
  const [godMode, setGodMode] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<'candle' | 'tradingview'>('candle');

  // Confluence Calculation & Alignment Checks
  const confScore = st.lastConfluenceScore || 85;
  const mtc = st.mtcAlignment;
  const le = st.lastEval;

  const cf = st.creamerFramework;
  const checks = useMemo(() => [
    {
      id: 'gex',
      label: '1. GEX Environment',
      ok: cf?.gexState === 'POSITIVE_GAMMA' || cf?.valueRegime !== 'VALUE_RANGE_BOUND',
      desc: cf ? `${cf.gexState.replace('_GAMMA', '')} (PCR: ${cf.pcrRatio})` : 'Neutral Gamma',
    },
    {
      id: 'ote',
      label: '2. Location (OTE Fib)',
      ok: !!cf?.inOteZone,
      desc: cf?.inOteZone ? `${cf.oteZoneType.replace('_', ' ')} (0.705-0.886)` : `Extremes: ${cf?.fib705 || 0} / ${cf?.fib886 || 0}`,
    },
    {
      id: 'absorption',
      label: '3. Volume Absorption',
      ok: cf?.absorption !== 'NONE' || (le.cls === 'LPR' || le.cls === 'HPR'),
      desc: cf?.absorption && cf.absorption !== 'NONE' ? cf.absorption.replace(/_/g, ' ') : `Delta ${cf?.barDelta || 0} (${le.cls})`,
    },
    {
      id: 'asian',
      label: '4. Asian Fakeout',
      ok: st.asianHigh != null && st.asianLow != null,
      desc: st.asianHigh ? `H: ${fmtP(st.asianHigh)} / L: ${fmtP(st.asianLow || 0)}` : 'Building Range',
    },
    {
      id: 'macro',
      label: '5. Macro & News',
      ok: !st.upcomingNews?.isCooldownActive && (st.dxyTrend === 'BEARISH' || mtc?.aligned),
      desc: st.upcomingNews?.isCooldownActive ? 'News Cooldown' : `DXY ${st.dxyValue || 104.25} (${st.dxyTrend || 'OK'})`,
    },
  ], [st, mtc, le, cf]);

  // Session / Countdown Timer (Next Killzone or News)
  const sessionCountdown = useMemo(() => {
    const d = new Date();
    const curHour = d.getUTCHours();
    const curMin = d.getUTCMinutes();
    let nextEvent = 'London Open';
    let targetHour = 7;

    if (curHour >= 7 && curHour < 12) {
      nextEvent = 'NY Open / Overlap';
      targetHour = 12;
    } else if (curHour >= 12 && curHour < 16) {
      nextEvent = 'London Close';
      targetHour = 16;
    } else if (curHour >= 16 && curHour < 21) {
      nextEvent = 'NY Session Close';
      targetHour = 21;
    } else {
      nextEvent = 'Tokyo / Asian Open';
      targetHour = 24;
    }

    const totalCurMin = curHour * 60 + curMin;
    const totalTargetMin = targetHour * 60;
    const diff = (totalTargetMin - totalCurMin + 1440) % 1440;
    const h = Math.floor(diff / 60);
    const m = diff % 60;

    return { event: nextEvent, timeStr: `${h}h ${m}m` };
  }, [st.price]);

  return (
    <div className="flex flex-col gap-4 font-sans select-none h-full">
      {/* 1. HERO CHART VIEW */}
      <Card
        title="Vision · Institutional Charting"
        icon={
          <div className="flex items-center gap-2">
            {/* GOD MODE TOGGLE */}
            <button
              onClick={() => setGodMode(!godMode)}
              className={`px-2.5 py-1 rounded-md text-[10px] font-extrabold flex items-center gap-1.5 transition-all border ${
                godMode
                  ? 'bg-gradient-to-r from-amber-500/20 to-amber-600/20 border-amber-500/50 text-amber-300 shadow-lg shadow-amber-900/20'
                  : 'bg-[#141414] border-white/5 text-slate-500 hover:text-slate-300'
              }`}
            >
              <Sparkles size={12} className={godMode ? 'text-amber-400 animate-spin' : ''} />
              <span>GOD MODE {godMode ? 'ON' : 'OFF'}</span>
            </button>

            {/* COUNTDOWN BADGE */}
            <div className="px-2.5 py-1 rounded-md bg-[#121212] border border-white/5 text-[10px] text-slate-400 flex items-center gap-1 font-mono">
              <Clock size={11} className="text-[#3b82f6]" />
              <span>{sessionCountdown.event}:</span>
              <span className="text-white font-bold">{sessionCountdown.timeStr}</span>
            </div>
          </div>
        }
        className="p-3 md:p-4 flex flex-col flex-1 relative overflow-hidden"
      >
        {/* HERO CANDLESTICK CHART */}
        <div className="flex-1 min-h-[420px] md:min-h-[460px] rounded-xl overflow-hidden border border-white/5 relative bg-[#070707]">
          <CandleChart st={st} cfg={cfg} />
        </div>
      </Card>

      {/* 2. STRATEGY LOGIC CONFLUENCE VISUALIZER */}
      <Card title="Strategy Logic Visualizer" icon={<ShieldCheck size={16} className="text-emerald-400" />} status="active">
        <div className="space-y-3">
          {/* Confluence Progress Bar */}
          <div className="flex items-center justify-between font-mono text-xs">
            <span className="text-slate-400 font-semibold">Institutional Confluence Rating</span>
            <span className="text-emerald-400 font-extrabold text-sm">{confScore} / 100%</span>
          </div>

          <div className="w-full h-2.5 rounded-full bg-[#141414] overflow-hidden border border-white/5 relative">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 via-amber-400 to-emerald-400 transition-all duration-500 shadow-lg shadow-emerald-500/20"
              style={{ width: `${confScore}%` }}
            />
          </div>

          {/* Micro Confluence Check Badges */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 pt-1 font-mono text-[10px]">
            {checks.map((c) => (
              <div
                key={c.id}
                className={`p-2 rounded-lg border transition-colors ${
                  c.ok
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-[#141414] border-white/5 text-slate-500'
                }`}
              >
                <div className="flex items-center gap-1 font-bold mb-0.5">
                  {c.ok ? <Check size={12} className="text-emerald-400" /> : <div className="w-3 h-3 rounded-full border border-slate-700" />}
                  <span>{c.label}</span>
                </div>
                <div className="text-[9px] text-slate-400 truncate">{c.desc}</div>
              </div>
            ))}
          </div>

          {/* Narrative Decision Verdict */}
          <div className="p-3 rounded-lg bg-[#0c121e] border border-blue-500/20 font-mono text-xs text-slate-300 flex items-start gap-2">
            <span className="text-amber-400 font-extrabold flex-shrink-0">VERDICT &gt;</span>
            <span className="leading-relaxed">{le.verdict}</span>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default MarketVision;
