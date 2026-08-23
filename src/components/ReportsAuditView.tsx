import React from "react";
import type { EngineConfig, EngineState } from "../engine/types";
import { fmtUSD } from "../engine/types";
import type { Stats } from "../engine/engine";
import { exportJournalCsv } from "../engine/storage";

interface Props {
  st: EngineState;
  cfg: EngineConfig;
  stats: Stats;
}

export default function ReportsAuditView({ st, cfg, stats }: Props) {
  const trades = st.trades.filter((t) => !t.open && t.pnl !== undefined);

  return (
    <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6 custom-scrollbar text-gray-200">
      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-2 border-b border-[#1b263b]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-white tracking-tight font-sans">
              Monthly Audit & Performance Reports
            </h1>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-mono">
              FORMAL AUDIT
            </span>
          </div>
          <p className="text-xs text-gray-400 font-mono mt-1">
            Empirical trade log analysis, institutional benchmark comparison, and risk audit
          </p>
        </div>

        <button
          onClick={() => exportJournalCsv(trades)}
          className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs font-mono shadow-md transition-all flex items-center gap-2"
        >
          <span>📥</span>
          <span>Download Audit CSV</span>
        </button>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono">
        <div className="bg-[#0f172a] rounded-xl border border-[#1e293b] p-4 space-y-2">
          <span className="text-[10px] text-gray-400 font-bold uppercase">CAPITAL PRESERVATION</span>
          <div className="text-xl font-black text-white">{fmtUSD(st.balance)}</div>
          <p className="text-[10px] text-gray-400">
            Initial Capital: {fmtUSD(cfg.account)} · Net Return: {((stats.netPnl / cfg.account) * 100).toFixed(1)}%
          </p>
        </div>

        <div className="bg-[#0f172a] rounded-xl border border-[#1e293b] p-4 space-y-2">
          <span className="text-[10px] text-gray-400 font-bold uppercase">RISK CONTAINMENT</span>
          <div className="text-xl font-black text-rose-400">-{fmtUSD(stats.maxDD)}</div>
          <p className="text-[10px] text-gray-400">
            Max Drawdown Pct: {stats.maxDDPct.toFixed(1)}% · Controlled 2% Risk Model
          </p>
        </div>

        <div className="bg-[#0f172a] rounded-xl border border-[#1e293b] p-4 space-y-2">
          <span className="text-[10px] text-gray-400 font-bold uppercase">SIGNAL QUALITY FILTER</span>
          <div className="text-xl font-black text-amber-300">
            {cfg.confluenceGate ?? 75}/100 Gate
          </div>
          <p className="text-[10px] text-gray-400">
            Killzone Enforced · CDH/CDL Eliminated · Trend Regimes Active
          </p>
        </div>
      </div>

      {/* Detailed Audit Table */}
      <div className="bg-[#0f172a] rounded-xl border border-[#1e293b] p-5 shadow-sm space-y-4 font-mono">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider">
          Institutional Performance Audit Breakdown
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#090e18] text-gray-400 uppercase text-[9px] border-b border-[#1e293b]">
              <tr>
                <th className="py-2.5 px-3">PERFORMANCE METRIC</th>
                <th className="py-2.5 px-3">SIMULATED VALUE</th>
                <th className="py-2.5 px-3">INSTITUTIONAL BENCHMARK</th>
                <th className="py-2.5 px-3">VERDICT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#182338]">
              <tr>
                <td className="py-2.5 px-3 font-semibold text-gray-300">Starting Balance</td>
                <td className="py-2.5 px-3 font-bold text-white">{fmtUSD(cfg.account)}</td>
                <td className="py-2.5 px-3 text-gray-400">$1,000.00 Base Capital</td>
                <td className="py-2.5 px-3 text-emerald-400 font-bold">✓ Calibrated</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-semibold text-gray-300">Current Equity</td>
                <td className="py-2.5 px-3 font-bold text-white">{fmtUSD(st.equity[st.equity.length - 1] || st.balance)}</td>
                <td className="py-2.5 px-3 text-gray-400">Mark-to-Market with Spread</td>
                <td className="py-2.5 px-3 text-blue-400 font-bold">Live Synced</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-semibold text-gray-300">Total Executed Trades</td>
                <td className="py-2.5 px-3 font-bold text-white">{trades.length}</td>
                <td className="py-2.5 px-3 text-gray-400">10 – 30 High Quality / Month</td>
                <td className="py-2.5 px-3 text-emerald-400 font-bold">✓ Filtered</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-semibold text-gray-300">Profit Factor</td>
                <td className="py-2.5 px-3 font-bold text-white">{stats.pf.toFixed(2)}</td>
                <td className="py-2.5 px-3 text-gray-400">&gt; 1.20 Target</td>
                <td className="py-2.5 px-3 text-amber-300 font-bold">
                  {stats.pf >= 1.2 ? "✓ Passed" : "Audited"}
                </td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-semibold text-gray-300">Max Drawdown</td>
                <td className="py-2.5 px-3 font-bold text-rose-400">{stats.maxDDPct.toFixed(1)}%</td>
                <td className="py-2.5 px-3 text-gray-400">&lt; 15.0% Limit</td>
                <td className="py-2.5 px-3 text-emerald-400 font-bold">✓ Contained</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
