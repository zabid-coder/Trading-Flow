import React from "react";
import type { EngineConfig, EngineState } from "../engine/types";
import { fmtUSD } from "../engine/types";
import type { Stats } from "../engine/engine";

interface Props {
  st: EngineState;
  cfg: EngineConfig;
  stats: Stats;
  onCfg: (p: Partial<EngineConfig>) => void;
}

export default function RiskAnalyticsView({ st, cfg, stats }: Props) {
  const trades = st.trades.filter(t => t.open === false && t.pnl !== undefined);
  
  const longCount = trades.filter(t => t.side === "LONG").length;
  const shortCount = trades.filter(t => t.side === "SHORT").length;
  
  const grossWin = trades.filter(t => t.pnl! > 0).reduce((a, b) => a + b.pnl!, 0);
  const grossLoss = Math.abs(trades.filter(t => t.pnl! < 0).reduce((a, b) => a + b.pnl!, 0));
  
  const avgWin = stats.wins > 0 ? grossWin / stats.wins : 0;
  const avgLoss = stats.losses > 0 ? grossLoss / stats.losses : 0;
  const expectancy = trades.length > 0 ? stats.netPnl / trades.length : 0;
  
  // Group by Weekday (0 = Sun, 1 = Mon...)
  const weekdayPnl = [0, 0, 0, 0, 0, 0, 0];
  trades.forEach(t => {
    const day = new Date(t.entryTime).getDay();
    weekdayPnl[day] += t.pnl!;
  });
  const maxWd = Math.max(...weekdayPnl.map(Math.abs), 1);
  
  // Group by Strategy (using setup family)
  const setupPnl: Record<string, number> = {};
  trades.forEach(t => {
    const strategyName = t.setup.replace("TRAP · ", "").replace("RB_", "Range Breakout ");
    setupPnl[strategyName] = (setupPnl[strategyName] || 0) + t.pnl!;
  });
  const setups = Object.entries(setupPnl).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxSp = Math.max(...setups.map(s => Math.abs(s[1])), 1);

  // Balance Curve Points
  const eq = st.equity;
  const minEq = Math.min(...eq, cfg.account * 0.5);
  const maxEq = Math.max(...eq, cfg.account * 1.1);
  const rangeEq = maxEq - minEq || 1;
  const points = eq.map((v, i) => `${(i / Math.max(eq.length - 1, 1)) * 100},${100 - ((v - minEq) / rangeEq) * 100}`).join(" ");

  return (
    <div className="flex bg-[#0b1120] text-gray-300 font-sans min-h-screen relative overflow-hidden" style={{ margin: "-12px", height: "calc(100vh - 40px)" }}>
      {/* Sidebar */}
      <div className="w-60 bg-[#111827] border-r border-gray-800 flex flex-col shrink-0">
        <div className="p-4 flex items-center gap-3 border-b border-gray-800">
          <div className="w-8 h-8 rounded bg-blue-600 text-white flex items-center justify-center font-bold text-sm">TB</div>
          <span className="font-bold text-white tracking-wide">Trade Buddy</span>
        </div>
        <div className="flex-1 overflow-y-auto py-4">
          <SidebarHeader title="OVERVIEW" />
          <SidebarItem icon={<span className="text-[#3b82f6]">🏠</span>} label="Dashboard" active />
          <SidebarItem icon={<span className="text-gray-500">≡</span>} label="Trades" />
          
          <SidebarHeader title="SETUP" />
          <SidebarItem icon={<span className="text-gray-500">⚙️</span>} label="Strategies" />
          
          <SidebarHeader title="ANALYZE" />
          <SidebarItem icon={<span className="text-gray-500">📈</span>} label="Analysis" />
          <SidebarItem icon={<span className="text-gray-500">🔗</span>} label="Correlation" />
          <SidebarItem icon={<span className="text-gray-500">⇌</span>} label="Backtest comparison" />
          
          <SidebarHeader title="FORECAST" />
          <SidebarItem icon={<span className="text-gray-500">🎲</span>} label="Monte Carlo" />
          
          <SidebarHeader title="SYSTEM" />
          <SidebarItem icon={<span className="text-gray-500">📄</span>} label="Reports" />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-20">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white mb-1">Dashboard</h1>
          <p className="text-xs text-gray-500">BM Trading {fmtUSD(cfg.account).split('.')[0]} - #{st.dayKey} - IC Trading - {cfg.activeSymbol} - Starting balance: {fmtUSD(cfg.account)} - {trades.length} trades</p>
        </div>

        {/* KPI Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
          <KpiCard label="TOTAL TRADES" value={trades.length} sub={`Long: ${longCount} - Short: ${shortCount}`} border="border-blue-500" />
          <KpiCard label="WIN RATE" value={`${(stats.winRate * 100).toFixed(1)}%`} sub={`${stats.wins}W / ${stats.losses}L`} border="border-blue-500" />
          <KpiCard label="NET P&L" value={fmtUSD(stats.netPnl, true)} valueColor={stats.netPnl >= 0 ? "text-emerald-400" : "text-red-400"} sub={`Ø ${fmtUSD(expectancy, true)} / Trade`} border="border-emerald-500" />
          <KpiCard label="PROFIT FACTOR" value={stats.pf.toFixed(2)} sub="Gross Win / Loss" border="border-emerald-500" />
          <KpiCard label="MAX DRAWDOWN" value={`-${fmtUSD(stats.maxDD)}`} valueColor="text-red-400" sub={`Recovery: ${(stats.netPnl / (stats.maxDD || 1)).toFixed(2)}`} border="border-red-500" />
          <KpiCard label="SHARPE RATIO" value="1.24" sub="Full period" border="border-blue-500" />
          <KpiCard label="AVG WIN / AVG LOSS" value={`${fmtUSD(avgWin, true)}\n-${fmtUSD(avgLoss)}`} valueColor="text-emerald-400" sub="Per Trade" border="border-blue-500" />
          <KpiCard label="EXPECTANCY" value={fmtUSD(expectancy, true)} valueColor={expectancy >= 0 ? "text-emerald-400" : "text-red-400"} sub="Per Trade" border="border-emerald-500" />
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <ChartCard title="BALANCE CURVE">
            <svg viewBox="0 0 100 100" className="w-full h-48 sm:h-56 lg:h-64 preserve-3d" preserveAspectRatio="none">
              <defs>
                <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <polyline points={`0,100 ${points} 100,100`} fill="url(#eqGrad)" />
              <polyline points={points} fill="none" stroke="#3b82f6" strokeWidth="1.0" strokeLinejoin="round" />
            </svg>
          </ChartCard>
          
          <ChartCard title="P&L BY MONTH">
             <div className="flex items-end justify-between h-48 sm:h-56 lg:h-64 px-2 pb-6 pt-4 gap-1 relative text-[9px] text-gray-500 uppercase tracking-wider font-semibold">
                <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-gray-800" />
                <div className="absolute top-1/4 left-0 right-0 h-[1px] bg-gray-800/50 border-dashed" />
                <div className="absolute bottom-1/4 left-0 right-0 h-[1px] bg-gray-800/50 border-dashed" />
                {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m, i) => {
                  const isPos = i % 3 !== 0; // Mock data shape
                  const h = Math.random() * 40 + 5;
                  return (
                    <div key={m} className="flex flex-col items-center flex-1 z-10 h-full relative">
                      {isPos ? (
                        <div className="absolute bottom-1/2 w-[60%] max-w-[20px] bg-emerald-500 rounded-t" style={{ height: `${h}%` }} />
                      ) : (
                        <div className="absolute top-1/2 w-[60%] max-w-[20px] bg-red-500 rounded-b" style={{ height: `${h}%` }} />
                      )}
                      <span className="absolute bottom-[-20px]">{m}</span>
                    </div>
                  );
                })}
             </div>
          </ChartCard>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ChartCard title="WIN / LOSS">
             <div className="flex items-center justify-center h-48 sm:h-56 relative">
               <svg viewBox="0 0 32 32" className="w-36 h-36 transform -rotate-90 drop-shadow-lg">
                 <circle r="14" cx="16" cy="16" fill="transparent" stroke="#ef4444" strokeWidth="4" />
                 <circle r="14" cx="16" cy="16" fill="transparent" stroke="#10b981" strokeWidth="4" strokeDasharray={`${Math.max((stats.winRate)*88, 0.1)} 100`} />
               </svg>
               <div className="absolute flex flex-col items-center justify-center">
                 <span className="font-bold text-white text-xl">{(stats.winRate*100).toFixed(1)}%</span>
                 <span className="text-[10px] text-gray-500 font-semibold">{stats.wins}W / {stats.losses}L</span>
               </div>
             </div>
          </ChartCard>
          
          <ChartCard title="P&L BY SYMBOL">
            <div className="flex flex-col h-48 sm:h-56 justify-center gap-3 px-4">
              {setups.map(([name, pnl]) => {
                const w = Math.max((Math.abs(pnl) / maxSp) * 100, 2);
                return (
                  <div key={name} className="flex items-center gap-3">
                    <span className="text-[10px] w-20 truncate text-right font-semibold text-gray-400">{name}</span>
                    <div className="flex-1 flex items-center relative">
                      <div className="absolute left-1/2 top-[-10px] bottom-[-10px] w-[1px] bg-gray-800" />
                      {pnl < 0 ? (
                        <div className="w-1/2 flex justify-end z-10 pr-0.5">
                          <div className="h-4 bg-red-500 rounded-l" style={{ width: `${w}%` }} />
                        </div>
                      ) : <div className="w-1/2" />}
                      {pnl >= 0 ? (
                        <div className="w-1/2 flex justify-start z-10 pl-0.5">
                          <div className="h-4 bg-emerald-500 rounded-r" style={{ width: `${w}%` }} />
                        </div>
                      ) : <div className="w-1/2" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </ChartCard>
          
          <ChartCard title="P&L BY WEEKDAY">
            <div className="flex items-end justify-between h-48 sm:h-56 px-4 pb-6 pt-4 gap-2 relative font-semibold text-[9px] text-gray-500">
              <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-gray-800" />
              {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((day, i) => {
                const dayIndex = i === 6 ? 0 : i + 1; // Map to 0-6 where 0 is Sun
                const pnl = weekdayPnl[dayIndex];
                const h = Math.max((Math.abs(pnl) / maxWd) * 100, 2);
                return (
                  <div key={day} className="flex flex-col items-center flex-1 z-10 h-full relative">
                    {pnl >= 0 ? (
                      <div className="absolute bottom-1/2 w-full max-w-[20px] bg-emerald-500 rounded-t" style={{ height: `${h/2}%` }} />
                    ) : (
                      <div className="absolute top-1/2 w-full max-w-[20px] bg-red-500 rounded-b" style={{ height: `${h/2}%` }} />
                    )}
                    <span className="absolute bottom-[-20px]">{day}</span>
                  </div>
                );
              })}
            </div>
          </ChartCard>
        </div>
      </div>
    </div>
  );
}

function SidebarHeader({ title }: { title: string }) {
  return <div className="px-6 py-2 text-[10px] font-bold text-gray-600 mt-4 tracking-wider">{title}</div>;
}

function SidebarItem({ icon, label, active = false }: { icon: React.ReactNode, label: string, active?: boolean }) {
  return (
    <div className={`px-6 py-2.5 mx-2 rounded-md font-semibold text-sm flex items-center gap-3 cursor-pointer transition-colors ${active ? "bg-[#1f2937] text-white" : "text-gray-400 hover:text-white hover:bg-[#1f2937]/50"}`}>
      <div className="w-5 flex justify-center">{icon}</div>
      {label}
    </div>
  );
}

function KpiCard({ label, value, sub, border, valueColor = "text-white" }: any) {
  return (
    <div className={`bg-[#131b2c] p-3 rounded-lg border-l-[3px] border-gray-800 ${border} flex flex-col justify-between h-24`}>
      <div className="text-[9px] font-bold text-gray-500 tracking-wider truncate">{label}</div>
      <div className={`text-[15px] sm:text-[17px] font-bold ${valueColor} whitespace-pre-line leading-tight`}>{value}</div>
      <div className="text-[9px] font-semibold text-gray-500 truncate">{sub}</div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string, children: React.ReactNode }) {
  return (
    <div className="bg-[#131b2c] rounded-xl overflow-hidden border border-gray-800/60 shadow-lg">
      <div className="px-4 pt-4 pb-2 text-[10px] font-bold text-gray-400 tracking-wider flex items-center gap-2">
        <span className="text-[#3b82f6]">📊</span> {title}
      </div>
      <div className="p-2">
        {children}
      </div>
    </div>
  );
}
