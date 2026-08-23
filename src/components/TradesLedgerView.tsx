import React, { useMemo, useState } from "react";
import type { EngineConfig, EngineState, Trade } from "../engine/types";
import { fmtP, fmtUSD } from "../engine/types";
import { exportJournalCsv } from "../engine/storage";

interface Props {
  st: EngineState;
  cfg: EngineConfig;
}

export default function TradesLedgerView({ st, cfg }: Props) {
  const [symbolFilter, setSymbolFilter] = useState("ALL");
  const [strategyFilter, setStrategyFilter] = useState("ALL");
  const [directionFilter, setDirectionFilter] = useState("ALL");
  const [weekdayFilter, setWeekdayFilter] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [editingTradeId, setEditingTradeId] = useState<number | null>(null);
  const [noteInput, setNoteInput] = useState("");

  const allClosedTrades = useMemo(
    () => st.trades.filter((t) => !t.open && t.pnl !== undefined),
    [st.trades]
  );

  // Extract unique strategies for filter dropdown
  const uniqueStrategies = useMemo(() => {
    const set = new Set<string>();
    allClosedTrades.forEach((t) => set.add(t.setup));
    return Array.from(set);
  }, [allClosedTrades]);

  // Filtered trades computation
  const filteredTrades = useMemo(() => {
    return allClosedTrades.filter((t) => {
      if (symbolFilter !== "ALL" && (cfg.activeSymbol !== symbolFilter)) return false;
      if (strategyFilter !== "ALL" && t.setup !== strategyFilter) return false;
      if (directionFilter !== "ALL" && t.side !== directionFilter) return false;

      if (weekdayFilter !== "ALL") {
        const dayMap = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const tradeDay = dayMap[new Date(t.entryTime).getDay()];
        if (tradeDay !== weekdayFilter) return false;
      }

      if (fromDate) {
        const fromTs = new Date(fromDate).getTime();
        if (t.entryTime < fromTs) return false;
      }

      if (toDate) {
        const toTs = new Date(toDate).getTime() + 86400000;
        if (t.entryTime > toTs) return false;
      }

      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchesTicket = String(t.id).includes(term);
        const matchesSetup = t.setup.toLowerCase().includes(term);
        const matchesNotes = t.notes?.toLowerCase().includes(term);
        if (!matchesTicket && !matchesSetup && !matchesNotes) return false;
      }

      return true;
    });
  }, [
    allClosedTrades,
    symbolFilter,
    strategyFilter,
    directionFilter,
    weekdayFilter,
    fromDate,
    toDate,
    searchTerm,
    cfg.activeSymbol,
  ]);

  const clearFilters = () => {
    setSymbolFilter("ALL");
    setStrategyFilter("ALL");
    setDirectionFilter("ALL");
    setWeekdayFilter("ALL");
    setSearchTerm("");
    setFromDate("");
    setToDate("");
  };

  const handleSaveNote = (id: number) => {
    const trade = st.trades.find((t) => t.id === id);
    if (trade) {
      trade.notes = noteInput;
    }
    setEditingTradeId(null);
    setNoteInput("");
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4 custom-scrollbar text-gray-200">
      {/* Title & Controls Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-2 border-b border-[#1b263b]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-white tracking-tight font-sans">
              Trades Ledger
            </h1>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 font-mono">
              AUDITED LEDGER
            </span>
          </div>
          <p className="text-xs text-gray-400 font-mono mt-1">
            Trading Flow {cfg.activeSymbol} · {filteredTrades.length} of {allClosedTrades.length} Trades Listed
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => exportJournalCsv(filteredTrades)}
            className="px-3.5 py-1.5 rounded-lg bg-[#15233c] hover:bg-[#1d3052] border border-blue-500/40 text-blue-300 font-bold text-xs shadow-sm transition-all flex items-center gap-1.5 font-mono"
          >
            <span>📥</span>
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar (Replicating Image 3 Filter Strip) */}
      <div className="bg-[#0f172a] rounded-xl border border-[#1e293b] p-3 shadow-sm space-y-3 font-mono text-[11px]">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2.5 items-end">
          {/* From Date */}
          <div>
            <label className="text-[9px] font-bold text-gray-400 block mb-1 uppercase">FROM</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full bg-[#162033] border border-[#24334f] rounded-lg px-2 py-1.5 text-white focus:outline-none focus:border-blue-500 text-[11px]"
            />
          </div>

          {/* To Date */}
          <div>
            <label className="text-[9px] font-bold text-gray-400 block mb-1 uppercase">TO</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full bg-[#162033] border border-[#24334f] rounded-lg px-2 py-1.5 text-white focus:outline-none focus:border-blue-500 text-[11px]"
            />
          </div>

          {/* Symbol */}
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
              <option value="US30">US30</option>
              <option value="USTEC">USTEC</option>
            </select>
          </div>

          {/* Strategy */}
          <div>
            <label className="text-[9px] font-bold text-gray-400 block mb-1 uppercase">STRATEGY</label>
            <select
              value={strategyFilter}
              onChange={(e) => setStrategyFilter(e.target.value)}
              className="w-full bg-[#162033] border border-[#24334f] rounded-lg px-2 py-1.5 text-white focus:outline-none focus:border-blue-500 text-[11px]"
            >
              <option value="ALL">All Strategies</option>
              {uniqueStrategies.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Direction */}
          <div>
            <label className="text-[9px] font-bold text-gray-400 block mb-1 uppercase">DIRECTION</label>
            <select
              value={directionFilter}
              onChange={(e) => setDirectionFilter(e.target.value)}
              className="w-full bg-[#162033] border border-[#24334f] rounded-lg px-2 py-1.5 text-white focus:outline-none focus:border-blue-500 text-[11px]"
            >
              <option value="ALL">All Directions</option>
              <option value="LONG">LONG Only</option>
              <option value="SHORT">SHORT Only</option>
            </select>
          </div>

          {/* Weekday */}
          <div>
            <label className="text-[9px] font-bold text-gray-400 block mb-1 uppercase">WEEKDAY</label>
            <select
              value={weekdayFilter}
              onChange={(e) => setWeekdayFilter(e.target.value)}
              className="w-full bg-[#162033] border border-[#24334f] rounded-lg px-2 py-1.5 text-white focus:outline-none focus:border-blue-500 text-[11px]"
            >
              <option value="ALL">All Weekdays</option>
              <option value="Mon">Monday</option>
              <option value="Tue">Tuesday</option>
              <option value="Wed">Wednesday</option>
              <option value="Thu">Thursday</option>
              <option value="Fri">Friday</option>
            </select>
          </div>

          {/* Clear Filters Button */}
          <div className="flex gap-2">
            <button
              onClick={clearFilters}
              className="w-full py-1.5 px-3 rounded-lg bg-[#22334f] hover:bg-[#2b4164] text-gray-300 font-bold transition-all text-[11px]"
            >
              Clear Filters
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="pt-2 border-t border-[#1e293b] flex items-center gap-2">
          <span className="text-gray-400 text-xs">🔍</span>
          <input
            type="text"
            placeholder="Search by ticket #, setup name, or notes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 bg-[#162033] border border-[#24334f] rounded-lg px-3 py-1.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-xs"
          />
        </div>
      </div>

      {/* Structured Trades Data Table */}
      <div className="bg-[#0f172a] rounded-xl border border-[#1e293b] overflow-hidden shadow-sm">
        <div className="px-4 py-3 bg-[#131d33] border-b border-[#1e293b] flex items-center justify-between font-mono text-xs">
          <span className="font-bold text-white">
            1 – {filteredTrades.length} of {allClosedTrades.length} Trades Total
          </span>
          <span className="text-gray-400 text-[11px]">
            Execution Feed: MetaTrader 5 / Fast Bridge Synced
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-[11px]">
            <thead className="bg-[#090e18] text-gray-400 uppercase text-[9px] tracking-wider border-b border-[#1e293b]">
              <tr>
                <th className="py-2.5 px-3">TICKET #</th>
                <th className="py-2.5 px-3">SYMBOL</th>
                <th className="py-2.5 px-3">DIR</th>
                <th className="py-2.5 px-3 text-right">VOLUME</th>
                <th className="py-2.5 px-3">OPEN TIME (UTC)</th>
                <th className="py-2.5 px-3">CLOSE TIME (UTC)</th>
                <th className="py-2.5 px-3 text-right">OPEN PRICE</th>
                <th className="py-2.5 px-3 text-right">CLOSE PRICE</th>
                <th className="py-2.5 px-3 text-center">OUTCOME</th>
                <th className="py-2.5 px-3 text-right">R-MULT</th>
                <th className="py-2.5 px-3 text-right">NET PROFIT</th>
                <th className="py-2.5 px-3">STRATEGY / SETUP</th>
                <th className="py-2.5 px-3">NOTES / COMMENTS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#182338]">
              {filteredTrades.length === 0 ? (
                <tr>
                  <td colSpan={13} className="text-center py-12 text-gray-500 font-sans">
                    No trades match the current filter selection.
                  </td>
                </tr>
              ) : (
                filteredTrades.map((t) => {
                  const isWin = (t.pnl ?? 0) >= 0;
                  const openDate = new Date(t.entryTime);
                  const closeDate = t.exitTime ? new Date(t.exitTime) : null;
                  const ticket = `4070${String(t.id).padStart(6, "0")}`;

                  return (
                    <tr
                      key={t.id}
                      className="hover:bg-[#152035] transition-colors group text-gray-300"
                    >
                      <td className="py-2.5 px-3 font-semibold text-blue-400">{ticket}</td>
                      <td className="py-2.5 px-3 font-bold text-white">{cfg.activeSymbol}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[9.5px] font-black tracking-wider ${
                            t.side === "LONG"
                              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                              : "bg-rose-500/20 text-rose-400 border border-rose-500/40"
                          }`}
                        >
                          {t.side}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-gray-200">
                        {t.oz.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-gray-400 text-[10px]">
                        {openDate.toISOString().slice(5, 16).replace("T", " ")}
                      </td>
                      <td className="py-2.5 px-3 text-gray-400 text-[10px]">
                        {closeDate
                          ? closeDate.toISOString().slice(5, 16).replace("T", " ")
                          : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-right font-medium">{fmtP(t.entry)}</td>
                      <td className="py-2.5 px-3 text-right font-medium">
                        {t.exit ? fmtP(t.exit) : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`px-1.5 py-0.5 rounded font-extrabold text-[9px] ${
                            t.outcome === "TP"
                              ? "bg-emerald-500 text-black"
                              : "bg-rose-500 text-white"
                          }`}
                        >
                          {t.outcome || "CLOSED"}
                        </span>
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-bold ${
                          isWin ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {t.r ? `${t.r >= 0 ? "+" : ""}${t.r.toFixed(2)}R` : "—"}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-bold text-xs ${
                          isWin ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {fmtUSD(t.pnl ?? 0, true)}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-gray-300">
                        {t.setup}
                      </td>
                      <td className="py-2.5 px-3">
                        {editingTradeId === t.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={noteInput}
                              onChange={(e) => setNoteInput(e.target.value)}
                              className="bg-[#111928] border border-blue-500 rounded px-1.5 py-0.5 text-[10px] text-white w-32 focus:outline-none"
                              placeholder="Trade note..."
                              autoFocus
                            />
                            <button
                              onClick={() => handleSaveNote(t.id)}
                              className="px-1.5 py-0.5 rounded bg-blue-600 text-white text-[9px] font-bold"
                            >
                              ✓
                            </button>
                            <button
                              onClick={() => setEditingTradeId(null)}
                              className="px-1.5 py-0.5 rounded bg-gray-700 text-gray-300 text-[9px]"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <div
                            onClick={() => {
                              setEditingTradeId(t.id);
                              setNoteInput(t.notes || "");
                            }}
                            className="cursor-pointer text-gray-400 hover:text-blue-300 flex items-center gap-1 group/note"
                          >
                            <span>{t.notes || "Add note..."}</span>
                            <span className="opacity-0 group-hover/note:opacity-100 text-[9px]">✏️</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
