// src/engine/storage.ts — Persistent Trade Journal, Execution Event Logger & CSV Exporter
import { EngineEvent, Trade } from "./types";

export interface RecordedTrade extends Trade {
  mode?: "LIVE" | "DEMO";
  symbol?: string;
  entryDateFormatted?: string;
  exitDateFormatted?: string;
  timestamp?: number;
}

export interface RecordedEvent extends EngineEvent {
  mode?: "LIVE" | "DEMO";
  dateFormatted?: string;
}

// Keep legacy storage untouched; it must not contaminate this strategy's metrics.
const TRADES_STORAGE_KEY = "safe_scalper_paper_trades_v1";
const EVENTS_STORAGE_KEY = "safe_scalper_events_v1";
const NOTES_STORAGE_KEY = "safe_scalper_notes_v1";

/**
 * Load all permanently recorded trades across all past live & demo sessions
 */
export function loadAllJournalTrades(): RecordedTrade[] {
  try {
    const raw = localStorage.getItem(TRADES_STORAGE_KEY);
    if (raw) {
      const value: unknown = JSON.parse(raw);
      if (!Array.isArray(value)) return [];
      const parsed = (value as RecordedTrade[]).filter(
        (t) =>
          t &&
          t.family === "SAFESCALPERPRO" &&
          t.source === "simulated" &&
          typeof t.signalId === "string" &&
          Number.isFinite(t.entryTime),
      );
      // Sort newest first by entry/exit time
      return parsed.sort(
        (a, b) =>
          (b.exitTime || b.entryTime || 0) - (a.exitTime || a.entryTime || 0),
      );
    }
  } catch (e) {
    console.warn("Failed to load persistent journal trades:", e);
  }
  return [];
}

/**
 * Automatically record and persist a completed or updated trade with exact date & time
 */
export function saveTradeToJournal(
  trade: Trade,
  symbol: string = "XAUUSD",
  mode: "LIVE" | "DEMO" = "DEMO",
) {
  try {
    const existing = loadAllJournalTrades();
    const now = Date.now();
    const entryTime = trade.entryTime || now;
    const exitTime = trade.exitTime || now;

    const recorded: RecordedTrade = {
      ...trade,
      symbol: symbol || "XAUUSD",
      mode,
      timestamp: exitTime,
      entryDateFormatted:
        new Date(entryTime).toISOString().replace("T", " ").slice(0, 19) +
        " UTC",
      exitDateFormatted: trade.exitTime
        ? new Date(exitTime).toISOString().replace("T", " ").slice(0, 19) +
          " UTC"
        : "ACTIVE",
    };

    // Replace if existing by ID or prepend
    const idx = existing.findIndex(
      (t) => t.signalId === trade.signalId && t.mode === mode,
    );
    if (idx >= 0) {
      existing[idx] = recorded;
    } else {
      existing.unshift(recorded);
    }

    // Keep up to 2,000 historical trades
    const trimmed = existing.slice(0, 2000);
    localStorage.setItem(TRADES_STORAGE_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.warn("Failed to save trade to persistent journal:", e);
  }
}

/**
 * Bulk save or sync trade array
 */
export function saveJournalTrades(
  trades: Trade[],
  symbol: string = "XAUUSD",
  mode: "LIVE" | "DEMO" = "DEMO",
) {
  trades.forEach((t) => {
    if (!t.open) {
      saveTradeToJournal(t, symbol, mode);
    }
  });
}

/**
 * Automatically record and persist system execution event logs with date & time
 */
export function saveEventLog(
  event: EngineEvent,
  mode: "LIVE" | "DEMO" = "DEMO",
) {
  try {
    const raw = localStorage.getItem(EVENTS_STORAGE_KEY);
    const events: RecordedEvent[] = raw ? JSON.parse(raw) : [];
    const recorded: RecordedEvent = {
      ...event,
      mode,
      dateFormatted:
        new Date(event.time || Date.now())
          .toISOString()
          .replace("T", " ")
          .slice(0, 19) + " UTC",
    };

    events.unshift(recorded);
    // Keep up to 1,000 recent engine logs
    const trimmed = events.slice(0, 1000);
    localStorage.setItem(EVENTS_STORAGE_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.warn("Failed to save event log:", e);
  }
}

/**
 * Load all recorded execution event logs
 */
export function loadAllEventLogs(): RecordedEvent[] {
  try {
    const raw = localStorage.getItem(EVENTS_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn("Failed to load recorded event logs:", e);
  }
  return [];
}

/**
 * Trader notes persistence
 */
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
 * Clear all saved history (with user confirmation)
 */
export function clearAllJournalHistory() {
  try {
    localStorage.removeItem(TRADES_STORAGE_KEY);
    localStorage.removeItem(EVENTS_STORAGE_KEY);
    localStorage.removeItem(NOTES_STORAGE_KEY);
  } catch (e) {
    console.warn("Failed to clear journal history:", e);
  }
}

export function initAutoprune() {
  // Retain long-term history safely
}

/**
 * Export complete trade history to standard CSV file for Excel / TradingView journaling
 */
export function exportJournalToCsv(
  trades: (Trade | RecordedTrade)[],
  defaultSymbol: string = "XAUUSD",
) {
  const notes = loadTradeNotes();
  const headers = [
    "Ticket ID",
    "Mode (LIVE/DEMO)",
    "Date (UTC)",
    "Time (UTC)",
    "Symbol",
    "Side",
    "Setup / Trigger",
    "Family",
    "Entry Price",
    "Exit Price",
    "Stop Loss",
    "Take Profit",
    "Volume (oz/lots)",
    "Risk ($)",
    "Net P&L ($)",
    "R-Multiple",
    "Outcome",
    "Open Timestamp",
    "Close Timestamp",
    "Trader Notes",
  ];

  const rows = trades.map((t) => {
    const rec = t as RecordedTrade;
    const entryDate = new Date(t.entryTime || Date.now());
    const dateStr = entryDate.toISOString().slice(0, 10);
    const timeStr = entryDate.toISOString().slice(11, 19);

    return [
      t.brokerTicket ?? t.signalId,
      rec.mode || "DEMO",
      dateStr,
      timeStr,
      rec.symbol || defaultSymbol,
      t.side,
      t.setup || "",
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
      t.entryTime || "",
      t.exitTime || "",
      notes[t.signalId] || t.notes || "",
    ];
  });

  const cell = (value: unknown) => {
    const text = String(value ?? "");
    const safe =
      typeof value === "string" && /^[=+\-@\t\r]/.test(text)
        ? "'" + text
        : text;
    return '"' + safe.replace(/"/g, '""') + '"';
  };
  const csvContent = [
    headers.map(cell).join(","),
    ...rows.map((r) => r.map(cell).join(",")),
  ].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute(
    "download",
    `trading_flow_journal_all_sessions_${new Date().toISOString().slice(0, 10)}.csv`,
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportJournalCsv(
  trades: (Trade | RecordedTrade)[],
  symbol: string = "XAUUSD",
) {
  return exportJournalToCsv(trades, symbol);
}
