import { useState } from "react";
import type { EngineState } from "../engine/types";
import { fmtClock, fmtP } from "../engine/types";
import type { Stats } from "../engine/engine";
import { loadTradeNotes, saveTradeNote } from "../engine/storage";

const sideColor = (s: "LONG" | "SHORT") => (s === "LONG" ? "var(--long)" : "var(--short)");

export default function TradeLog({ st, stats }: { st: EngineState; stats: Stats }) {
  const rows = [...st.trades].reverse().slice(0, 40);
  const open = st.open;
  const last = st.bars[st.bars.length - 1];
  const [notes, setNotes] = useState<Record<string, string>>(loadTradeNotes);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [tempNote, setTempNote] = useState("");

  const handleStartEdit = (id: number, currentNote: string) => {
    setEditingId(id);
    setTempNote(currentNote || "");
  };

  const handleSaveNote = (id: number) => {
    saveTradeNote(id, tempNote);
    setNotes((prev) => ({ ...prev, [String(id)]: tempNote }));
    setEditingId(null);
  };

  return (
    <div className="panel rise-in flex h-full min-h-0 flex-col p-4" style={{ animationDelay: "0.24s" }}>
      <div className="mb-2 flex items-center justify-between">
        <div className="panel-title">Execution Journal & Notes</div>
        <div className="font-mono text-[10px] text-[var(--muted)]">
          <span style={{ color: "var(--long)" }}>{stats.wins}W</span> · <span style={{ color: "var(--short)" }}>{stats.losses}L</span> ·{" "}
          {stats.winRate.toFixed(0)}% WIN · AVG {stats.avgR >= 0 ? "+" : ""}{stats.avgR.toFixed(2)}R
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse font-mono text-[10.5px]">
          <thead className="sticky top-0" style={{ background: "var(--bg1)" }}>
            <tr className="text-left text-[9px] tracking-[0.18em] text-[var(--dim)]">
              <th className="py-1.5 pr-2 font-medium">TIME</th>
              <th className="py-1.5 pr-2 font-medium">SETUP</th>
              <th className="py-1.5 pr-2 font-medium">SIDE</th>
              <th className="py-1.5 pr-2 text-right font-medium">ENTRY</th>
              <th className="py-1.5 pr-2 text-right font-medium">SL</th>
              <th className="py-1.5 pr-2 text-right font-medium">TP</th>
              <th className="py-1.5 pr-2 text-right font-medium">OZ</th>
              <th className="py-1.5 pr-2 text-right font-medium">EXIT</th>
              <th className="py-1.5 pr-2 text-right font-medium">P/L</th>
              <th className="py-1.5 pr-2 text-right font-medium">R</th>
              <th className="py-1.5 text-left font-medium">JOURNAL NOTE</th>
            </tr>
          </thead>
          <tbody>
            {open && (
              <tr style={{ background: "rgba(232,180,76,0.06)" }}>
                <td className="py-1.5 pr-2 text-[var(--muted)]">D{open.entryTime != null ? (Math.floor(open.entryTime / 86400000) - st.startDay + 1) : ""}·{fmtClock(open.entryTime)}</td>
                <td className="py-1.5 pr-2 text-[var(--gold-hi)]">{open.setup}</td>
                <td className="py-1.5 pr-2 font-semibold" style={{ color: sideColor(open.side) }}>{open.side}</td>
                <td className="py-1.5 pr-2 text-right">{fmtP(open.entry)}</td>
                <td className="py-1.5 pr-2 text-right text-[var(--short)]">{fmtP(open.sl)}</td>
                <td className="py-1.5 pr-2 text-right text-[var(--long)]">{fmtP(open.tp)}</td>
                <td className="py-1.5 pr-2 text-right">{open.oz.toFixed(1)}</td>
                <td className="py-1.5 pr-2 text-right"><span className="blink-soft text-[var(--gold)]">RUNNING</span></td>
                <td className="py-1.5 pr-2 text-right font-semibold" style={{ color: stats.openPnl >= 0 ? "var(--long)" : "var(--short)" }}>
                  {stats.openPnl >= 0 ? "+" : "−"}${Math.abs(stats.openPnl).toFixed(0)}
                </td>
                <td className="py-1.5 pr-2 text-right text-[var(--muted)]">·</td>
                <td className="py-1.5 text-[var(--dim)] italic text-[9.5px]">Position active…</td>
              </tr>
            )}
            {rows.filter((t) => !t.open).map((t) => {
              const day = Math.floor(t.entryTime / 86400000) - st.startDay + 1;
              const win = (t.pnl ?? 0) >= 0;
              const currentNote = notes[String(t.id)] || "";
              const isEditing = editingId === t.id;

              return (
                <tr key={t.id} className="border-t transition-colors hover:bg-[var(--bg2)]" style={{ borderColor: "var(--line-soft)" }}>
                  <td className="py-1.5 pr-2 text-[var(--muted)]">D{day}·{fmtClock(t.entryTime)}</td>
                  <td className="py-1.5 pr-2 text-[var(--ink)]">{t.setup}</td>
                  <td className="py-1.5 pr-2 font-semibold" style={{ color: sideColor(t.side) }}>{t.side}</td>
                  <td className="py-1.5 pr-2 text-right">{fmtP(t.entry)}</td>
                  <td className="py-1.5 pr-2 text-right text-[var(--short)]">{fmtP(t.sl)}</td>
                  <td className="py-1.5 pr-2 text-right text-[var(--long)]">{fmtP(t.tp)}</td>
                  <td className="py-1.5 pr-2 text-right">{t.oz.toFixed(1)}</td>
                  <td className="py-1.5 pr-2 text-right">{t.exit != null ? fmtP(t.exit) : "—"}</td>
                  <td className="py-1.5 pr-2 text-right font-semibold" style={{ color: win ? "var(--long)" : "var(--short)" }}>
                    {win ? "+" : "−"}${Math.abs(t.pnl ?? 0).toFixed(0)}
                  </td>
                  <td className="py-1.5 pr-2 text-right" style={{ color: win ? "var(--long)" : "var(--short)" }}>
                    {(t.r ?? 0) >= 0 ? "+" : ""}{(t.r ?? 0).toFixed(1)}R
                  </td>
                  <td className="py-1.5 max-w-[180px]">
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={tempNote}
                          onChange={(e) => setTempNote(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveNote(t.id);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          autoFocus
                          className="w-full px-1.5 py-0.5 rounded border border-[var(--gold)] bg-[var(--bg3)] text-[10px] text-white outline-none"
                        />
                        <button
                          onClick={() => handleSaveNote(t.id)}
                          className="text-[9px] text-[var(--long)] font-bold px-1 hover:underline"
                        >
                          ✓
                        </button>
                      </div>
                    ) : (
                      <div
                        onClick={() => handleStartEdit(t.id, currentNote)}
                        className="truncate cursor-pointer text-[9.5px] hover:text-[var(--gold)] transition-colors"
                        style={{ color: currentNote ? "var(--ink)" : "var(--dim)" }}
                        title={currentNote || "Click to add note"}
                      >
                        {currentNote || "+ add note…"}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {st.trades.length === 0 && (
              <tr>
                <td colSpan={11} className="py-8 text-center text-[var(--dim)]">
                  No executions yet — the engine only fires at an AOI with a confirmed reaction candle.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {last && st.trades.length > 0 && (
        <div className="mt-2 border-t pt-2 font-mono text-[9.5px] text-[var(--dim)]" style={{ borderColor: "var(--line-soft)" }}>
          BEST {stats.bestR >= 0 ? "+" : ""}{stats.bestR.toFixed(1)}R · WORST {stats.worstR.toFixed(1)}R · EXPECTANCY {stats.closed.length ? ((stats.winRate / 100) * cfgRR(stats) - (1 - stats.winRate / 100)).toFixed(2) : "0.00"}R
        </div>
      )}
    </div>
  );
}

function cfgRR(stats: Stats) {
  const tp = stats.closed.filter((t) => t.outcome === "TP");
  return tp.length ? tp.reduce((s, t) => s + (t.r ?? 2), 0) / tp.length : 2;
}

