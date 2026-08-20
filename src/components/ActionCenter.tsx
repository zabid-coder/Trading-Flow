import type { EngineConfig, EngineState } from "../engine/types";
import { fmtClock, fmtP } from "../engine/types";

interface Props {
  st: EngineState;
  cfg: EngineConfig;
  onDecide: (id: number, approve: boolean) => void;
}

const sideColor = (s: "LONG" | "SHORT") => (s === "LONG" ? "var(--long)" : "var(--short)");

const resultChip = (r?: "MISSED_TP" | "AVOIDED_SL" | "FLAT") => {
  if (r === "MISSED_TP") return { label: "MISSED +TP", color: "var(--gold)" };
  if (r === "AVOIDED_SL") return { label: "DODGED −SL", color: "var(--long)" };
  return { label: "FLAT", color: "var(--dim)" };
};

export default function ActionCenter({ st, cfg, onDecide }: Props) {
  const lastIdx = st.bars.length - 1;
  const pending = st.queue.filter((q) => q.status === "PENDING");
  const decided = [...st.queue].filter((q) => q.status !== "PENDING").reverse().slice(0, 6);
  const supervised = cfg.actionCenter;

  return (
    <div className="glass-panel rise-in flex h-full flex-col p-4" style={{ animationDelay: "0.3s", borderTop: `2px solid ${supervised ? "var(--gold)" : "rgba(255,255,255,0.1)"}` }}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[var(--gold)] animate-pulse" />
          <div className="panel-title text-white font-bold tracking-wider">Action Center</div>
        </div>
        <span
          className="rounded px-2 py-0.5 font-mono text-[9px] font-extrabold tracking-[0.18em]"
          style={
            supervised
              ? { color: "var(--gold-hi)", background: "rgba(232,180,76,0.18)", border: "1px solid var(--gold)" }
              : { color: "var(--muted)", background: "rgba(255,255,255,0.05)" }
          }
        >
          {supervised ? "SUPERVISED" : "AUTO-EXECUTE"}
        </span>
      </div>

      {!supervised ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 px-4 py-6 text-center bg-white/[0.02]">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5L13 2z" stroke="var(--dim)" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
          <span className="font-body text-[11.5px] leading-snug text-[var(--muted)]">
            Auto mode active — confirmed traps dispatch instantly. Turn on{" "}
            <span className="font-mono text-[10px] font-bold text-[var(--gold-hi)]">ACTION CENTER</span> in the console to manually approve signals.
          </span>
        </div>
      ) : pending.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 px-4 py-6 text-center bg-white/[0.02]">
          <span className="h-2 w-2 rounded-full bg-[var(--gold)] blink-soft" />
          <span className="font-mono text-[10px] tracking-[0.2em] text-[var(--muted)] font-bold">NO PENDING DECISIONS</span>
          <span className="font-body text-[11px] text-[var(--dim)]">Next confirmed AOI sweep will land here for your 1-click execution.</span>
        </div>
      ) : (
        <div className="space-y-3 overflow-auto max-h-[380px] pr-1">
          {pending.map((q) => {
            const barsLeft = Math.max(0, 4 - (lastIdx - q.entryIndex));
            const isLong = q.side === "LONG";
            return (
              <div
                key={q.id}
                className="feed-in rounded-xl border p-3 glass-card"
                style={{
                  borderColor: isLong ? "rgba(47,201,143,0.4)" : "rgba(240,84,108,0.4)",
                  boxShadow: isLong ? "0 0 16px rgba(47,201,143,0.15)" : "0 0 16px rgba(240,84,108,0.15)",
                }}
              >
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className="rounded px-2 py-0.5 font-mono text-[10px] font-black tracking-wider"
                    style={{
                      color: sideColor(q.side),
                      background: isLong ? "rgba(47,201,143,0.15)" : "rgba(240,84,108,0.15)",
                      border: `1px solid ${sideColor(q.side)}55`,
                    }}
                  >
                    {q.side}
                  </span>
                  <span className="font-mono text-[11.5px] font-bold text-white">{q.setup}</span>
                  <span className="ml-auto font-mono text-[9px] tracking-widest text-[var(--dim)]">{fmtClock(q.time)} UTC</span>
                </div>
                <div className="mb-2.5 grid grid-cols-4 gap-1.5 font-mono text-[10.5px]">
                  <div><div className="text-[8px] tracking-widest text-[var(--dim)]">ENTRY</div><div className="font-bold text-white">{fmtP(q.entry)}</div></div>
                  <div><div className="text-[8px] tracking-widest text-[var(--dim)]">STOP</div><div className="font-bold" style={{ color: "var(--short)" }}>{fmtP(q.sl)}</div></div>
                  <div><div className="text-[8px] tracking-widest text-[var(--dim)]">TARGET</div><div className="font-bold" style={{ color: "var(--long)" }}>{fmtP(q.tp)}</div></div>
                  <div><div className="text-[8px] tracking-widest text-[var(--dim)]">RISK</div><div className="font-bold" style={{ color: "var(--gold)" }}>${q.risk.toFixed(0)} · {q.oz.toFixed(1)}oz</div></div>
                </div>
                <div className="mb-2 h-[4px] overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(barsLeft / 4) * 100}%`, background: barsLeft <= 1 ? "var(--short)" : "var(--gold)" }} />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onDecide(q.id, true)}
                    className="flex-1 rounded-lg py-2 font-mono text-[10.5px] font-extrabold tracking-[0.14em] tactile-btn flex items-center justify-center gap-1"
                    style={{
                      background: "rgba(47,201,143,0.2)",
                      color: "var(--long)",
                      border: "1px solid rgba(47,201,143,0.6)",
                      boxShadow: "0 0 12px rgba(47,201,143,0.2)",
                    }}
                  >
                    <span>✓</span>
                    <span>{cfg.feedMode === "live" ? "APPROVE & DISPATCH" : "APPROVE"}</span>
                  </button>
                  <button
                    onClick={() => onDecide(q.id, false)}
                    className="rounded-lg px-3 py-2 font-mono text-[10.5px] font-bold tracking-[0.14em] tactile-btn"
                    style={{
                      background: "rgba(240,84,108,0.15)",
                      color: "var(--short)",
                      border: "1px solid rgba(240,84,108,0.5)",
                    }}
                  >
                    ✕ REJECT
                  </button>
                  <span className="shrink-0 font-mono text-[9px] font-bold tracking-widest" style={{ color: barsLeft <= 1 ? "var(--short)" : "var(--dim)" }}>
                    {barsLeft}B
                  </span>
                </div>
                {q.dispatchStatus && q.dispatchStatus !== "IDLE" && (
                  <div className="mt-2 text-[9.5px] font-mono flex items-center gap-1.5" style={{ color: q.dispatchStatus === "SENT" ? "var(--long)" : q.dispatchStatus === "FAILED" ? "var(--short)" : "var(--gold)" }}>
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    <span>{q.dispatchMsg || `Broker Dispatch: ${q.dispatchStatus}`}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Decision Ledger + Money-On-Table meters */}
      <div className="mt-auto border-t border-white/10 pt-3">
        <div className="mb-2.5 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-white/10 px-3 py-2 bg-[#090d16]/80 shadow-sm">
            <div className="text-[8px] font-mono tracking-[0.16em] text-[var(--dim)] font-bold">MONEY LEFT ON TABLE</div>
            <div className="font-mono text-[17px] font-black text-[var(--gold)]">${st.missedTpUSD.toFixed(0)}</div>
          </div>
          <div className="rounded-xl border border-white/10 px-3 py-2 bg-[#090d16]/80 shadow-sm">
            <div className="text-[8px] font-mono tracking-[0.16em] text-[var(--dim)] font-bold">LOSSES DODGED</div>
            <div className="font-mono text-[17px] font-black text-[var(--long)]">${st.avoidedSlUSD.toFixed(0)}</div>
          </div>
        </div>
        {decided.length > 0 && (
          <div className="max-h-[120px] space-y-1.5 overflow-auto pr-1">
            {decided.map((q) => {
              const chip = resultChip(q.result);
              return (
                <div key={q.id} className="flex items-center gap-2 rounded-lg px-2 py-1 font-mono text-[9.5px] bg-[#0c121e] border border-white/5">
                  <span className="font-bold" style={{ color: sideColor(q.side) }}>{q.side}</span>
                  <span className="text-white">{q.setup}</span>
                  <span className="text-[var(--dim)]">{q.status === "APPROVED" ? "→ filled" : q.reason === "EXPIRED" ? "expired" : "rejected"}</span>
                  {q.result && (
                    <span className="ml-auto rounded px-1.5 text-[8.5px] font-bold tracking-wider" style={{ color: chip.color, background: "rgba(255,255,255,0.05)" }}>
                      {chip.label}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
