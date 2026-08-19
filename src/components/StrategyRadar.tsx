import type { EngineConfig, EngineState } from "../engine/types";
import { fmtP } from "../engine/types";

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

  // Check 1: AOI Contact
  const price = lastBar ? lastBar.c : st.price;
  const contactedAoi = aois.find((a) => Math.abs(price - a.ty) <= st.atr * 0.4);

  // Check 2: Rejection Wick / Reaction Candle
  const isRejection = lastCls === "LPR" || lastCls === "HPR" || lastCls.startsWith("POWER");

  // Check 3: Risk floor
  const rrFloorOk = cfg.rr >= 2.0;

  // Check 4: Discipline & Daily SL
  const disciplineOk = st.dailySL < cfg.maxDailySL && !st.halted;

  const strategies = [
    {
      id: "reversal",
      name: "1. Liquidity Trap & Sweep (Core)",
      desc: "Hunts false breakouts at PDH/PDL & Session Extremes, entering on rejection wicks back inside.",
      edge: "High Win Rate (~62-68%) with 1:2 R:R",
    },
    {
      id: "breakout",
      name: "2. Momentum Breakout & FVG Retest",
      desc: "Waits for power candle to break past AOI, enters on consolidation retest.",
      edge: "High R-Multiples (1:3 to 1:4 R:R) in trending markets",
    },
  ];

  return (
    <div
      className="rounded-lg border overflow-hidden shadow-lg font-mono text-[11px] flex flex-col"
      style={{ borderColor: "var(--line)", background: "var(--bg1)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between border-b px-3 py-2"
        style={{ borderColor: "var(--line)", background: "var(--bg2)" }}
      >
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[var(--gold)] animate-ping" />
          <span className="font-bold text-white text-[11.5px]">STRATEGY RADAR & INSPECTOR</span>
        </div>
        <span
          className="px-1.5 py-0.5 rounded text-[9px] font-bold"
          style={{
            background: cfg.identity === "reversal" ? "rgba(47,201,143,0.15)" : "rgba(232,180,76,0.15)",
            color: cfg.identity === "reversal" ? "var(--long)" : "var(--gold)",
          }}
        >
          {cfg.identity === "reversal" ? "REVERSAL TRAP" : "BREAKOUT"}
        </span>
      </div>

      <div className="p-3 space-y-3.5">
        {/* Strategy Selector */}
        <div>
          <span className="block text-[9px] text-[var(--dim)] mb-1 font-bold">ACTIVE STRATEGY ALGORITHM</span>
          <select
            value={cfg.identity}
            onChange={(e) => onCfg({ identity: e.target.value as "reversal" | "breakout" })}
            className="w-full rounded border px-2.5 py-1.5 font-bold text-[11.5px] outline-none cursor-pointer"
            style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--ink)" }}
          >
            <option value="reversal">Strategy 1: Liquidity Trap & Sweep (Course Core)</option>
            <option value="breakout">Strategy 2: Momentum Breakout & FVG Retest</option>
          </select>
          <div className="text-[10px] text-[var(--muted)] mt-1 leading-snug">
            {strategies.find((s) => s.id === cfg.identity)?.desc}
          </div>
        </div>

        {/* Live Step-by-Step Condition Matrix */}
        <div className="rounded border p-2.5 space-y-2" style={{ borderColor: "var(--line)", background: "var(--bg2)" }}>
          <div className="text-[9px] font-bold text-[var(--dim)] tracking-wider border-b pb-1" style={{ borderColor: "var(--line)" }}>
            LIVE 5-STEP TRIGGER CHECKLIST (CURRENT BAR)
          </div>

          {/* Step 1 */}
          <div className="flex items-center justify-between text-[10.5px]">
            <div className="flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${contactedAoi ? "bg-[var(--long)]" : "bg-[var(--dim)]"}`} />
              <span className={contactedAoi ? "text-white font-semibold" : "text-[var(--muted)]"}>
                1. Institutional AOI Contact
              </span>
            </div>
            <span
              className="text-[9.5px] font-bold px-1 rounded"
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
                2. Candle Rejection / Wick Math
              </span>
            </div>
            <span
              className="text-[9.5px] font-bold px-1 rounded"
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
              <span className="text-white font-semibold">3. Minimum Risk Floor (1:2+ R:R)</span>
            </div>
            <span className="text-[9.5px] font-bold text-[var(--gold)]">
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
              className="text-[9.5px] font-bold"
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
            <span className="text-[9.5px] font-bold text-[var(--gold-hi)]">
              {cfg.actionCenter ? "ACTION CENTER (MANUAL)" : "AUTO DISPATCH"}
            </span>
          </div>
        </div>

        {/* Engine Live Verdict Summary */}
        <div className="rounded border px-2.5 py-1.5 text-[10px]" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
          <span className="text-[var(--dim)]">ENGINE STATE: </span>
          <span className="font-bold text-white">{lastEval.verdict || "Monitoring live bars..."}</span>
        </div>
      </div>
    </div>
  );
}
