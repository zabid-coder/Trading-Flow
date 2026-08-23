import type { EngineState } from "../engine/types";

const dot = (ok: boolean | null) =>
  ok === true ? "var(--long)" : ok === false ? "var(--short)" : "var(--dim)";

const clsStyle = (c: string): { color: string; bg: string } => {
  switch (c) {
    case "LPR": return { color: "var(--long)", bg: "rgba(47,201,143,0.12)" };
    case "HPR": return { color: "var(--short)", bg: "rgba(240,84,108,0.12)" };
    case "POWER_BULL": return { color: "var(--long)", bg: "rgba(47,201,143,0.12)" };
    case "POWER_BEAR": return { color: "var(--short)", bg: "rgba(240,84,108,0.12)" };
    case "BORING": return { color: "var(--dim)", bg: "rgba(81,100,127,0.12)" };
    default: return { color: "var(--muted)", bg: "rgba(127,149,180,0.08)" };
  }
};

export default function PipelineStrip({ st }: { st: EngineState }) {
  const le = st.lastEval;
  const cs = clsStyle(le.cls);
  const identity = st.halted ? "DISCIPLINE LOCK" : "SIGNAL PIPELINE";

  const kzColors: Record<string, { color: string; bg: string }> = {
    LONDON: { color: "var(--long)", bg: "rgba(47,201,143,0.15)" },
    NEW_YORK: { color: "#4fa6ff", bg: "rgba(79,166,255,0.15)" },
    OVERLAP: { color: "var(--gold)", bg: "rgba(234,179,8,0.15)" },
    OFF_SESSION: { color: "var(--dim)", bg: "rgba(81,100,127,0.12)" },
  };
  const kz = st.activeKillzone || "OFF_SESSION";
  const kzStyle = kzColors[kz] || kzColors.OFF_SESSION;

  const confScore = st.lastConfluenceScore || 0;
  const confColor = confScore >= 75 ? "var(--long)" : confScore >= 50 ? "var(--gold)" : "var(--short)";
  const confBg = confScore >= 75 ? "rgba(47,201,143,0.15)" : confScore >= 50 ? "rgba(234,179,8,0.15)" : "rgba(240,84,108,0.12)";

  return (
    <div className="glass-panel rise-in px-4 py-3 border border-white/10" style={{ animationDelay: "0.12s" }}>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="panel-title font-bold text-white tracking-wider">{identity}</span>
          <span className="rounded px-2 py-0.5 font-mono text-[10px] font-extrabold tracking-wider border border-white/10" style={{ color: cs.color, background: cs.bg }}>
            {le.cls.replace("_", " ")}
          </span>
          {/* Killzone Status Badge */}
          <span className="rounded px-2 py-0.5 font-mono text-[9px] font-bold tracking-wider border border-white/10" style={{ color: kzStyle.color, background: kzStyle.bg }}>
            {kz === "OFF_SESSION" ? "OFF" : kz.replace("_", " ")}
          </span>
          {/* Confluence Score Badge */}
          <span className="rounded px-2 py-0.5 font-mono text-[10px] font-extrabold tracking-wider border border-white/10" style={{ color: confColor, background: confBg }}>
            CF {confScore}/100
          </span>
        </div>

        <div className="flex flex-1 flex-wrap items-center gap-2">
          {le.checks.map((c, i) => (
            <div key={c.k} className="flex items-center gap-2">
              {i > 0 && (
                <svg width="14" height="10" viewBox="0 0 14 10" fill="none" aria-hidden>
                  <path d="M1 1l4 4-4 4M8 1l4 4-4 4" stroke="var(--dim)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              <div
                className="rounded-md border px-2.5 py-1.5 transition-colors duration-300"
                style={{ borderColor: "var(--line-soft)", background: "var(--bg1)" }}
              >
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full transition-colors duration-300" style={{ background: dot(c.ok), boxShadow: c.ok ? `0 0 6px ${dot(c.ok)}` : "none" }} />
                  <span className="font-mono text-[8.5px] font-semibold tracking-[0.18em] text-[var(--dim)]">{c.k}</span>
                </div>
                <div className="mt-0.5 font-mono text-[11px] leading-tight" style={{ color: c.ok === false ? "var(--short)" : c.ok === true ? "var(--ink)" : "var(--muted)" }}>
                  {c.v}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 border-t pt-2 font-body text-[12px] italic text-[var(--muted)]" style={{ borderColor: "var(--line-soft)" }}>
        <span className="mr-2 font-mono not-italic text-[9px] tracking-[0.2em] text-[var(--gold)]">VERDICT</span>
        <span key={le.verdict} className="verdict-in inline-block">
          {le.verdict}
        </span>
      </div>
    </div>
  );
}
