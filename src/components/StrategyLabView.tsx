import type { EngineConfig, EngineState, StrategyFlags, StrategyId } from "../engine/types";
import { STRATEGY_DEFINITIONS } from "../engine/types";

interface Props {
  st: EngineState;
  cfg: EngineConfig;
  onCfg: (p: Partial<EngineConfig>) => void;
}

export default function StrategyLabView({ st, cfg, onCfg }: Props) {
  const toggleStrategy = (id: StrategyId) => {
    const next = { ...cfg.enabledStrategies, [id]: !cfg.enabledStrategies[id] };
    onCfg({ enabledStrategies: next });
  };

  const enabledCount = Object.values(cfg.enabledStrategies).filter(Boolean).length;

  return (
    <div className="space-y-4 font-mono text-[11.5px] p-2 md:p-4 max-w-[1720px] mx-auto animate-fade-in">
      {/* Top Controls: Execution Mode & Confluence Setting */}
      <div
        className="rounded-xl border p-4 shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
        style={{ borderColor: "var(--line)", background: "linear-gradient(180deg, #131c2d 0%, #0e1522 100%)" }}
      >
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--gold)] text-black font-extrabold text-xs">
              🧠
            </span>
            <h1 className="text-base font-bold text-white tracking-wide">
              MULTI-STRATEGY LAB & LOGIC CONFLUENCE DESK
            </h1>
          </div>
          <p className="text-[11px] text-[var(--muted)] mt-1">
            Choose whether to trade a single focused strategy or run multiple strategies simultaneously with confluence scoring.
          </p>
        </div>

        {/* Mode Selector */}
        <div className="flex items-center rounded-lg border p-1 bg-[#090d16]" style={{ borderColor: "var(--line)" }}>
          <button
            onClick={() => onCfg({ strategyMode: "single" })}
            className={`px-3 py-1.5 rounded-md font-bold text-[11px] transition-all ${
              cfg.strategyMode === "single"
                ? "bg-[var(--gold)] text-black shadow font-extrabold"
                : "text-[var(--muted)] hover:text-white"
            }`}
          >
            🎯 SINGLE STRATEGY FOCUS
          </button>

          <button
            onClick={() => onCfg({ strategyMode: "multi_confluence" })}
            className={`px-3 py-1.5 rounded-md font-bold text-[11px] transition-all flex items-center gap-1.5 ${
              cfg.strategyMode === "multi_confluence"
                ? "bg-[var(--long)] text-black shadow font-extrabold"
                : "text-[var(--muted)] hover:text-white"
            }`}
          >
            <span>⚡ MULTI-CONFLUENCE MODE</span>
            <span className="text-[9px] px-1 py-px rounded bg-black/20 font-black">
              {enabledCount} ACTIVE
            </span>
          </button>
        </div>
      </div>

      {/* Mode Explanations & Confluence Bar */}
      {cfg.strategyMode === "multi_confluence" ? (
        <div
          className="rounded-xl border p-4 shadow flex flex-col md:flex-row items-center justify-between gap-4"
          style={{ borderColor: "rgba(47,201,143,0.3)", background: "rgba(47,201,143,0.06)" }}
        >
          <div className="flex items-center gap-3">
            <span className="h-3 w-3 rounded-full bg-[var(--long)] animate-pulse" />
            <div>
              <span className="font-bold text-white text-[12px]">
                MULTI-STRATEGY CONFLUENCE ENGINE ACTIVE
              </span>
              <p className="text-[10.5px] text-[var(--muted)] mt-0.5">
                The algorithm scans all enabled strategies simultaneously. A trade signal is triggered only when at least{" "}
                <strong className="text-[var(--gold)]">{cfg.minConfluenceCount || 2} strategies</strong> align on the same candle.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-[#090d16] border border-[var(--line)] rounded-lg px-3 py-1.5">
            <span className="text-[10px] text-[var(--dim)] font-bold">MIN CONFLUENCE COUNT:</span>
            <select
              value={cfg.minConfluenceCount || 2}
              onChange={(e) => onCfg({ minConfluenceCount: Number(e.target.value) })}
              className="bg-transparent text-[var(--gold)] font-black text-[12px] outline-none cursor-pointer"
            >
              <option value={1} className="bg-[#0e1522] text-white">1 Strategy (Any Trigger)</option>
              <option value={2} className="bg-[#0e1522] text-white">2 Strategies (High Quality)</option>
              <option value={3} className="bg-[#0e1522] text-white">3 Strategies (Ultra Strict Confluence)</option>
            </select>
          </div>
        </div>
      ) : (
        <div
          className="rounded-xl border p-4 shadow flex flex-col md:flex-row items-center justify-between gap-4"
          style={{ borderColor: "rgba(232,180,76,0.3)", background: "rgba(232,180,76,0.06)" }}
        >
          <div className="flex items-center gap-3">
            <span className="h-3 w-3 rounded-full bg-[var(--gold)]" />
            <div>
              <span className="font-bold text-white text-[12px]">
                SINGLE STRATEGY FOCUS MODE ACTIVE
              </span>
              <p className="text-[10.5px] text-[var(--muted)] mt-0.5">
                Trading exclusively with the selected strategy. Perfect for mastering one specific setup at a time.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-[#090d16] border border-[var(--line)] rounded-lg px-3 py-1.5">
            <span className="text-[10px] text-[var(--dim)] font-bold">PRIMARY STRATEGY:</span>
            <select
              value={cfg.selectedStrategy || "sweep_reversal"}
              onChange={(e) => onCfg({ selectedStrategy: e.target.value as StrategyId })}
              className="bg-transparent text-[var(--gold)] font-black text-[12px] outline-none cursor-pointer max-w-[220px]"
            >
              {STRATEGY_DEFINITIONS.map((s) => (
                <option key={s.id} value={s.id} className="bg-[#0e1522] text-white">
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Strategies Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {STRATEGY_DEFINITIONS.map((s) => {
          const isEnabled = cfg.enabledStrategies[s.id];
          const isSingleSelected = cfg.strategyMode === "single" && cfg.selectedStrategy === s.id;

          return (
            <div
              key={s.id}
              className={`rounded-xl border p-4 shadow-lg flex flex-col justify-between transition-all ${
                isSingleSelected || (cfg.strategyMode === "multi_confluence" && isEnabled)
                  ? "border-[var(--gold)] bg-[#151f33] shadow-[var(--gold)]/5"
                  : "border-[var(--line)] bg-[var(--bg1)] opacity-70 hover:opacity-100"
              }`}
            >
              <div>
                {/* Card Header */}
                <div className="flex items-center justify-between mb-2">
                  <span
                    className="text-[9px] px-2 py-0.5 rounded font-extrabold tracking-wider"
                    style={{
                      background: isEnabled ? "rgba(47,201,143,0.15)" : "rgba(255,255,255,0.06)",
                      color: isEnabled ? "var(--long)" : "var(--dim)",
                    }}
                  >
                    {s.tag}
                  </span>

                  {cfg.strategyMode === "multi_confluence" ? (
                    <button
                      onClick={() => toggleStrategy(s.id)}
                      className={`px-2.5 py-1 rounded text-[10px] font-black transition-all ${
                        isEnabled
                          ? "bg-[var(--long)] text-black"
                          : "border border-[var(--dim)] text-[var(--dim)] hover:text-white"
                      }`}
                    >
                      {isEnabled ? "✓ ENABLED" : "DISABLED"}
                    </button>
                  ) : (
                    <button
                      onClick={() => onCfg({ selectedStrategy: s.id })}
                      className={`px-2.5 py-1 rounded text-[10px] font-black transition-all ${
                        isSingleSelected
                          ? "bg-[var(--gold)] text-black"
                          : "border border-[var(--dim)] text-[var(--dim)] hover:text-white"
                      }`}
                    >
                      {isSingleSelected ? "★ ACTIVE" : "SELECT"}
                    </button>
                  )}
                </div>

                <h3 className="font-bold text-[13px] text-white tracking-wide">{s.name}</h3>
                <p className="text-[10.5px] text-[var(--muted)] mt-1.5 leading-relaxed line-clamp-3">
                  {s.description}
                </p>

                {/* Metrics Badges */}
                <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-[var(--line)] text-[10px]">
                  <div className="rounded border p-1.5 bg-[#090d16]" style={{ borderColor: "var(--line)" }}>
                    <span className="text-[8px] text-[var(--dim)] block">EST. WIN RATE</span>
                    <span className="font-bold text-[var(--long)]">{s.winRateEst}</span>
                  </div>

                  <div className="rounded border p-1.5 bg-[#090d16]" style={{ borderColor: "var(--line)" }}>
                    <span className="text-[8px] text-[var(--dim)] block">TARGET R:R</span>
                    <span className="font-bold text-[var(--gold)]">{s.rrTarget}</span>
                  </div>
                </div>
              </div>

              {/* Rules List */}
              <div className="mt-3 pt-3 border-t border-[var(--line)]/60 space-y-1">
                <span className="text-[8.5px] font-bold text-[var(--dim)] uppercase tracking-wider block">
                  KEY ENTRY CONDITIONS
                </span>
                <ul className="space-y-1 text-[9.5px] text-[var(--muted)]">
                  {s.rules.slice(0, 2).map((r, i) => (
                    <li key={i} className="truncate">
                      • {r}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
