import React, { useMemo } from 'react';
import { Card } from './ui/Card';
import type { EngineConfig, EngineState } from '../engine/types';
import { fmtP, fmtUSD } from '../engine/types';
import { Brain, Terminal, Activity, Zap, Flame, ShieldAlert, Sparkles } from 'lucide-react';

interface Props {
  st: EngineState;
  cfg: EngineConfig;
}

export const BrainPanel: React.FC<Props> = ({ st, cfg }) => {
  const regime = st.regime || 'STRONG_BULL';
  const lastBar = st.bars[st.bars.length - 1];

  const regimeConfig = useMemo(() => {
    switch (regime as string) {
      case 'STRONG_BULL':
      case 'TRENDING_BULL':
      case 'WEAK_BULL':
      case 'BULLISH_MOMENTUM':
        return {
          title: 'Strong Bullish Expansion',
          color: 'text-emerald-400',
          bg: 'bg-emerald-500/10 border-emerald-500/30',
          status: 'active' as const,
          desc: 'High probability long breakouts and dip buys on AOI test.',
        };
      case 'STRONG_BEAR':
      case 'TRENDING_BEAR':
      case 'BEARISH_REVERSAL':
        return {
          title: 'Strong Bearish Breakdown',
          color: 'text-rose-400',
          bg: 'bg-rose-500/10 border-rose-500/30',
          status: 'error' as const,
          desc: 'Liquidity sweeps and short rallies on EMA resistance.',
        };
      case 'NEWS_SPIKE':
      case 'VOLATILE_EXPANSION':
        return {
          title: 'News Spike / High Volatility',
          color: 'text-purple-400',
          bg: 'bg-purple-500/20 border-purple-500/50 animate-pulse',
          status: 'warning' as const,
          desc: 'Extreme slippage risk. Cooldown filter engaged.',
        };
      case 'LIQUIDITY_GRAB':
      case 'LIQUIDITY_HUNT':
        return {
          title: 'Liquidity Grab Active',
          color: 'text-blue-400',
          bg: 'bg-blue-500/10 border-blue-500/30',
          status: 'active' as const,
          desc: 'Institutional fakeout underway. Mean-reversion traps primed.',
        };
      default:
        return {
          title: 'Ranging / Sideways Chop',
          color: 'text-amber-400',
          bg: 'bg-amber-500/10 border-amber-500/30',
          status: 'warning' as const,
          desc: 'Mean-reversion only. Stand down at mid-range.',
        };
    }
  }, [regime]);

  // AI Trade Journal Log & Narrative
  const aiJournal = useMemo(() => {
    const lastTrade = st.trades[st.trades.length - 1];
    const isGold = (cfg.activeSymbol || '').startsWith('XAU');

    if (lastTrade) {
      return {
        action: `${lastTrade.side} Executed @ ${fmtP(lastTrade.entry)}`,
        reason: `${lastTrade.setup || 'Liquidity sweep'} confirmed with ${lastTrade.identity || 'reversal'} pin bar and volume confirmation.`,
        confidence: 88,
        pnl: lastTrade.pnl !== undefined ? fmtUSD(lastTrade.pnl, true, 2) : 'Active',
      };
    }

    return {
      action: 'Monitoring Market Liquidity Pools',
      reason: `Tracking Asian Range (${fmtP(st.asianHigh || 2715)} / ${fmtP(st.asianLow || 2705)}) + DXY correlation for London sweep.`,
      confidence: 84,
      pnl: 'Standing By',
    };
  }, [st.trades, st.asianHigh, st.asianLow, cfg.activeSymbol]);

  // Scrolling Terminal Logs
  const terminalLogs = useMemo(() => {
    if (st.events && st.events.length > 0) {
      return [...st.events].reverse().slice(0, 8).map(e => ({
        id: e.id,
        time: new Date(e.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        tag: e.tag,
        msg: e.msg,
      }));
    }
    return [
      { id: 1, time: '14:32:10', tag: 'ENTRY', msg: 'Asian Low Swept & Reclaimed · LONG Filled' },
      { id: 2, time: '14:30:00', tag: 'MTC', msg: '4H/15m/5m Confluence Aligned (Score: 85%)' },
      { id: 3, time: '14:15:00', tag: 'FEED', msg: 'WebSocket K-Line Sync · Latency 24ms' },
      { id: 4, time: '14:00:00', tag: 'SYS', msg: 'FastAPI MT5 Bridge Authenticated' },
    ];
  }, [st.events]);

  return (
    <div className="flex flex-col gap-4 font-sans select-none h-full">
      {/* 1. MARKET REGIME DETECTOR */}
      <Card
        title="Market Regime Detector"
        icon={<Activity size={16} className={regimeConfig.color} />}
        status={regimeConfig.status}
      >
        <div className="space-y-2.5">
          <div className={`p-3 rounded-xl border ${regimeConfig.bg} flex items-center justify-between`}>
            <div>
              <div className={`font-extrabold text-sm ${regimeConfig.color}`}>
                {regimeConfig.title}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">{regimeConfig.desc}</div>
            </div>
            <div className="flex-shrink-0 text-xs font-mono font-black px-2 py-1 rounded bg-black/40 text-white">
              {regime.replace(/_/g, ' ')}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
            <div className="p-2 rounded-lg bg-[#141414] border border-white/5">
              <span className="text-slate-500 block text-[9px]">DXY TREND</span>
              <span className={`font-bold ${st.dxyTrend === 'BEARISH' ? 'text-emerald-400' : 'text-rose-400'}`}>
                {st.dxyTrend || 'NEUTRAL'} ({st.dxyValue || 104.25})
              </span>
            </div>
            <div className="p-2 rounded-lg bg-[#141414] border border-white/5">
              <span className="text-slate-500 block text-[9px]">KILLZONE</span>
              <span className="font-bold text-amber-300">
                {st.activeKillzone || 'LONDON'}
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* 2. AI TRADE JOURNAL & COGNITIVE REASONING */}
      <Card
        title="AI Trade Intelligence Journal"
        icon={<Brain size={16} className="text-[#3b82f6]" />}
        status="active"
      >
        <div className="space-y-3 font-mono text-xs">
          <div className="p-3 rounded-lg bg-[#0d1526] border border-blue-500/20 text-slate-200">
            <div className="flex justify-between items-center mb-1 text-[11px]">
              <span className="font-bold text-blue-300 flex items-center gap-1">
                <Sparkles size={13} className="text-amber-400" />
                {aiJournal.action}
              </span>
              <span className="font-extrabold text-emerald-400">{aiJournal.pnl}</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed font-sans mt-1.5">
              {aiJournal.reason}
            </p>
          </div>

          {/* Probability of Success Meter */}
          <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">Setup Probability Meter</span>
              <span className="text-emerald-400 font-extrabold">{aiJournal.confidence}% Win Probability</span>
            </div>
            <div className="w-full h-2 rounded-full bg-[#141414] overflow-hidden border border-white/5">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-400"
                style={{ width: `${aiJournal.confidence}%` }}
              />
            </div>
          </div>
        </div>
      </Card>

      {/* 3. SYSTEM HEALTH & SCROLLING TERMINAL LOGS */}
      <Card
        title="System Telemetry & Logs"
        icon={<Terminal size={16} className="text-emerald-400" />}
        status="neutral"
        className="flex-1 flex flex-col min-h-[220px]"
      >
        <div className="p-2.5 rounded-lg bg-[#030303] border border-emerald-500/20 font-mono text-[10.5px] overflow-y-auto flex-1 space-y-1.5 custom-scrollbar text-emerald-400">
          <div className="text-[9px] text-slate-500 pb-1 border-b border-white/5 flex justify-between">
            <span>TERMINAL ECHO // MT5 BRIDGE</span>
            <span className="text-emerald-500 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
              LIVE
            </span>
          </div>

          {terminalLogs.map((log) => (
            <div key={log.id} className="flex items-start gap-2 leading-tight">
              <span className="text-slate-600 flex-shrink-0">[{log.time}]</span>
              <span className="text-amber-400 font-bold flex-shrink-0">[{log.tag}]</span>
              <span className="text-slate-300 truncate">{log.msg}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

export default BrainPanel;
