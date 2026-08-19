import type { EngineConfig, EngineState } from "../engine/types";
import { DAY_NAMES, windowParts } from "../engine/types";

interface Props {
  st: EngineState;
  cfg: EngineConfig;
  onCfg: (p: Partial<EngineConfig>) => void;
}

const PRESETS: { label: string; hours: [number, number] | "ALL" }[] = [
  { label: "LON+NY", hours: [7, 19] },
  { label: "LONDON", hours: [7, 15] },
  { label: "ASIA", hours: [0, 7] },
  { label: "24/7", hours: "ALL" },
];

export default function SchedulerPanel({ st, cfg, onCfg }: Props) {
  const t = st.bars[st.bars.length - 1].t;
  const { wd, hr } = windowParts(t);
  const isOpen = !cfg.windowEnabled || !!cfg.windowGrid[wd]?.[hr];

  const setCell = (d: number, h: number) => {
    const grid = cfg.windowGrid.map((row) => [...row]);
    grid[d][h] = !grid[d][h];
    onCfg({ windowGrid: grid });
  };
  const setRow = (d: number) => {
    const grid = cfg.windowGrid.map((row) => [...row]);
    const allOn = grid[d].every(Boolean);
    grid[d] = grid[d].map(() => !allOn);
    onCfg({ windowGrid: grid });
  };
  const setCol = (h: number) => {
    const grid = cfg.windowGrid.map((row) => [...row]);
    const allOn = grid.every((row) => row[h]);
    grid.forEach((row) => (row[h] = !allOn));
    onCfg({ windowGrid: grid });
  };
  const applyPreset = (p: (typeof PRESETS)[number]) => {
    const grid = DAY_NAMES.map((_, d) =>
      Array.from({ length: 24 }, (_, h) =>
        p.hours === "ALL" ? true : d >= 1 && d <= 5 && h >= p.hours[0] && h <= p.hours[1]
      )
    );
    onCfg({ windowGrid: grid });
  };

  return (
    <div className="panel rise-in flex h-full flex-col p-4" style={{ animationDelay: "0.32s" }}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="panel-title">Trading Window Scheduler</div>
        <div className="flex items-center gap-2">
          <span
            className="rounded-sm px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.16em]"
            style={
              !cfg.windowEnabled
                ? { color: "var(--muted)", background: "var(--bg2)" }
                : isOpen
                  ? { color: "var(--long)", background: "rgba(47,201,143,0.12)", border: "1px solid rgba(47,201,143,0.4)" }
                  : { color: "var(--short)", background: "rgba(240,84,108,0.12)", border: "1px solid rgba(240,84,108,0.4)" }
            }
          >
            {!cfg.windowEnabled ? "ALWAYS ARMED" : isOpen ? "WINDOW OPEN" : "WINDOW CLOSED"}
          </span>
          <button
            onClick={() => onCfg({ windowEnabled: !cfg.windowEnabled })}
            className="relative h-4 w-8 rounded-full transition-colors duration-200"
            style={{ background: cfg.windowEnabled ? "rgba(232,180,76,0.3)" : "var(--bg3)" }}
            title="Toggle scheduler"
            role="switch"
            aria-checked={cfg.windowEnabled}
            aria-label="Toggle trading window scheduler"
          >
            <span className="absolute top-0.5 h-3 w-3 rounded-full transition-all duration-200" style={{ left: cfg.windowEnabled ? "18px" : "2px", background: cfg.windowEnabled ? "var(--gold)" : "var(--dim)" }} />
          </button>
        </div>
      </div>

      {/* hour header */}
      <div className="mb-1 flex pl-9">
        {Array.from({ length: 24 }, (_, h) => (
          <button key={h} onClick={() => setCol(h)} className="flex-1 pb-0.5 text-center font-mono text-[7.5px] leading-none transition-colors hover:text-[var(--gold)]" style={{ color: h === hr && cfg.windowEnabled ? "var(--gold-hi)" : "var(--dim)" }}>
            {h % 3 === 0 ? h : ""}
          </button>
        ))}
      </div>

      {/* 7 × 24 grid */}
      <div className="space-y-[3px]" style={{ opacity: cfg.windowEnabled ? 1 : 0.45, transition: "opacity 0.3s ease" }}>
        {DAY_NAMES.map((d, di) => (
          <div key={d} className="flex items-center gap-1">
            <button onClick={() => setRow(di)} className="w-8 shrink-0 text-left font-mono text-[8.5px] font-bold tracking-wider transition-colors hover:text-[var(--gold)]" style={{ color: di === wd ? "var(--gold-hi)" : "var(--dim)" }}>
              {d}
            </button>
            <div className="flex flex-1 gap-[3px]">
              {cfg.windowGrid[di].map((on, h) => (
                <button
                  key={h}
                  onClick={() => setCell(di, h)}
                  title={`${d} ${String(h).padStart(2, "0")}:00–${String(h + 1).padStart(2, "0")}:00 UTC · ${on ? "armed" : "flat"}`}
                  className="h-[13px] flex-1 rounded-[2px] transition-all duration-150 hover:scale-y-125"
                  style={{
                    background: on ? (di === wd && h === hr ? "var(--gold-hi)" : "rgba(232,180,76,0.55)") : "var(--bg3)",
                    boxShadow: di === wd && h === hr && cfg.windowEnabled ? "0 0 8px rgba(232,180,76,0.7)" : "none",
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* presets */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 font-mono text-[8.5px] tracking-[0.18em] text-[var(--dim)]">PRESETS</span>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => applyPreset(p)}
            className="seg-btn rounded border px-2 py-1 font-mono text-[9px] font-bold tracking-wider"
            style={{ borderColor: "var(--line)", color: "var(--muted)", background: "var(--bg1)" }}
          >
            {p.label}
          </button>
        ))}
        <span className="ml-auto font-mono text-[8.5px] text-[var(--dim)]">
          NOW · {DAY_NAMES[wd]} {String(hr).padStart(2, "0")}:00 UTC
        </span>
      </div>

      <div className="mt-2 border-t pt-2 font-body text-[10px] italic leading-snug text-[var(--dim)]" style={{ borderColor: "var(--line-soft)" }}>
        {cfg.windowEnabled
          ? "Entries are blocked outside armed cells — open positions are still managed. Click cells, rows or columns to edit."
          : "Scheduler off — the engine trades any hour. Turn on to hard-limit yourself to quality sessions."}
      </div>
    </div>
  );
}
