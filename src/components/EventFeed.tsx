import type { EngineState } from "../engine/types";
import { fmtClock } from "../engine/types";

const toneColor: Record<string, string> = {
  long: "var(--long)",
  short: "var(--short)",
  risk: "var(--gold)",
  sys: "var(--info)",
  aoi: "var(--muted)",
};

export default function EventFeed({ st }: { st: EngineState }) {
  const rows = [...st.events].reverse().slice(0, 42);
  return (
    <div className="panel rise-in flex h-full min-h-0 flex-col p-4" style={{ animationDelay: "0.3s" }}>
      <div className="mb-2 flex items-center justify-between">
        <div className="panel-title">Engine Wire</div>
        <span className="flex items-center gap-1.5 font-mono text-[9px] tracking-[0.2em] text-[var(--dim)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--long)] blink-soft" /> LIVE
        </span>
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-auto pr-1">
        {rows.map((e, i) => {
          const day = Math.floor(e.time / 86400000) - st.startDay + 1;
          return (
            <div key={e.id} className={`flex gap-2 rounded px-1.5 py-1 font-mono text-[10.5px] leading-snug ${i === 0 ? "feed-in" : ""}`}>
              <span className="shrink-0 text-[var(--dim)]">D{day} {fmtClock(e.time)}</span>
              <span
                className="h-3.5 shrink-0 self-center rounded-sm px-1 text-[8.5px] font-bold leading-[14px] tracking-wider"
                style={{ color: toneColor[e.tone], background: "var(--bg2)", border: `1px solid ${toneColor[e.tone]}33` }}
              >
                {e.tag}
              </span>
              <span style={{ color: e.tone === "long" || e.tone === "short" ? "var(--ink)" : "var(--muted)" }}>{e.msg}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
