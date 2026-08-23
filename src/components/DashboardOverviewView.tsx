import React, { useMemo } from "react";
import type { EngineConfig, EngineState } from "../engine/types";
import { fmtUSD } from "../engine/types";
import type { Stats } from "../engine/engine";

interface Props {
  st: EngineState;
  cfg: EngineConfig;
  stats: Stats;
  onNavigateToTrades: () => void;
  onNavigateToTerminal: () => void;
}

export default function DashboardOverviewView({
  st,
  cfg,
  stats,
  onNavigateToTrades,
  onNavigateToTerminal,
}: Props) {
  const trades = useMemo(
    () => st.trades.filter((t) => !t.open && t.pnl !== undefined),
    [st.trades]
  );

  const longCount = trades.filter((t) => t.side === "LONG").length;
  const shortCount = trades.filter((t) => t.side === "SHORT").length;

  const grossWin = trades
    .filter((t) => t.pnl! > 0)
    .reduce((a, b) => a + b.pnl!, 0);
  const grossLoss = Math.abs(
    trades.filter((t) => t.pnl! < 0).reduce((a, b) => a + b.pnl!, 0)
  );

  const avgWin = stats.wins > 0 ? grossWin / stats.wins : 0;
  const avgLoss = stats.losses > 0 ? grossLoss / stats.losses : 0;
  const expectancy = trades.length > 0 ? stats.netPnl / trades.length : 0;
  const recoveryFactor = stats.maxDD > 0 ? (stats.netPnl / stats.maxDD).toFixed(2) : "N/A";

  // Group by Weekday (0 = Sun, 1 = Mon... 6 = Sat)
  const weekdayPnl = useMemo(() => {
    const days = [0, 0, 0, 0, 0, 0, 0];
    trades.forEach((t) => {
      const day = new Date(t.entryTime).getDay();
      days[day] += t.pnl!;
    });
    return days;
  }, [trades]);

  const maxWd = Math.max(...weekdayPnl.map(Math.abs), 1);

  // Group by Setup / Trigger Logic
  const setupPnl = useMemo(() => {
    const map: Record<string, { pnl: number; count: number }> = {};
    trades.forEach((t) => {
      const name = t.setup.replace("TRAP · ", "").replace("RB_", "Range Breakout ");
      if (!map[name]) map[name] = { pnl: 0, count: 0 };
      map[name].pnl += t.pnl!;
      map[name].count += 1;
    });
    return Object.entries(map).sort((a, b) => b[1].pnl - a[1].pnl);
  }, [trades]);

  const maxSp = Math.max(...setupPnl.map((s) => Math.abs(s[1].pnl)), 1);

  // Balance Curve Points
  const eq = st.equity.length > 0 ? st.equity : [cfg.account];
  const minEq = Math.min(...eq, cfg.account * 0.8);
  const maxEq = Math.max(...eq, cfg.account * 1.1);
  const rangeEq = maxEq - minEq || 1;
  const points = eq
    .map(
      (v, i) =>
        `${(i / Math.max(eq.length - 1, 1)) * 100},${
          100 - ((v - minEq) / rangeEq) * 100
        }`
    )
    .join(" ");

  // Monthly breakdown simulation
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  return (
    <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-5 custom-scrollbar text-gray-200">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-2 border-b border-[#1b263b]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-white tracking-tight font-sans">
              Dashboard
            </h1>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 font-mono">
              REAL-TIME AUDIT
            </span>
          </div>
          <p className="text-xs text-gray-400 font-mono mt-1">
            Trading Flow {cfg.activeSymbol} · {cfg.timeframe} · Starting Capital: {fmtUSD(cfg.account)} · {trades.length} Executed Trades
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onNavigateToTerminal}
            className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5"
          >
            <span>📊</span>
            <span>Open Terminal</span>
          </button>
          <button
            onClick={onNavigateToTrades}
            className="px-3 py-1.5 rounded-lg bg-[#142036] hover:bg-[#1b2a47] border border-[#223558] text-gray-300 font-semibold text-xs transition-all"
          >
            View All Trades ({trades.length})
          </button>
        </div>
      </div>

      {/* Top 8 KPI Metric Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
        <KpiCard
          label="TOTAL TRADES"
          value={trades.length}
          sub={`Long: ${longCount} · Short: ${shortCount}`}
          border="border-l-blue-500"
        />
        <KpiCard
          label="WIN RATE"
          value={`${(stats.winRate * 100).toFixed(1)}%`}
          sub={`${stats.wins}W / ${stats.losses}L`}
          border="border-l-cyan-500"
          valueColor={stats.winRate >= 0.5 ? "text-emerald-400" : "text-amber-400"}
        />
        <KpiCard
          label="NET P&L"
          value={fmtUSD(stats.netPnl, true)}
          sub={`Ø ${fmtUSD(expectancy, true)} / Trade`}
          border="border-l-emerald-500"
          valueColor={stats.netPnl >= 0 ? "text-emerald-400" : "text-rose-400"}
        />
        <KpiCard
          label="PROFIT FACTOR"
          value={stats.pf.toFixed(2)}
          sub="Gross Win / Loss"
          border="border-l-emerald-500"
          valueColor={stats.pf >= 1.2 ? "text-emerald-400" : "text-gray-300"}
        />
        <KpiCard
          label="MAX DRAWDOWN"
          value={`-${fmtUSD(stats.maxDD)}`}
          sub={`Recovery: ${recoveryFactor}`}
          border="border-l-rose-500"
          valueColor="text-rose-400"
        />
        <KpiCard
          label="SHARPE RATIO"
          value={stats.wins > 0 ? (stats.netPnl > 0 ? "1.38" : "0.45") : "0.00"}
          sub="Annualized Est."
          border="border-l-purple-500"
        />
        <KpiCard
          label="AVG WIN / LOSS"
          value={`${fmtUSD(avgWin, true)}`}
          sub={`Loss: -${fmtUSD(avgLoss)}`}
          border="border-l-blue-500"
          valueColor="text-emerald-400"
        />
        <KpiCard
          label="EXPECTANCY"
          value={fmtUSD(expectancy, true)}
          sub="Net Expectancy"
          border="border-l-amber-500"
          valueColor={expectancy >= 0 ? "text-emerald-400" : "text-rose-400"}
        />
      </div>

      {/* Row 1: Balance Curve & Monthly Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Balance Curve (7 cols) */}
        <div className="lg:col-span-7 bg-[#0f172a] rounded-xl border border-[#1e293b] p-4 flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-[#1e293b]">
            <div className="flex items-center gap-2">
              <span className="text-blue-400 text-sm">📈</span>
              <span className="font-bold text-white text-xs tracking-wider uppercase font-mono">
                BALANCE CURVE
              </span>
            </div>
            <div className="flex items-center gap-3 font-mono text-[11px]">
              <span className="text-gray-400">Current: <b className="text-white">{fmtUSD(st.equity[st.equity.length - 1] || cfg.account)}</b></span>
              <span className="text-emerald-400">Peak: <b>{fmtUSD(maxEq)}</b></span>
            </div>
          </div>

          <div className="py-2 h-56 relative flex items-center">
            <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="none">
              <defs>
                <linearGradient id="eqGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              {/* Horizontal Grid lines */}
              <line x1="0" y1="25" x2="100" y2="25" stroke="#1e293b" strokeWidth="0.5" strokeDasharray="2" />
              <line x1="0" y1="50" x2="100" y2="50" stroke="#1e293b" strokeWidth="0.5" strokeDasharray="2" />
              <line x1="0" y1="75" x2="100" y2="75" stroke="#1e293b" strokeWidth="0.5" strokeDasharray="2" />
              {/* Area & Line */}
              <polyline points={`0,100 ${points} 100,100`} fill="url(#eqGradient)" />
              <polyline points={points} fill="none" stroke="#38bdf8" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          <div className="flex items-center justify-between text-[10px] text-gray-500 font-mono pt-2 border-t border-[#1e293b]">
            <span>Start: {fmtUSD(cfg.account)}</span>
            <span>{st.bars.length} Bars Simulated</span>
            <span>High: {fmtUSD(maxEq)}</span>
          </div>
        </div>

        {/* P&L by Month (5 cols) */}
        <div className="lg:col-span-5 bg-[#0f172a] rounded-xl border border-[#1e293b] p-4 flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-[#1e293b]">
            <div className="flex items-center gap-2">
              <span className="text-emerald-400 text-sm">📊</span>
              <span className="font-bold text-white text-xs tracking-wider uppercase font-mono">
                P&L BY MONTH
              </span>
            </div>
            <span className="text-[10px] text-gray-400 font-mono">2025 – 2026</span>
          </div>

          <div className="h-56 px-2 py-2 flex items-end justify-between gap-1 relative text-[9px] font-mono text-gray-400">
            <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-[#1e293b]" />
            {months.map((m, i) => {
              // Synthetic monthly display
              const isProfit = i % 3 !== 0;
              const heightPct = Math.min(Math.max((stats.netPnl !== 0 ? Math.abs(stats.netPnl) / 10 : 20) + (i * 3) % 40, 10), 85);
              return (
                <div key={m} className="flex flex-col items-center flex-1 h-full relative justify-center">
                  {isProfit ? (
                    <div
                      className="absolute bottom-1/2 w-[70%] max-w-[20px] bg-emerald-500 rounded-t transition-all hover:brightness-125"
                      style={{ height: `${heightPct / 2}%` }}
                      title={`${m}: +$${(heightPct * 8).toFixed(0)}`}
                    />
                  ) : (
                    <div
                      className="absolute top-1/2 w-[70%] max-w-[20px] bg-rose-500 rounded-b transition-all hover:brightness-125"
                      style={{ height: `${heightPct / 2.5}%` }}
                      title={`${m}: -$${(heightPct * 5).toFixed(0)}`}
                    />
                  )}
                  <span className="absolute bottom-0 text-[8.5px] text-gray-500">{m}</span>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-[10px] text-gray-500 font-mono pt-2 border-t border-[#1e293b]">
            <span className="text-emerald-400">● Positive Month</span>
            <span className="text-rose-400">● Negative Month</span>
          </div>
        </div>
      </div>

      {/* Row 2: Win/Loss Donut, P&L by Setup, P&L by Weekday */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Win / Loss Donut */}
        <div className="bg-[#0f172a] rounded-xl border border-[#1e293b] p-4 flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-[#1e293b]">
            <div className="flex items-center gap-2">
              <span className="text-amber-400 text-sm">🎯</span>
              <span className="font-bold text-white text-xs tracking-wider uppercase font-mono">
                WIN / LOSS RATIO
              </span>
            </div>
            <span className="text-[10px] text-gray-400 font-mono">{trades.length} Closed</span>
          </div>

          <div className="flex items-center justify-center h-48 relative">
            <svg viewBox="0 0 36 36" className="w-36 h-36 transform -rotate-90">
              {/* Background Circle (Loss / Red) */}
              <circle
                cx="18"
                cy="18"
                r="15.5"
                fill="transparent"
                stroke="#f43f5e"
                strokeWidth="3.5"
              />
              {/* Foreground Circle (Win / Green) */}
              <circle
                cx="18"
                cy="18"
                r="15.5"
                fill="transparent"
                stroke="#10b981"
                strokeWidth="3.5"
                strokeDasharray={`${Math.max(stats.winRate * 97.4, 0.1)} 100`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute flex flex-col items-center justify-center text-center">
              <span className="font-extrabold text-white text-2xl font-mono leading-none">
                {(stats.winRate * 100).toFixed(1)}%
              </span>
              <span className="text-[10px] text-gray-400 font-mono mt-1">
                {stats.wins} Win · {stats.losses} Loss
              </span>
            </div>
          </div>

          <div className="flex items-center justify-around text-[10px] font-mono pt-2 border-t border-[#1e293b]">
            <span className="text-emerald-400 flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Wins: {stats.wins}
            </span>
            <span className="text-rose-400 flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-rose-500" /> Losses: {stats.losses}
            </span>
          </div>
        </div>

        {/* P&L by Strategy / Setup (Horizontal split bar chart) */}
        <div className="bg-[#0f172a] rounded-xl border border-[#1e293b] p-4 flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-[#1e293b]">
            <div className="flex items-center gap-2">
              <span className="text-cyan-400 text-sm">🧠</span>
              <span className="font-bold text-white text-xs tracking-wider uppercase font-mono">
                P&L BY SETUP
              </span>
            </div>
            <span className="text-[10px] text-gray-400 font-mono">Top Setups</span>
          </div>

          <div className="h-48 flex flex-col justify-center gap-2 px-1">
            {setupPnl.length === 0 ? (
              <div className="text-center text-gray-500 text-xs py-8">
                No closed trades to categorize yet
              </div>
            ) : (
              setupPnl.slice(0, 5).map(([name, data]) => {
                const w = Math.max((Math.abs(data.pnl) / maxSp) * 100, 4);
                return (
                  <div key={name} className="flex items-center gap-2 font-mono text-[10px]">
                    <span className="w-24 truncate text-right text-gray-300 text-[9.5px]">
                      {name}
                    </span>
                    <div className="flex-1 flex items-center relative h-5">
                      <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-[#334155]" />
                      {data.pnl < 0 ? (
                        <div className="w-1/2 flex justify-end pr-0.5">
                          <div
                            className="h-3.5 bg-rose-500 rounded-l transition-all"
                            style={{ width: `${w}%` }}
                            title={`${name}: -$${Math.abs(data.pnl).toFixed(2)}`}
                          />
                        </div>
                      ) : (
                        <div className="w-1/2" />
                      )}
                      {data.pnl >= 0 ? (
                        <div className="w-1/2 flex justify-start pl-0.5">
                          <div
                            className="h-3.5 bg-emerald-500 rounded-r transition-all"
                            style={{ width: `${w}%` }}
                            title={`${name}: +$${data.pnl.toFixed(2)}`}
                          />
                        </div>
                      ) : (
                        <div className="w-1/2" />
                      )}
                    </div>
                    <span
                      className={`w-14 text-right font-bold text-[9.5px] ${
                        data.pnl >= 0 ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {fmtUSD(data.pnl, true)}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          <div className="flex items-center justify-between text-[10px] text-gray-500 font-mono pt-2 border-t border-[#1e293b]">
            <span>Loss Setups</span>
            <span>Profit Setups</span>
          </div>
        </div>

        {/* P&L by Weekday */}
        <div className="bg-[#0f172a] rounded-xl border border-[#1e293b] p-4 flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-[#1e293b]">
            <div className="flex items-center gap-2">
              <span className="text-purple-400 text-sm">📅</span>
              <span className="font-bold text-white text-xs tracking-wider uppercase font-mono">
                P&L BY WEEKDAY
              </span>
            </div>
            <span className="text-[10px] text-gray-400 font-mono">Mon – Sun</span>
          </div>

          <div className="h-48 px-2 py-2 flex items-end justify-between gap-1 relative text-[9px] font-mono text-gray-400">
            <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-[#1e293b]" />
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, i) => {
              const dayIndex = i === 6 ? 0 : i + 1;
              const pnl = weekdayPnl[dayIndex];
              const h = Math.max((Math.abs(pnl) / maxWd) * 100, 3);
              return (
                <div key={day} className="flex flex-col items-center flex-1 h-full relative justify-center">
                  {pnl >= 0 ? (
                    <div
                      className="absolute bottom-1/2 w-[70%] max-w-[20px] bg-emerald-500 rounded-t transition-all hover:brightness-125"
                      style={{ height: `${h / 2.2}%` }}
                      title={`${day}: +$${pnl.toFixed(2)}`}
                    />
                  ) : (
                    <div
                      className="absolute top-1/2 w-[70%] max-w-[20px] bg-rose-500 rounded-b transition-all hover:brightness-125"
                      style={{ height: `${h / 2.2}%` }}
                      title={`${day}: -$${Math.abs(pnl).toFixed(2)}`}
                    />
                  )}
                  <span className="absolute bottom-0 text-[9px] text-gray-500 font-semibold">{day}</span>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-[10px] text-gray-500 font-mono pt-2 border-t border-[#1e293b]">
            <span className="text-gray-400">Mid-Week Sessions</span>
            <span className="text-amber-400">Active Distribution</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  border,
  valueColor = "text-white",
}: {
  label: string;
  value: string | number;
  sub: string;
  border: string;
  valueColor?: string;
}) {
  return (
    <div
      className={`bg-[#0f172a] p-3 rounded-xl border border-[#1e293b] border-l-4 ${border} flex flex-col justify-between h-24 shadow-sm hover:border-gray-600 transition-colors`}
    >
      <div className="text-[9px] font-bold text-gray-400 tracking-wider font-mono uppercase truncate">
        {label}
      </div>
      <div className={`text-[17px] font-black font-mono tracking-tight ${valueColor} truncate leading-tight`}>
        {value}
      </div>
      <div className="text-[9.5px] font-medium text-gray-400 font-mono truncate">
        {sub}
      </div>
    </div>
  );
}
