import { useState } from "react";
import { STRATEGY_DEFINITIONS, StrategyDefinition, StrategyId } from "../engine/types";

export default function VisualAcademyView() {
  const [selectedStrategyId, setSelectedStrategyId] = useState<StrategyId>("sweep_reversal");
  const [direction, setDirection] = useState<"bullish" | "bearish">("bullish");

  const strat = STRATEGY_DEFINITIONS.find((s) => s.id === selectedStrategyId) || STRATEGY_DEFINITIONS[0];
  const setup = direction === "bullish" ? strat.bullishSetup : strat.bearishSetup;

  return (
    <div className="space-y-4 font-mono text-[11.5px] p-2 md:p-4 max-w-[1720px] mx-auto animate-fade-in">
      {/* Top Banner */}
      <div
        className="rounded-xl border p-4 shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-3"
        style={{ borderColor: "var(--line)", background: "linear-gradient(180deg, #131c2d 0%, #0e1522 100%)" }}
      >
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--gold)] text-black font-extrabold text-xs">
              📖
            </span>
            <h1 className="text-base font-bold text-white tracking-wide">
              VISUAL STRATEGY ACADEMY · BEGINNER-TO-PRO REFERENCE
            </h1>
          </div>
          <p className="text-[11px] text-[var(--muted)] mt-1">
            Visual candlestick illustrations showing the exact institutional mechanics, entry triggers, stop-loss protection, and take-profit targets for every strategy in the engine.
          </p>
        </div>

        {/* Direction Switcher */}
        <div className="flex items-center rounded-lg border p-0.5 bg-[#090d16]" style={{ borderColor: "var(--line)" }}>
          <button
            onClick={() => setDirection("bullish")}
            className={`px-3 py-1.5 rounded-md font-bold text-[11px] transition-all flex items-center gap-1.5 ${
              direction === "bullish"
                ? "bg-[#2fc98f] text-black shadow-md font-extrabold"
                : "text-[var(--muted)] hover:text-white"
            }`}
          >
            <span>▲ BULLISH (LONG)</span>
          </button>
          <button
            onClick={() => setDirection("bearish")}
            className={`px-3 py-1.5 rounded-md font-bold text-[11px] transition-all flex items-center gap-1.5 ${
              direction === "bearish"
                ? "bg-[#f0546c] text-black shadow-md font-extrabold"
                : "text-[var(--muted)] hover:text-white"
            }`}
          >
            <span>▼ BEARISH (SHORT)</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Strategy Tabs (Left) + Visual Reference & Diagram (Center/Right) */}
      <div className="grid grid-cols-12 gap-4">
        {/* Left: Strategy Selector Cards */}
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-2.5">
          {STRATEGY_DEFINITIONS.map((s) => {
            const isSel = s.id === selectedStrategyId;
            return (
              <button
                key={s.id}
                onClick={() => setSelectedStrategyId(s.id)}
                className={`w-full text-left p-3.5 rounded-xl border transition-all relative overflow-hidden ${
                  isSel
                    ? "border-[var(--gold)] bg-[#172237] shadow-lg shadow-[var(--gold)]/5"
                    : "border-[var(--line)] bg-[var(--bg1)] hover:bg-[var(--bg2)]"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className="text-[9px] px-1.5 py-0.5 rounded font-extrabold tracking-wider"
                    style={{
                      background: isSel ? "rgba(232,180,76,0.2)" : "rgba(255,255,255,0.06)",
                      color: isSel ? "var(--gold-hi)" : "var(--dim)",
                    }}
                  >
                    {s.tag}
                  </span>
                  <span className="text-[10px] text-[var(--long)] font-bold">{s.winRateEst} Win</span>
                </div>

                <div className="font-bold text-[12.5px] text-white tracking-wide">{s.name}</div>
                <div className="text-[10.5px] text-[var(--muted)] mt-1 line-clamp-2 leading-relaxed">
                  {s.description}
                </div>

                <div className="flex items-center gap-3 mt-2.5 pt-2 border-t border-[var(--line)]/50 text-[10px] text-[var(--dim)]">
                  <span>R:R: <strong className="text-[var(--gold)]">{s.rrTarget}</strong></span>
                  <span>·</span>
                  <span>Type: <strong className="text-white">{s.category}</strong></span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Right: Interactive Candlestick Visual Diagram & Execution Details */}
        <div className="col-span-12 lg:col-span-8 flex flex-col gap-4">
          {/* Visual Candlestick Diagram Box */}
          <div
            className="rounded-xl border p-5 shadow-xl flex flex-col"
            style={{ borderColor: "var(--line)", background: "linear-gradient(180deg, #0e1522 0%, #0a0f18 100%)" }}
          >
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between border-b pb-3 mb-4" style={{ borderColor: "var(--line)" }}>
              <div>
                <span className="text-[10px] text-[var(--gold)] font-bold tracking-widest uppercase">
                  VISUAL CANDLESTICK BLUEPRINT · {direction.toUpperCase()}
                </span>
                <h2 className="text-sm md:text-base font-bold text-white mt-0.5">{setup.title}</h2>
              </div>

              <span
                className="px-2.5 py-1 rounded-md text-[10px] font-black tracking-wider"
                style={{
                  background: direction === "bullish" ? "rgba(47,201,143,0.18)" : "rgba(240,84,108,0.18)",
                  color: direction === "bullish" ? "var(--long)" : "var(--short)",
                  border: `1px solid ${direction === "bullish" ? "var(--long)" : "var(--short)"}44`,
                }}
              >
                {direction === "bullish" ? "BUY / LONG SETUP" : "SELL / SHORT SETUP"}
              </span>
            </div>

            {/* SVG Visual Candlestick Representation */}
            <div className="w-full h-[260px] rounded-lg border bg-[#060910] relative flex items-center justify-center overflow-hidden p-2" style={{ borderColor: "var(--line)" }}>
              <svg viewBox="0 0 700 240" className="w-full h-full">
                {/* Background grid lines */}
                <line x1="0" y1="40" x2="700" y2="40" stroke="#141e2e" strokeDasharray="4,4" />
                <line x1="0" y1="120" x2="700" y2="120" stroke="#141e2e" strokeDasharray="4,4" />
                <line x1="0" y1="190" x2="700" y2="190" stroke="#141e2e" strokeDasharray="4,4" />

                {direction === "bullish" ? (
                  <>
                    {/* Key Support Level Line (e.g. PDL / Session Low) */}
                    <line x1="60" y1="160" x2="640" y2="160" stroke="#e8b44c" strokeWidth="1.8" strokeDasharray="6,4" />
                    <text x="70" y="152" fill="#e8b44c" fontSize="10" fontWeight="bold" fontFamily="monospace">
                      LIQUIDITY POOL / PRIOR DAY LOW (PDL) SUPPORT
                    </text>

                    {/* Candle 1: Normal Bearish Approach */}
                    <line x1="180" y1="90" x2="180" y2="155" stroke="#f0546c" strokeWidth="1.5" />
                    <rect x="168" y="100" width="24" height="45" fill="#f0546c" rx="2" />

                    {/* Candle 2: The Liquidity Sweep & Pin Rejection (LPR) */}
                    <line x1="260" y1="110" x2="260" y2="215" stroke="#2fc98f" strokeWidth="2" />
                    <rect x="248" y="115" width="24" height="28" fill="#2fc98f" rx="2" />
                    {/* Sweep highlight circle */}
                    <circle cx="260" cy="210" r="10" fill="none" stroke="#f0546c" strokeWidth="1.5" strokeDasharray="2,2" />
                    <text x="280" y="215" fill="#f0546c" fontSize="9.5" fontWeight="bold" fontFamily="monospace">
                      ⚡ LIQUIDITY SWEPT (STOP HUNT)
                    </text>

                    {/* Candle 3: Bullish Confirmation Entry Candle */}
                    <line x1="340" y1="80" x2="340" y2="145" stroke="#2fc98f" strokeWidth="1.5" />
                    <rect x="328" y="85" width="24" height="50" fill="#2fc98f" rx="2" />

                    {/* Target lines: Entry, Stop Loss, Take Profit */}
                    {/* Entry Line */}
                    <line x1="328" y1="85" x2="620" y2="85" stroke="#388bfd" strokeWidth="1.8" strokeDasharray="4,4" />
                    <rect x="500" y="73" width="115" height="18" fill="#388bfd" rx="3" />
                    <text x="506" y="86" fill="#000" fontSize="9" fontWeight="900" fontFamily="monospace">
                      🎯 ENTRY TRIGGER @ CLOSE
                    </text>

                    {/* Take Profit Line (1:2 R:R) */}
                    <line x1="328" y1="35" x2="620" y2="35" stroke="#2fc98f" strokeWidth="2" />
                    <rect x="500" y="23" width="115" height="18" fill="#2fc98f" rx="3" />
                    <text x="508" y="36" fill="#000" fontSize="9" fontWeight="900" fontFamily="monospace">
                      💰 TAKE PROFIT (1:2.0+ R:R)
                    </text>

                    {/* Stop Loss Line */}
                    <line x1="248" y1="220" x2="620" y2="220" stroke="#f0546c" strokeWidth="2" />
                    <rect x="500" y="208" width="115" height="18" fill="#f0546c" rx="3" />
                    <text x="508" y="221" fill="#000" fontSize="9" fontWeight="900" fontFamily="monospace">
                      🛑 STOP LOSS (SAFE BUFFER)
                    </text>
                  </>
                ) : (
                  <>
                    {/* Key Resistance Level Line (e.g. PDH / Session High) */}
                    <line x1="60" y1="80" x2="640" y2="80" stroke="#e8b44c" strokeWidth="1.8" strokeDasharray="6,4" />
                    <text x="70" y="72" fill="#e8b44c" fontSize="10" fontWeight="bold" fontFamily="monospace">
                      LIQUIDITY POOL / PRIOR DAY HIGH (PDH) RESISTANCE
                    </text>

                    {/* Candle 1: Normal Bullish Approach */}
                    <line x1="180" y1="85" x2="180" y2="150" stroke="#2fc98f" strokeWidth="1.5" />
                    <rect x="168" y="95" width="24" height="45" fill="#2fc98f" rx="2" />

                    {/* Candle 2: The Liquidity Sweep & Pin Rejection (HPR) */}
                    <line x1="260" y1="25" x2="260" y2="130" stroke="#f0546c" strokeWidth="2" />
                    <rect x="248" y="100" width="24" height="28" fill="#f0546c" rx="2" />
                    {/* Sweep highlight circle */}
                    <circle cx="260" cy="30" r="10" fill="none" stroke="#2fc98f" strokeWidth="1.5" strokeDasharray="2,2" />
                    <text x="280" y="32" fill="#2fc98f" fontSize="9.5" fontWeight="bold" fontFamily="monospace">
                      ⚡ BUY-SIDE LIQUIDITY SWEPT
                    </text>

                    {/* Candle 3: Bearish Confirmation Entry Candle */}
                    <line x1="340" y1="95" x2="340" y2="160" stroke="#f0546c" strokeWidth="1.5" />
                    <rect x="328" y="105" width="24" height="50" fill="#f0546c" rx="2" />

                    {/* Target lines: Entry, Stop Loss, Take Profit */}
                    {/* Stop Loss Line */}
                    <line x1="248" y1="20" x2="620" y2="20" stroke="#f0546c" strokeWidth="2" />
                    <rect x="500" y="8" width="115" height="18" fill="#f0546c" rx="3" />
                    <text x="508" y="21" fill="#000" fontSize="9" fontWeight="900" fontFamily="monospace">
                      🛑 STOP LOSS (SAFE BUFFER)
                    </text>

                    {/* Entry Line */}
                    <line x1="328" y1="155" x2="620" y2="155" stroke="#388bfd" strokeWidth="1.8" strokeDasharray="4,4" />
                    <rect x="500" y="143" width="115" height="18" fill="#388bfd" rx="3" />
                    <text x="506" y="156" fill="#000" fontSize="9" fontWeight="900" fontFamily="monospace">
                      🎯 ENTRY TRIGGER @ CLOSE
                    </text>

                    {/* Take Profit Line (1:2 R:R) */}
                    <line x1="328" y1="205" x2="620" y2="205" stroke="#2fc98f" strokeWidth="2" />
                    <rect x="500" y="193" width="115" height="18" fill="#2fc98f" rx="3" />
                    <text x="508" y="206" fill="#000" fontSize="9" fontWeight="900" fontFamily="monospace">
                      💰 TAKE PROFIT (1:2.0+ R:R)
                    </text>
                  </>
                )}
              </svg>
            </div>

            {/* Step-by-Step Execution Plan Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
              <div className="rounded-lg border p-3 bg-[#090d16]" style={{ borderColor: "var(--line)" }}>
                <span className="text-[9px] text-[var(--gold)] font-bold uppercase tracking-wider block mb-1">
                  1. ENTRY TRIGGER
                </span>
                <p className="text-[11px] text-white leading-snug">{setup.entryTrigger}</p>
              </div>

              <div className="rounded-lg border p-3 bg-[#090d16]" style={{ borderColor: "rgba(240,84,108,0.3)" }}>
                <span className="text-[9px] text-[#f0546c] font-bold uppercase tracking-wider block mb-1">
                  2. STOP LOSS PLACEMENT
                </span>
                <p className="text-[11px] text-white leading-snug">{setup.slPlacement}</p>
              </div>

              <div className="rounded-lg border p-3 bg-[#090d16]" style={{ borderColor: "rgba(47,201,143,0.3)" }}>
                <span className="text-[9px] text-[#2fc98f] font-bold uppercase tracking-wider block mb-1">
                  3. TAKE PROFIT TARGET
                </span>
                <p className="text-[11px] text-white leading-snug">{setup.tpPlacement}</p>
              </div>
            </div>
          </div>

          {/* Strategy Deep Dive & Rules */}
          <div
            className="rounded-xl border p-5 shadow-lg space-y-3"
            style={{ borderColor: "var(--line)", background: "var(--bg1)" }}
          >
            <h3 className="font-bold text-white text-[12.5px] flex items-center gap-2">
              <span>🧠</span>
              <span>HOW THIS INSTITUTIONAL LOGIC WORKS</span>
            </h3>

            <p className="text-[11px] text-[var(--muted)] leading-relaxed">{strat.description}</p>

            <div className="rounded-lg border p-3 space-y-2 bg-[#090d16]" style={{ borderColor: "var(--line)" }}>
              <div className="text-[9.5px] font-bold text-[var(--dim)] uppercase tracking-wider">
                ALGORITHM VERIFICATION CHECKLIST
              </div>
              <ul className="space-y-1.5 text-[11px] text-white">
                {strat.rules.map((r, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-[var(--gold)] font-bold">✓</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
