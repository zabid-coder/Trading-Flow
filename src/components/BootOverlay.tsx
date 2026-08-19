import { useEffect, useState } from "react";

const LINES: { t: string; tone: string }[] = [
  { t: "TRADING FLOW v2.1 — algorithmic trading suite", tone: "var(--gold-hi)" },
  { t: "spec parser ........... 7 steps verified", tone: "var(--muted)" },
  { t: "AOI scanner ........... 4 families armed (A·B·C·D)", tone: "var(--muted)" },
  { t: "reaction filter ....... LPR / HPR / POWER / BORING", tone: "var(--muted)" },
  { t: "risk engine ........... $375 fixed · 1:2.0 target · pv + spread explicit", tone: "var(--muted)" },
  { t: "discipline ledger ..... daily cap 2 · same-bar re-entry locked", tone: "var(--muted)" },
  { t: "action center ......... supervised queue · approve / reject scoring", tone: "var(--muted)" },
  { t: "scheduler + analyzer .. window grid · 12-scenario stress test", tone: "var(--muted)" },
  { t: "sim feed .............. XAUUSD 15M · connected", tone: "var(--long)" },
];

export default function BootOverlay({ onDone }: { onDone: () => void }) {
  const [shown, setShown] = useState(0);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setShown((s) => Math.min(LINES.length, s + 1)), 170);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (shown >= LINES.length) {
      const a = window.setTimeout(() => setLeaving(true), 420);
      const b = window.setTimeout(onDone, 950);
      return () => {
        window.clearTimeout(a);
        window.clearTimeout(b);
      };
    }
  }, [shown, onDone]);

  const pct = (shown / LINES.length) * 100;

  return (
    <div
      onClick={onDone}
      className="fixed inset-0 z-50 flex cursor-pointer items-center justify-center px-4"
      style={{
        background: "linear-gradient(180deg, #0a0f18 0%, #0c1320 100%)",
        opacity: leaving ? 0 : 1,
        transition: "opacity 0.5s ease",
      }}
      role="button"
      aria-label="Skip boot sequence"
    >
      <div className="w-full max-w-[460px]">
        <div className="mb-5 flex items-center gap-3">
          <svg width="40" height="40" viewBox="0 0 34 34" fill="none" aria-hidden>
            <rect x="1" y="1" width="32" height="32" rx="8" stroke="var(--gold-deep)" strokeWidth="1.4" />
            <path d="M6 24c3.5 0 3.5-10 7-10s3.5 12 7 12 3.5-8 8-8" stroke="var(--gold)" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M6 27c3.5 0 3.5-6 7-6s3.5 8 7 8 3.5-5 8-5" stroke="var(--gold)" strokeWidth="1.3" opacity="0.4" strokeLinecap="round" />
            <path d="M25.5 5.5V8m0 5.5V16" stroke="var(--gold-hi)" strokeWidth="1.5" strokeLinecap="round" />
            <rect x="23.8" y="8" width="3.4" height="5.5" rx="0.9" fill="var(--gold)" />
          </svg>
          <div>
            <div className="font-display text-xl font-bold tracking-wide">
              Trading<span style={{ color: "var(--gold)" }}>Flow</span>
            </div>
            <div className="font-mono text-[9px] tracking-[0.3em] text-[var(--dim)]">ALGORITHMIC TRADING SUITE</div>
          </div>
          <span className="blink-soft ml-auto font-mono text-[10px] text-[var(--dim)]">skip →</span>
        </div>

        <div className="space-y-1.5 rounded-lg border p-4" style={{ borderColor: "var(--line-soft)", background: "rgba(14,21,34,0.8)" }}>
          {LINES.slice(0, shown).map((l, i) => (
            <div key={i} className="feed-in flex items-center gap-2 font-mono text-[11px]" style={{ color: l.tone }}>
              <span style={{ color: "var(--gold)" }}>$</span>
              {l.t}
              <span className="ml-auto font-mono text-[9px] font-bold" style={{ color: "var(--long)" }}>OK</span>
            </div>
          ))}
          {shown < LINES.length && <span className="blink-soft inline-block h-3.5 w-2 align-middle" style={{ background: "var(--gold)" }} />}
        </div>

        <div className="mt-4 h-[3px] overflow-hidden rounded-full" style={{ background: "var(--bg3)" }}>
          <div
            className="h-full rounded-full"
            style={{
              width: `${pct}%`,
              background: "linear-gradient(90deg, var(--gold-deep), var(--gold-hi))",
              transition: "width 0.3s ease",
              boxShadow: "0 0 12px rgba(232,180,76,0.5)",
            }}
          />
        </div>
        <div className="mt-2 text-right font-mono text-[9px] tracking-[0.2em] text-[var(--dim)]">{Math.round(pct)}%</div>
      </div>
    </div>
  );
}
