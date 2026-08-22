import type { EngineConfig, EngineState, StrategyId } from "../engine/types";
import { STRATEGY_DEFINITIONS } from "../engine/types";

interface Props {
  st: EngineState;
  cfg: EngineConfig;
  onCfg: (p: Partial<EngineConfig>) => void;
}

export default function StrategyRadar({ st, cfg, onCfg }: Props) {
  const lastBar = st.bars[st.bars.length - 1];
  const lastCls = st.classes[st.classes.length - 1] || "NEUTRAL";
  const lastEval = st.lastEval;
  const aois = st.aois.filter((a) => a.active);

  // Active strategy
  const activeStrat =
    STRATEGY_DEFINITIONS.find((s) => s.id === cfg.selectedStrategy) || STRATEGY_DEFINITIONS[0];

  // Check 1: AOI Contact
  const price = lastBar ? lastBar.c : st.price;
  const contactedAoi = aois.find((a) => Math.abs(price - a.ty) <= st.atr * 0.4);

  // Check 2: Rejection Wick / Reaction Candle
  const isRejection = lastCls === "LPR" || lastCls === "HPR" || lastCls.startsWith("POWER");

  // Check 3: Risk floor
  const rrFloorOk = cfg.rr >= 2.0;

  // Check 4: Discipline & Daily SL
  const disciplineOk = st.dailySL < cfg.maxDailySL && !st.halted;

  const enabledCount = Object.values(cfg.enabledStrategies).filter(Boolean).length;

  return (
    <div className="rounded-xl border overflow-hidden shadow-xl font-mono text-[11px] flex flex-col bg-[var(--bg1)]" style={{ borderColor: "var(--line)" }}>
      {/* Header */}
      <div
        className="flex items-center justify-between border-b px-3 py-2 bg-[#090d16]"
        style={{ borderColor: "var(--line)" }}
      >
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[var(--gold)] animate-ping" />
          <span className="font-extrabold text-white text-[11px] tracking-wider">STRATEGY RADAR</span>
        </div>

        <span
          className="px-2 py-0.5 rounded text-[8.5px] font-black tracking-wider"
          style={{
            background: cfg.strategyMode === "multi_confluence" ? "rgba(47,201,143,0.15)" : "rgba(232,180,76,0.15)",
            color: cfg.strategyMode === "multi_confluence" ? "var(--long)" : "var(--gold)",
          }}
        >
          {cfg.strategyMode === "multi_confluence" ? `CONFLUENCE (${enabledCount})` : "SINGLE FOCUS"}
        </span>
      </div>

      <div className="p-3 space-y-3">
        {/* Strategy Selector */}
        <div>
          <div className="flex items-center justify-between text-[9px] text-[var(--dim)] mb-1 font-bold">
            <span>ACTIVE STRATEGY</span>
            <span className="text-[var(--long)] font-bold">{activeStrat.winRateEst} Win</span>
          </div>

          <select
            value={cfg.selectedStrategy || "sweep_reversal"}
            onChange={(e) => onCfg({ selectedStrategy: e.target.value as StrategyId })}
            className="w-full rounded-lg border px-2.5 py-1.5 font-bold text-[11.5px] outline-none cursor-pointer bg-[#090d16] text-[var(--gold-hi)]"
            style={{ borderColor: "var(--line)" }}
          >
            {STRATEGY_DEFINITIONS.map((s) => (
              <option key={s.id} value={s.id} className="bg-[#0e1522] text-white">
                {s.name}
              </option>
            ))}
          </select>

          <div className="text-[10px] text-[var(--muted)] mt-1 line-clamp-2 leading-snug">
            {activeStrat.description}
          </div>
        </div>

        {/* Live Step-by-Step Condition Matrix */}
        <div className="rounded-lg border p-2.5 space-y-2 bg-[#090d16]" style={{ borderColor: "var(--line)" }}>
          <div className="text-[8.5px] font-bold text-[var(--dim)] tracking-wider border-b pb-1 flex items-center justify-between" style={{ borderColor: "var(--line)" }}>
            <span>LIVE 5-STEP TRIGGER CHECKLIST</span>
            <span className="text-[var(--gold)]">{cfg.strategyMode.toUpperCase()}</span>
          </div>

          {/* Step 1 */}
          <div className="flex items-center justify-between text-[10.5px]">
            <div className="flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${contactedAoi ? "bg-[var(--long)]" : "bg-[var(--dim)]"}`} />
              <span className={contactedAoi ? "text-white font-semibold" : "text-[var(--muted)]"}>
                1. Institutional Level Contact
              </span>
            </div>
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded"
              style={{
                background: contactedAoi ? "rgba(47,201,143,0.15)" : "rgba(255,255,255,0.05)",
                color: contactedAoi ? "var(--long)" : "var(--dim)",
              }}
            >
              {contactedAoi ? contactedAoi.label : "Scanning..."}
            </span>
          </div>

          {/* Step 2 */}
          <div className="flex items-center justify-between text-[10.5px]">
            <div className="flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${isRejection ? "bg-[var(--long)]" : "bg-[var(--dim)]"}`} />
              <span className={isRejection ? "text-white font-semibold" : "text-[var(--muted)]"}>
                2. Wick Rejection / Power Candle
              </span>
            </div>
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded"
              style={{
                background: isRejection ? "rgba(47,201,143,0.15)" : "rgba(255,255,255,0.05)",
                color: isRejection ? "var(--long)" : "var(--dim)",
              }}
            >
              {lastCls}
            </span>
          </div>

          {/* Step 3 */}
          <div className="flex items-center justify-between text-[10.5px]">
            <div className="flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${rrFloorOk ? "bg-[var(--long)]" : "bg-[var(--short)]"}`} />
              <span className="text-white font-semibold">3. Minimum 1:2.0+ R:R Floor</span>
            </div>
            <span className="text-[9px] font-bold text-[var(--gold)]">
              {cfg.rr.toFixed(1)}:1 R:R
            </span>
          </div>

          {/* Step 4 */}
          <div className="flex items-center justify-between text-[10.5px]">
            <div className="flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${disciplineOk ? "bg-[var(--long)]" : "bg-[var(--short)]"}`} />
              <span className={disciplineOk ? "text-white font-semibold" : "text-[var(--short)]"}>
                4. Daily Discipline Guard
              </span>
            </div>
            <span
              className="text-[9px] font-bold"
              style={{ color: disciplineOk ? "var(--long)" : "var(--short)" }}
            >
              {st.dailySL}/{cfg.maxDailySL} SL HITS
            </span>
          </div>

          {/* Step 5 */}
          <div className="flex items-center justify-between text-[10.5px]">
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--gold)]" />
              <span className="text-white font-semibold">5. Execution Gateway</span>
            </div>
            <span className="text-[9px] font-bold text-[var(--gold-hi)]">
              {cfg.actionCenter ? "ACTION CENTER (MANUAL)" : "AUTO DISPATCH"}
            </span>
          </div>
        </div>

        {/* Engine Live Verdict Summary */}
        <div className="rounded-lg border px-2.5 py-1.5 text-[10px] bg-[#090d16]" style={{ borderColor: "var(--line)" }}>
          <span className="text-[var(--dim)]">VERDICT: </span>
          <span className="font-bold text-white">{lastEval.verdict || "Monitoring live bars..."}</span>
        </div>
      </div>
    </div>
  );
}
