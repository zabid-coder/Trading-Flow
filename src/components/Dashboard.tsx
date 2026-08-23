import React, { useMemo } from 'react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';
import {
  Activity,
  TrendingUp,
  ShieldAlert,
  Clock,
  DollarSign,
  Wifi,
  Zap,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { Card } from './ui/Card';
import type { EngineConfig, EngineState } from '../engine/types';
import type { Stats } from '../engine/engine';
import { fmtP, fmtUSD } from '../engine/types';

interface Props {
  st?: EngineState;
  cfg?: EngineConfig;
  stats?: Stats;
  onNavigateToTrades?: () => void;
  onNavigateToTerminal?: () => void;
  onOpenSettings?: () => void;
}

export const Dashboard: React.FC<Props> = ({
  st,
  cfg,
  stats,
  onNavigateToTrades,
  onNavigateToTerminal,
  onOpenSettings,
}) => {
  const currentEquity = st?.equity?.length
    ? st.equity[st.equity.length - 1]
    : cfg?.account || 10720.5;
  const initialEquity = cfg?.account || 10000;
  const netPnL = currentEquity - initialEquity;
  const netPnLPct = ((netPnL / initialEquity) * 100).toFixed(1);

  const marketRegime = st?.regime || 'STRONG_BULL';
  const connectionStatus = st?.liveStatus === 'connected' ? 'connected' : st?.feedMode === 'simulated' ? 'connected' : 'disconnected';
  const latency = st?.liveLatency || 24;

  // Build Equity Data for Recharts
  const equityData = useMemo(() => {
    if (st?.equity && st.equity.length > 1) {
      const step = Math.max(1, Math.floor(st.equity.length / 30));
      return st.equity
        .filter((_, i) => i % step === 0 || i === st.equity.length - 1)
        .map((eq, i) => ({
          time: `T-${(st.equity.length - i * step) * 15}m`,
          equity: Math.round(eq),
        }));
    }
    return [
      { time: '09:00', equity: 10000 },
      { time: '10:00', equity: 10150 },
      { time: '11:00', equity: 10080 },
      { time: '12:00', equity: 10350 },
      { time: '13:00', equity: 10290 },
      { time: '14:00', equity: 10580 },
      { time: '15:00', equity: 10720 },
    ];
  }, [st?.equity]);

  // Recent Signals / Closed & Open Trades
  const recentSignals = useMemo(() => {
    if (st?.trades && st.trades.length > 0) {
      return [...st.trades].reverse().slice(0, 5).map((t, idx) => ({
        id: t.id || idx + 1,
        pair: cfg?.activeSymbol || 'XAUUSD',
        type: t.side,
        entry: t.entry,
        current: t.exit || st.price,
        pnl: t.pnl !== undefined ? (t.pnl >= 0 ? `+$${t.pnl.toFixed(0)}` : `-$${Math.abs(t.pnl).toFixed(0)}`) : '$0',
        time: t.exitTime ? new Date(t.exitTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Live',
        status: t.open ? 'active' : 'closed',
      }));
    }
    return [
      { id: 1, pair: 'XAUUSD', type: 'BUY' as const, entry: 2034.50, current: 2038.20, pnl: '+$370', time: '14:32', status: 'active' },
      { id: 2, pair: 'XAUUSD', type: 'SELL' as const, entry: 2041.00, current: 2038.20, pnl: '+$280', time: '13:15', status: 'closed' },
      { id: 3, pair: 'XAUUSD', type: 'BUY' as const, entry: 2029.80, current: 2028.50, pnl: '-$130', time: '11:45', status: 'closed' },
    ];
  }, [st?.trades, st?.price, cfg?.activeSymbol]);

  const getRegimeColor = (regime: string) => {
    switch (regime) {
      case 'STRONG_BULL':
      case 'BULLISH_MOMENTUM':
        return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
      case 'STRONG_BEAR':
      case 'BEARISH_REVERSAL':
        return 'text-rose-400 bg-rose-400/10 border-rose-400/20';
      case 'NEWS_SPIKE':
      case 'VOLATILE_EXPANSION':
        return 'text-purple-400 bg-purple-400/10 border-purple-400/20';
      case 'LIQUIDITY_GRAB':
      case 'RANGING_CHOP':
      case 'RANGING':
        return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
      default:
        return 'text-slate-400 bg-slate-400/10 border-slate-400/20';
    }
  };

  const nextNewsEvent = st?.upcomingNews?.event || 'FOMC Meeting Minutes';
  const nextNewsTime = st?.upcomingNews?.timeUTC || 'Today at 18:00 UTC (High Impact)';

  return (
    <div className="min-h-screen p-4 md:p-8 animate-slide-up font-sans">
      {/* Header Section */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-blue-400 via-emerald-400 to-amber-300 bg-clip-text text-transparent">
            Trading Flow Pro
          </h1>
          <p className="text-slate-400 text-xs md:text-sm mt-1">
            Institutional Gold & Asset Intelligence Platform · Bloomberg Tier
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${
              connectionStatus === 'connected'
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
            }`}
          >
            <div
              className={`w-2 h-2 rounded-full ${
                connectionStatus === 'connected'
                  ? 'bg-emerald-400 animate-pulse-dot'
                  : 'bg-rose-400'
              }`}
            />
            {connectionStatus === 'connected' ? 'SYSTEM ONLINE' : 'DISCONNECTED'}
          </div>

          {onNavigateToTerminal && (
            <button
              onClick={onNavigateToTerminal}
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white rounded-lg text-xs md:text-sm font-semibold transition-all shadow-lg shadow-blue-900/20 flex items-center gap-1.5"
            >
              <span>📊 Live Terminal</span>
              <ArrowUpRight size={14} />
            </button>
          )}

          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs md:text-sm font-medium transition-colors"
            >
              Settings
            </button>
          )}
        </div>
      </header>

      {/* Top Stats Bento Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-6">
        <Card title="Total Equity" icon={<DollarSign size={18} />} status="active">
          <div className="text-2xl md:text-3xl font-bold text-white glow-text-green">
            {fmtUSD(currentEquity, false, 2)}
          </div>
          <div
            className={`text-xs md:text-sm mt-1 flex items-center gap-1 font-semibold ${
              netPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {netPnL >= 0 ? <TrendingUp size={14} /> : <ArrowDownRight size={14} />}
            <span>{netPnL >= 0 ? `+${netPnLPct}%` : `${netPnLPct}%`} overall</span>
          </div>
        </Card>

        <Card title="Market Regime" icon={<Activity size={18} />} status="warning">
          <div
            className={`inline-block px-3 py-1 rounded-md text-xs md:text-sm font-bold border ${getRegimeColor(
              marketRegime
            )}`}
          >
            {marketRegime.replace(/_/g, ' ')}
          </div>
          <div className="text-xs text-slate-400 mt-2">
            MTC Confluence:{' '}
            <span className="text-emerald-400 font-bold">
              {st?.mtcAlignment?.score || 85}%
            </span>
          </div>
        </Card>

        <Card title="Daily P&L" icon={<Zap size={18} />} status="active">
          <div
            className={`text-2xl md:text-3xl font-bold ${
              (stats?.netPnl || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {fmtUSD(stats?.netPnl || 0, true, 2)}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {stats?.closed?.length || 4} Trades Executed ({stats?.wins || 3}W / {stats?.losses || 1}L)
          </div>
        </Card>

        <Card title="Risk Exposure" icon={<ShieldAlert size={18} />} status="neutral">
          <div className="text-2xl md:text-3xl font-bold text-white">
            {cfg?.equityRiskPct || 1.2}%
          </div>
          <div className="text-xs text-slate-400 mt-1">
            Max Daily SL: {cfg?.maxDailySL || 2} hits ({st?.dailySL || 0} hit)
          </div>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Institutional Equity Curve Chart Section */}
        <div className="lg:col-span-2">
          <Card title="Institutional Equity Curve" className="h-[380px] md:h-[420px] flex flex-col">
            <div className="flex-1 w-full min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={equityData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis
                    dataKey="time"
                    stroke="#64748b"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="#64748b"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    domain={['auto', 'auto']}
                    tickFormatter={(v) => `$${v}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      borderColor: '#334155',
                      color: '#f8fafc',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    itemStyle={{ color: '#10b981', fontWeight: 'bold' }}
                    formatter={(value: any) => [`$${Number(value).toLocaleString()}`, 'Equity']}
                  />
                  <Area
                    type="monotone"
                    dataKey="equity"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#colorEquity)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        {/* Live Signals / Orders */}
        <div className="lg:col-span-1">
          <Card
            title="Active Signals & Orders"
            icon={<Clock size={18} />}
            className="h-[380px] md:h-[420px] flex flex-col"
          >
            <div className="overflow-y-auto pr-1 space-y-2.5 flex-1 custom-scrollbar">
              {recentSignals.map((signal) => (
                <div
                  key={signal.id}
                  className="p-3 rounded-lg bg-slate-800/60 border border-slate-700/80 hover:border-slate-500 transition-colors"
                >
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="font-bold text-white text-xs md:text-sm flex items-center gap-1.5">
                      {signal.pair}
                      {signal.status === 'active' && (
                        <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 text-[9px] font-black animate-pulse">
                          LIVE
                        </span>
                      )}
                    </span>
                    <span
                      className={`text-[10px] font-extrabold px-2 py-0.5 rounded ${
                        signal.type === 'BUY' || signal.type === 'LONG'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      }`}
                    >
                      {signal.type}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-400 mb-1 font-mono">
                    <span>Entry: {fmtP(signal.entry)}</span>
                    <span>Cur: {fmtP(signal.current)}</span>
                  </div>
                  <div className="flex justify-between items-center mt-2 pt-1.5 border-t border-slate-700/50">
                    <span className="text-[10px] text-slate-500">{signal.time}</span>
                    <span
                      className={`font-mono text-xs font-bold ${
                        signal.pnl.startsWith('+') ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {signal.pnl}
                    </span>
                  </div>
                </div>
              ))}

              {onNavigateToTrades && (
                <button
                  onClick={onNavigateToTrades}
                  className="w-full py-2 rounded bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 text-xs font-semibold border border-slate-700 transition-colors flex items-center justify-center gap-1"
                >
                  <span>View Complete Trades Journal</span>
                  <ArrowUpRight size={12} />
                </button>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Bottom Info Bento Bar */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        <Card title="System Health" status="active">
          <div className="flex items-center gap-3">
            <Wifi size={22} className="text-emerald-400" />
            <div>
              <div className="text-xs md:text-sm font-medium text-white">
                API Latency: {latency}ms
              </div>
              <div className="text-xs text-slate-400">
                {st?.feedMode === 'live' ? '⚡ Live WebSocket Stream Active' : 'Simulation Feed Synchronized'}
              </div>
            </div>
          </div>
        </Card>

        <Card title="Next Macro Event" status="warning">
          <div className="flex items-center gap-3">
            <AlertTriangle size={22} className="text-amber-400" />
            <div>
              <div className="text-xs md:text-sm font-medium text-white">
                {nextNewsEvent}
              </div>
              <div className="text-xs text-slate-400">{nextNewsTime}</div>
            </div>
          </div>
        </Card>

        <Card title="Strategy Status" status="active">
          <div className="flex items-center gap-3">
            <Zap size={22} className="text-blue-400" />
            <div>
              <div className="text-xs md:text-sm font-medium text-white">
                Institutional Gold Engine v4.2
              </div>
              <div className="text-xs text-slate-400">
                Asian Fakeout & DXY Filter: <span className="text-emerald-400 font-bold">ARMED</span>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
