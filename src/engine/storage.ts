// src/engine/storage.ts — Persistent Trade Journal & Metric Exporter
import { Trade } from "./types";

const JOURNAL_STORAGE_KEY = "tf_trade_journal_v1";
const NOTES_STORAGE_KEY = "tf_trade_notes_v1";

export function loadJournalTrades(): Trade[] {
  try {
    const raw = localStorage.getItem(JOURNAL_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn("Failed to load journal trades from localStorage:", e);
  }
  return [];
}

export function saveJournalTrades(trades: Trade[]) {
  try {
    localStorage.setItem(JOURNAL_STORAGE_KEY, JSON.stringify(trades.slice(-500)));
  } catch (e) {
    console.warn("Failed to save journal trades to localStorage:", e);
  }
}

export function loadTradeNotes(): Record<string, string> {
  try {
    const raw = localStorage.getItem(NOTES_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn("Failed to load trade notes:", e);
  }
  return {};
}

export function saveTradeNote(tradeId: number | string, note: string) {
  try {
    const notes = loadTradeNotes();
    notes[String(tradeId)] = note;
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
  } catch (e) {
    console.warn("Failed to save trade note:", e);
  }
}

/**
 * Export trade history to standard CSV file for Excel / TradingView journaling
 */
export function exportJournalToCsv(trades: Trade[], symbol: string) {
  const notes = loadTradeNotes();
  const headers = [
    "ID",
    "Timestamp",
    "Symbol",
    "Side",
    "Setup",
    "Family",
    "Entry Price",
    "Exit Price",
    "Stop Loss",
    "Take Profit",
    "Volume (oz/units)",
    "Risk ($)",
    "P&L ($)",
    "R-Multiple",
    "Outcome",
    "Trader Notes",
  ];

  const rows = trades.map((t) => [
    t.id,
    new Date(t.entryTime || Date.now()).toISOString(),
    symbol,
    t.side,
    `"${t.setup || ""}"`,
    t.family || "",
    t.entry.toFixed(4),
    (t.exit ?? t.entry).toFixed(4),
    t.sl.toFixed(4),
    t.tp.toFixed(4),
    t.oz.toFixed(2),
    t.risk.toFixed(2),
    (t.pnl ?? 0).toFixed(2),
    (t.r ?? 0).toFixed(2),
    t.outcome || (t.open ? "OPEN" : "CLOSED"),
    `"${(notes[String(t.id)] || "").replace(/"/g, '""')}"`,
  ]);

  const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `trading_flow_journal_${symbol}_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
