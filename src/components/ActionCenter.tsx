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
    <div className="panel rise-in flex h-full flex-col p-4" style={{ animationDelay: "0.3s", borderTop: `2px solid ${supervised ? "var(--gold)" : "var(--line)"}` }}>
      <div className="mb-3 flex items-center justify-between">
        <div className="panel-title">Action Center</div>
        <span
          className="rounded-sm px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.18em]"
          style={
            supervised
              ? { color: "var(--gold-hi)", background: "rgba(232,180,76,0.14)", border: "1px solid var(--gold-deep)" }
              : { color: "var(--muted)", background: "var(--bg2)" }
          }
        >
          {supervised ? "SUPERVISED" : "AUTO-EXECUTE"}
        </span>
      </div>

      {!supervised ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-md border border-dashed px-4 py-6 text-center" style={{ borderColor: "var(--line)" }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5L13 2z" stroke="var(--dim)" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
          <span className="font-body text-[11.5px] leading-snug text-[var(--muted)]">
            Auto mode — every confirmed trap dispatches instantly. Flip on{" "}
            <span className="font-mono text-[10px] font-bold" style={{ color: "var(--gold)" }}>ACTION CENTER</span> in the console to approve signals yourself.
          </span>
        </div>
      ) : pending.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-md border border-dashed px-4 py-6 text-center" style={{ borderColor: "var(--line)" }}>
          <span className="h-2 w-2 rounded-full bg-[var(--gold)] blink-soft" />
          <span className="font-mono text-[10px] tracking-[0.2em] text-[var(--muted)]">NO PENDING DECISIONS</span>
          <span className="font-body text-[10.5px] italic text-[var(--dim)]">Next confirmed trap will land here instead of auto-executing.</span>
        </div>
      ) : (
        pending.map((q) => {
          const barsLeft = Math.max(0, 4 - (lastIdx - q.entryIndex));
          return (
            <div key={q.id} className="feed-in mb-3 rounded-md border p-3" style={{ borderColor: sideColor(q.side), background: "var(--bg1)", boxShadow: `0 0 18px ${q.side === "LONG" ? "rgba(47,201,143,0.1)" : "rgba(240,84,108,0.1)"}` }}>
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded-sm px-1.5 py-px font-mono text-[9.5px] font-bold tracking-wider" style={{ color: sideColor(q.side), background: "var(--bg2)", border: `1px solid ${sideColor(q.side)}55` }}>
                  {q.side}
                </span>
                <span className="font-mono text-[11px] font-semibold text-[var(--ink)]">{q.setup}</span>
                <span className="ml-auto font-mono text-[9px] tracking-widest text-[var(--dim)]">{fmtClock(q.time)} UTC</span>
              </div>
              <div className="mb-2.5 grid grid-cols-4 gap-1.5 font-mono text-[10px]">
                <div><div className="text-[8px] tracking-widest text-[var(--dim)]">ENTRY</div><div className="text-[var(--ink)]">{fmtP(q.entry)}</div></div>
                <div><div className="text-[8px] tracking-widest text-[var(--dim)]">STOP</div><div style={{ color: "var(--short)" }}>{fmtP(q.sl)}</div></div>
                <div><div className="text-[8px] tracking-widest text-[var(--dim)]">TARGET</div><div style={{ color: "var(--long)" }}>{fmtP(q.tp)}</div></div>
                <div><div className="text-[8px] tracking-widest text-[var(--dim)]">RISK</div><div style={{ color: "var(--gold)" }}>${q.risk.toFixed(0)} · {q.oz.toFixed(1)}oz</div></div>
              </div>
              <div className="mb-2 h-[3px] overflow-hidden rounded-full" style={{ background: "var(--bg3)" }}>
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(barsLeft / 4) * 100}%`, background: barsLeft <= 1 ? "var(--short)" : "var(--gold)" }} />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onDecide(q.id, true)}
                  className="seg-btn flex-1 rounded-md py-1.5 font-mono text-[10px] font-bold tracking-[0.14em] active:scale-[0.98] flex items-center justify-center gap-1"
                  style={{ background: "rgba(47,201,143,0.16)", color: "var(--long)", border: "1px solid rgba(47,201,143,0.5)" }}
                >
                  <span>✓</span>
                  <span>{cfg.feedMode === "live" ? "APPROVE & DISPATCH" : "APPROVE"}</span>
                </button>
                <button
                  onClick={() => onDecide(q.id, false)}
                  className="seg-btn flex-1 rounded-md py-1.5 font-mono text-[10px] font-bold tracking-[0.14em] active:scale-[0.98]"
                  style={{ background: "rgba(240,84,108,0.14)", color: "var(--short)", border: "1px solid rgba(240,84,108,0.5)" }}
                >
                  ✕ REJECT
                </button>
                <span className="shrink-0 font-mono text-[8.5px] tracking-widest" style={{ color: barsLeft <= 1 ? "var(--short)" : "var(--dim)" }}>
                  {barsLeft} BAR{barsLeft === 1 ? "" : "S"}
                </span>
              </div>
              {q.dispatchStatus && q.dispatchStatus !== "IDLE" && (
                <div className="mt-1.5 text-[9px] font-mono flex items-center gap-1.5" style={{ color: q.dispatchStatus === "SENT" ? "var(--long)" : q.dispatchStatus === "FAILED" ? "var(--short)" : "var(--gold)" }}>
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  <span>{q.dispatchMsg || `Broker Dispatch: ${q.dispatchStatus}`}</span>
                </div>
              )}
            </div>
          );
        })
      )}

      {/* decision ledger + money-on-table meters */}
      <div className="mt-auto border-t pt-2.5" style={{ borderColor: "var(--line-soft)" }}>
        <div className="mb-2 grid grid-cols-2 gap-2">
          <div className="rounded-md border px-2.5 py-2" style={{ borderColor: "var(--line-soft)", background: "var(--bg1)" }}>
            <div className="text-[8px] font-mono tracking-[0.16em] text-[var(--dim)]">MONEY LEFT ON TABLE</div>
            <div className="font-mono text-[16px] font-bold" style={{ color: "var(--gold)" }}>${st.missedTpUSD.toFixed(0)}</div>
          </div>
          <div className="rounded-md border px-2.5 py-2" style={{ borderColor: "var(--line-soft)", background: "var(--bg1)" }}>
            <div className="text-[8px] font-mono tracking-[0.16em] text-[var(--dim)]">LOSSES DODGED</div>
            <div className="font-mono text-[16px] font-bold" style={{ color: "var(--long)" }}>${st.avoidedSlUSD.toFixed(0)}</div>
          </div>
        </div>
        {decided.length > 0 && (
          <div className="max-h-[120px] space-y-1 overflow-auto pr-1">
            {decided.map((q) => {
              const chip = resultChip(q.result);
              return (
                <div key={q.id} className="flex items-center gap-2 rounded px-1.5 py-1 font-mono text-[9.5px]" style={{ background: "var(--bg1)" }}>
                  <span style={{ color: sideColor(q.side) }}>{q.side}</span>
                  <span className="text-[var(--muted)]">{q.setup}</span>
                  <span className="text-[var(--dim)]">{q.status === "APPROVED" ? "→ filled" : q.reason === "EXPIRED" ? "expired" : "rejected"}</span>
                  {q.result && (
                    <span className="ml-auto rounded-sm px-1.5 text-[8px] font-bold tracking-wider" style={{ color: chip.color, background: "var(--bg2)" }}>
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
