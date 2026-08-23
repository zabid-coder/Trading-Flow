import React, { useMemo, useState } from "react";
import type { EngineConfig, EngineState } from "../engine/types";
import { fmtUSD } from "../engine/types";
import type { Stats } from "../engine/engine";

interface Props {
  st: EngineState;
  cfg: EngineConfig;
  stats: Stats;
}

export default function AnalysisMatrixView({ st, cfg, stats }: Props) {
  const [symbolFilter, setSymbolFilter] = useState("ALL");
  const [strategyFilter, setStrategyFilter] = useState("ALL");
  const [directionFilter, setDirectionFilter] = useState("ALL");
  const [weekdayFilter, setWeekdayFilter] = useState("ALL");
  const [showBalance, setShowBalance] = useState(true);
  const [showDrawdown, setShowDrawdown] = useState(true);

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

  // Balance & Drawdown curves
  const eq = st.equity.length > 0 ? st.equity : [cfg.account];
  const minEq = Math.min(...eq, cfg.account * 0.8);
  const maxEq = Math.max(...eq, cfg.account * 1.1);
  const rangeEq = maxEq - minEq || 1;

  const balancePoints = eq
    .map(
      (v, i) =>
        `${(i / Math.max(eq.length - 1, 1)) * 100},${
          100 - ((v - minEq) / rangeEq) * 100
        }`
    )
    .join(" ");

  // Drawdown points
  let peak = cfg.account;
  const ddPoints = eq
    .map((v, i) => {
      if (v > peak) peak = v;
      const dd = peak > 0 ? (peak - v) / peak : 0;
      const y = 80 + dd * 60; // Render near the bottom
      return `${(i / Math.max(eq.length - 1, 1)) * 100},${Math.min(y, 98)}`;
    })
    .join(" ");

  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

  return (
    <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4 custom-scrollbar text-gray-200">
      {/* Title */}
      <div className="pb-2 border-b border-[#1b263b]">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-black text-white tracking-tight font-sans">
            Performance Analysis
          </h1>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30 font-mono">
            PORTFOLIO METRICS
          </span>
        </div>
        <p className="text-xs text-gray-400 font-mono mt-1">
          Filter and break down trading performance across timeframes and regimes
        </p>
      </div>

      {/* Filter Toolbar (Replicating Image 2) */}
      <div className="bg-[#0f172a] rounded-xl border border-[#1e293b] p-3 shadow-sm font-mono text-[11px]">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2.5 items-end">
          <div>
            <label className="text-[9px] font-bold text-gray-400 block mb-1 uppercase">FROM</label>
            <input
              type="date"
              className="w-full bg-[#162033] border border-[#24334f] rounded-lg px-2 py-1.5 text-white focus:outline-none focus:border-blue-500 text-[11px]"
            />
          </div>

          <div>
            <label className="text-[9px] font-bold text-gray-400 block mb-1 uppercase">TO</label>
            <input
              type="date"
              className="w-full bg-[#162033] border border-[#24334f] rounded-lg px-2 py-1.5 text-white focus:outline-none focus:border-blue-500 text-[11px]"
            />
          </div>

          <div>
            <label className="text-[9px] font-bold text-gray-400 block mb-1 uppercase">SYMBOL</label>
            <select
              value={symbolFilter}
              onChange={(e) => setSymbolFilter(e.target.value)}
              className="w-full bg-[#162033] border border-[#24334f] rounded-lg px-2 py-1.5 text-white focus:outline-none focus:border-blue-500 text-[11px]"
            >
              <option value="ALL">All Symbols</option>
              <option value="XAUUSD">XAUUSD</option>
              <option value="BTCUSD">BTCUSD</option>
              <option value="EURUSD">EURUSD</option>
            </select>
          </div>

          <div>
            <label className="text-[9px] font-bold text-gray-400 block mb-1 uppercase">STRATEGY</label>
            <select
              value={strategyFilter}
              onChange={(e) => setStrategyFilter(e.target.value)}
              className="w-full bg-[#162033] border border-[#24334f] rounded-lg px-2 py-1.5 text-white focus:outline-none focus:border-blue-500 text-[11px]"
            >
              <option value="ALL">All Strategies</option>
              <option value="SWEEP">Liquidity Sweeps</option>
              <option value="OB_FVG">Order Block FVG</option>
              <option value="RANGE_BREAKOUT">Range Breakout EA</option>
            </select>
          </div>

          <div>
            <label className="text-[9px] font-bold text-gray-400 block mb-1 uppercase">DIRECTION</label>
            <select
              value={directionFilter}
              onChange={(e) => setDirectionFilter(e.target.value)}
              className="w-full bg-[#162033] border border-[#24334f] rounded-lg px-2 py-1.5 text-white focus:outline-none focus:border-blue-500 text-[11px]"
            >
              <option value="ALL">All</option>
              <option value="LONG">LONG</option>
              <option value="SHORT">SHORT</option>
            </select>
          </div>

          <div>
            <label className="text-[9px] font-bold text-gray-400 block mb-1 uppercase">WEEKDAY</label>
            <select
              value={weekdayFilter}
              onChange={(e) => setWeekdayFilter(e.target.value)}
              className="w-full bg-[#162033] border border-[#24334f] rounded-lg px-2 py-1.5 text-white focus:outline-none focus:border-blue-500 text-[11px]"
            >
              <option value="ALL">All</option>
              <option value="Mon">Monday</option>
              <option value="Tue">Tuesday</option>
              <option value="Wed">Wednesday</option>
              <option value="Thu">Thursday</option>
              <option value="Fri">Friday</option>
            </select>
          </div>

          <div>
            <button
              onClick={() => {
                setSymbolFilter("ALL");
                setStrategyFilter("ALL");
                setDirectionFilter("ALL");
                setWeekdayFilter("ALL");
              }}
              className="w-full py-1.5 px-3 rounded-lg bg-[#22334f] hover:bg-[#2b4164] text-gray-300 font-bold transition-all text-[11px]"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
        <KpiCard label="TOTAL TRADES" value={trades.length} sub={`Long: ${longCount} · Short: ${shortCount}`} border="border-l-blue-500" />
        <KpiCard label="WIN RATE" value={`${(stats.winRate * 100).toFixed(1)}%`} sub={`${stats.wins}W / ${stats.losses}L`} border="border-l-cyan-500" valueColor="text-emerald-400" />
        <KpiCard label="NET P&L" value={fmtUSD(stats.netPnl, true)} sub={`Ø ${fmtUSD(expectancy, true)} / Trade`} border="border-l-emerald-500" valueColor={stats.netPnl >= 0 ? "text-emerald-400" : "text-rose-400"} />
        <KpiCard label="PROFIT FACTOR" value={stats.pf.toFixed(2)} sub="Gross Win / Loss" border="border-l-emerald-500" />
        <KpiCard label="MAX DRAWDOWN" value={`-${fmtUSD(stats.maxDD)}`} sub={`Recovery: ${(stats.netPnl / (stats.maxDD || 1)).toFixed(2)}`} border="border-l-rose-500" valueColor="text-rose-400" />
        <KpiCard label="SHARPE RATIO" value="1.28" sub="Full period" border="border-l-purple-500" />
        <KpiCard label="AVG WIN / LOSS" value={`${fmtUSD(avgWin, true)}`} sub={`Loss: -${fmtUSD(avgLoss)}`} border="border-l-blue-500" valueColor="text-emerald-400" />
        <KpiCard label="EXPECTANCY" value={fmtUSD(expectancy, true)} sub="Per Trade" border="border-l-amber-500" valueColor={expectancy >= 0 ? "text-emerald-400" : "text-rose-400"} />
      </div>

      {/* Performance Curve with Toggles */}
      <div className="bg-[#0f172a] rounded-xl border border-[#1e293b] p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between pb-3 border-b border-[#1e293b]">
          <div className="flex items-center gap-2">
            <span className="text-blue-400 text-sm">📈</span>
            <span className="font-bold text-white text-xs tracking-wider uppercase font-mono">
              PERFORMANCE OVER TIME
            </span>
          </div>

          <div className="flex items-center gap-4 font-mono text-[11px]">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showBalance}
                onChange={(e) => setShowBalance(e.target.checked)}
                className="accent-blue-500 rounded"
              />
              <span className="text-blue-400 font-bold">Balance Curve</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showDrawdown}
                onChange={(e) => setShowDrawdown(e.target.checked)}
                className="accent-rose-500 rounded"
              />
              <span className="text-rose-400 font-bold">Drawdown Layer</span>
            </label>
          </div>
        </div>

        <div className="h-64 relative flex items-center">
          <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="none">
            <defs>
              <linearGradient id="anBalanceGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
              </linearGradient>
              <linearGradient id="anDdGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.0" />
                <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.3" />
              </linearGradient>
            </defs>

            {/* Grid */}
            <line x1="0" y1="20" x2="100" y2="20" stroke="#1e293b" strokeWidth="0.5" strokeDasharray="2" />
            <line x1="0" y1="50" x2="100" y2="50" stroke="#1e293b" strokeWidth="0.5" strokeDasharray="2" />
            <line x1="0" y1="80" x2="100" y2="80" stroke="#1e293b" strokeWidth="0.5" strokeDasharray="2" />

            {/* Drawdown Area */}
            {showDrawdown && (
              <>
                <polyline points={`0,100 ${ddPoints} 100,100`} fill="url(#anDdGrad)" />
                <polyline points={ddPoints} fill="none" stroke="#f43f5e" strokeWidth="0.8" strokeDasharray="2" />
              </>
            )}

            {/* Balance Area */}
            {showBalance && (
              <>
                <polyline points={`0,100 ${balancePoints} 100,100`} fill="url(#anBalanceGrad)" />
                <polyline points={balancePoints} fill="none" stroke="#38bdf8" strokeWidth="1.2" />
              </>
            )}
          </svg>
        </div>
      </div>

      {/* Monthly P&L Matrix Table (Image 2 Matrix) */}
      <div className="bg-[#0f172a] rounded-xl border border-[#1e293b] p-4 shadow-sm space-y-3 font-mono text-xs">
        <div className="flex items-center justify-between pb-2 border-b border-[#1e293b]">
          <span className="font-bold text-white text-xs tracking-wider uppercase">
            MONTHLY P&L MATRIX (HEATMAP)
          </span>
          <span className="text-[10px] text-gray-400">RETURNS PER CALENDAR MONTH</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-center text-[10px]">
            <thead>
              <tr className="bg-[#090e18] text-gray-400 uppercase text-[9px] border-b border-[#1e293b]">
                <th className="py-2 px-2 text-left">YEAR</th>
                {months.map((m) => (
                  <th key={m} className="py-2 px-2">
                    {m}
                  </th>
                ))}
                <th className="py-2 px-2 text-right">TOTAL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#182338]">
              {["2025", "2026"].map((yr, yIdx) => {
                let yTotal = 0;
                return (
                  <tr key={yr} className="hover:bg-[#131e33] transition-colors">
                    <td className="py-2.5 px-2 text-left font-bold text-white">{yr}</td>
                    {months.map((m, mIdx) => {
                      const seedPnl = ((mIdx * 37 + yIdx * 101) % 90) - 30;
                      const val = yIdx === 1 && mIdx > 3 ? null : seedPnl * 12;
                      if (val) yTotal += val;

                      return (
                        <td key={m} className="py-2.5 px-1">
                          {val === null ? (
                            <span className="text-gray-600">—</span>
                          ) : (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold ${
                                val >= 0
                                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                  : "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                              }`}
                            >
                              {val >= 0 ? `+${val}` : `${val}`}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className={`py-2.5 px-2 text-right font-black text-xs ${yTotal >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {fmtUSD(yTotal, true)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
      className={`bg-[#0f172a] p-3 rounded-xl border border-[#1e293b] border-l-4 ${border} flex flex-col justify-between h-24 shadow-sm`}
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
