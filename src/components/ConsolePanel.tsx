import { useState, type CSSProperties } from "react";
import type { EngineConfig, EngineState, StrategyId } from "../engine/types";
import { fmtP, fmtUSD, STRATEGY_DEFINITIONS } from "../engine/types";
import type { Stats } from "../engine/engine";

interface Props {
  cfg: EngineConfig;
  onCfg: (p: Partial<EngineConfig>) => void;
  onAoi: (p: Partial<EngineConfig["aoi"]>) => void;
  st: EngineState;
  stats: Stats;
}

function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
}) {
  const pct = ((props.value - props.min) / (props.max - props.min)) * 100;
  return (
    <label className="block">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-mono text-[9px] tracking-[0.16em] text-[var(--muted)]">{props.label}</span>
        <span className="font-mono text-[10.5px] font-bold text-[var(--gold-hi)]">{props.display}</span>
      </div>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(parseFloat(e.target.value))}
        className="w-full accent-[var(--gold)]"
        style={{ "--fill": `${pct}%` } as CSSProperties}
      />
    </label>
  );
}

function Toggle({
  label,
  desc,
  on,
  onChange,
}: {
  label: string;
  desc: string;
  on: boolean;
  onChange: () => void;
}) {
  return (
    <button
      onClick={onChange}
      className="group flex w-full items-center justify-between gap-2.5 rounded-lg border px-3 py-2 text-left transition-all duration-200"
      style={{
        borderColor: on ? "var(--line)" : "var(--line-soft)",
        background: on ? "var(--bg2)" : "var(--bg1)",
        opacity: on ? 1 : 0.6,
      }}
    >
      <div>
        <span
          className="block font-mono text-[10.5px] font-bold tracking-wide"
          style={{ color: on ? "var(--ink)" : "var(--muted)" }}
        >
          {label}
        </span>
        <span className="block font-body text-[9.5px] text-[var(--dim)] leading-tight mt-0.5">
          {desc}
        </span>
      </div>
      <span
        className="relative h-4 w-7 shrink-0 rounded-full transition-colors duration-200"
        style={{ background: on ? "rgba(232,180,76,0.35)" : "var(--bg3)" }}
      >
        <span
          className="absolute top-0.5 h-3 w-3 rounded-full transition-all duration-200"
          style={{
            left: on ? "14px" : "2px",
            background: on ? "var(--gold)" : "var(--dim)",
          }}
        />
      </span>
    </button>
  );
}

export default function ConsolePanel({ cfg, onCfg, onAoi, st, stats }: Props) {
  // Collapsible section states
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    s1_gateway: true,
    s2_strategy: true,
    s3_structure: false,
    s4_candles: false,
    s5_risk: true,
    s6_discipline: false,
  });

  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Live estimated risk calculations
  const slEst = Math.max(st.atr + Math.max(0.12 * st.atr, 0.25), 0.5) + cfg.spread / 2;
  const targetRisk =
    cfg.sizingMode === "percentEquity"
      ? st.balance * ((cfg.equityRiskPct || 2.0) / 100)
      : cfg.sizingMode === "fractionalKelly"
      ? st.balance * Math.max(0.01, (cfg.kellyFraction || 0.35) * 0.04)
      : cfg.riskUSD;

  const ozEst = Math.min(targetRisk / (slEst * cfg.pointValue), 300);
  const tpEst = slEst * cfg.rr;

  // 1-Click Institutional Presets
  const applyPreset = (preset: "prop_firm" | "day_trader" | "momentum" | "scalper") => {
    switch (preset) {
      case "prop_firm":
        onCfg({
          sizingMode: "percentEquity",
          equityRiskPct: 1.0,
          maxDailySL: 2,
          rejThresh: 0.65,
          rr: 2.5,
          autoBreakeven: true,
          trailingStop: true,
          strategyMode: "single",
        });
        break;
      case "day_trader":
        onCfg({
          sizingMode: "percentEquity",
          equityRiskPct: 2.0,
          maxDailySL: 2,
          rejThresh: 0.55,
          rr: 2.0,
          autoBreakeven: true,
          trailingStop: true,
          strategyMode: "multi_confluence",
          minConfluenceCount: 2,
        });
        break;
      case "momentum":
        onCfg({
          sizingMode: "percentEquity",
          equityRiskPct: 2.5,
          maxDailySL: 3,
          rejThresh: 0.48,
          powerAtr: 1.3,
          rr: 3.0,
          trailingStop: true,
          selectedStrategy: "session_breakout",
        });
        break;
      case "scalper":
        onCfg({
          sizingMode: "percentEquity",
          equityRiskPct: 0.75,
          maxDailySL: 3,
          rejThresh: 0.5,
          rr: 1.5,
          autoBreakeven: true,
          beThresholdR: 0.8,
          selectedStrategy: "rsi_exhaustion",
        });
        break;
    }
  };

  return (
    <div
      className="rounded-xl border overflow-hidden shadow-xl font-mono text-[11px] flex flex-col bg-[var(--bg1)]"
      style={{ borderColor: "var(--line)" }}
    >
      {/* Header with Title & Quick Presets */}
      <div
        className="border-b p-3 bg-[#090d16]"
        style={{ borderColor: "var(--line)" }}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded bg-[var(--gold)] text-black font-black text-[10px]">
              ⚙
            </span>
            <span className="font-extrabold text-white text-[11.5px] tracking-wider">
              ENGINE CONTROLS & RISK DESK
            </span>
          </div>

          <span className="text-[8.5px] px-1.5 py-0.5 rounded font-black bg-[var(--gold)]/15 text-[var(--gold)]">
            INSTITUTIONAL
          </span>
        </div>

        {/* 1-Click Quick Presets Row */}
        <div>
          <span className="text-[8px] text-[var(--dim)] font-bold uppercase tracking-wider block mb-1">
            QUICK STRATEGY PRESETS
          </span>
          <div className="grid grid-cols-4 gap-1 text-[9px]">
            <button
              onClick={() => applyPreset("prop_firm")}
              className="py-1 px-1 rounded border border-[#2fc98f]/40 bg-[#2fc98f]/10 text-[#2fc98f] font-bold hover:bg-[#2fc98f]/20 transition-all truncate"
              title="1% Risk · 1:2.5 R:R · Conservative"
            >
              🛡️ Prop Firm
            </button>
            <button
              onClick={() => applyPreset("day_trader")}
              className="py-1 px-1 rounded border border-[var(--gold)]/40 bg-[var(--gold)]/10 text-[var(--gold)] font-bold hover:bg-[var(--gold)]/20 transition-all truncate"
              title="2% Risk · 1:2.0 R:R · Balanced"
            >
              ⚡ Day Trade
            </button>
            <button
              onClick={() => applyPreset("momentum")}
              className="py-1 px-1 rounded border border-[#388bfd]/40 bg-[#388bfd]/10 text-[#388bfd] font-bold hover:bg-[#388bfd]/20 transition-all truncate"
              title="2.5% Risk · 1:3.0 R:R · Trend Breakouts"
            >
              🚀 Momentum
            </button>
            <button
              onClick={() => applyPreset("scalper")}
              className="py-1 px-1 rounded border border-[#a371f7]/40 bg-[#a371f7]/10 text-[#a371f7] font-bold hover:bg-[#a371f7]/20 transition-all truncate"
              title="0.75% Risk · 1:1.5 R:R · Quick Scalps"
            >
              🎯 Scalper
            </button>
          </div>
        </div>
      </div>

      {/* Accordion Pipeline Sections (Stages 1 through 6) */}
      <div className="p-2.5 space-y-2 max-h-[620px] overflow-y-auto">
        {/* STAGE 1: EXECUTION GATEWAY */}
        <div className="rounded-lg border overflow-hidden bg-[#090d16]" style={{ borderColor: "var(--line)" }}>
          <button
            onClick={() => toggleSection("s1_gateway")}
            className="w-full px-3 py-2 flex items-center justify-between font-bold text-[10px] text-[var(--gold-hi)] bg-[var(--bg2)] hover:bg-[#151f31] transition-all"
          >
            <span>STAGE 1 · EXECUTION GATEWAY</span>
            <span>{openSections.s1_gateway ? "▲" : "▼"}</span>
          </button>

          {openSections.s1_gateway && (
            <div className="p-2.5 space-y-1.5">
              <Toggle
                label="ACTION CENTER (SUPERVISED QUEUE)"
                desc="Signals queue for your manual approve / reject — every decision scored"
                on={cfg.actionCenter}
                onChange={() => onCfg({ actionCenter: !cfg.actionCenter })}
              />
              <Toggle
                label="TRADING HOURS WINDOW"
                desc="Enforces trading only during marked schedule hours"
                on={cfg.windowEnabled}
                onChange={() => onCfg({ windowEnabled: !cfg.windowEnabled })}
              />
              <Toggle
                label="KILLZONE SESSION FILTER"
                desc="Only allows entries during London (07–11:30) & NY (13–17) killzones"
                on={cfg.killzoneFilter ?? true}
                onChange={() => onCfg({ killzoneFilter: !(cfg.killzoneFilter ?? true) })}
              />
              <Toggle
                label="EMA TREND REGIME FILTER"
                desc="Blocks counter-trend entries using 50/200 EMA alignment"
                on={cfg.trendFilter ?? true}
                onChange={() => onCfg({ trendFilter: !(cfg.trendFilter ?? true) })}
              />
            </div>
          )}
        </div>

        {/* STAGE 2: STRATEGY CORE & CONFLUENCE */}
        <div className="rounded-lg border overflow-hidden bg-[#090d16]" style={{ borderColor: "var(--line)" }}>
          <button
            onClick={() => toggleSection("s2_strategy")}
            className="w-full px-3 py-2 flex items-center justify-between font-bold text-[10px] text-[var(--gold-hi)] bg-[var(--bg2)] hover:bg-[#151f31] transition-all"
          >
            <span>STAGE 2 · STRATEGY CORE & CONFLUENCE</span>
            <span>{openSections.s2_strategy ? "▲" : "▼"}</span>
          </button>

          {openSections.s2_strategy && (
            <div className="p-2.5 space-y-2.5">
              <div>
                <span className="text-[8.5px] text-[var(--dim)] font-bold block mb-1">EXECUTION MODE</span>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => onCfg({ strategyMode: "single" })}
                    className={`py-1 px-2 rounded font-bold text-[9.5px] transition-all ${
                      cfg.strategyMode === "single"
                        ? "bg-[var(--gold)] text-black font-black"
                        : "border border-[var(--line)] text-[var(--muted)]"
                    }`}
                  >
                    Single Strategy
                  </button>
                  <button
                    onClick={() => onCfg({ strategyMode: "multi_confluence" })}
                    className={`py-1 px-2 rounded font-bold text-[9.5px] transition-all ${
                      cfg.strategyMode === "multi_confluence"
                        ? "bg-[var(--long)] text-black font-black"
                        : "border border-[var(--line)] text-[var(--muted)]"
                    }`}
                  >
                    Multi-Confluence
                  </button>
                </div>
              </div>

              <div>
                <span className="text-[8.5px] text-[var(--dim)] font-bold block mb-1">PRIMARY STRATEGY</span>
                <select
                  value={cfg.selectedStrategy || "sweep_reversal"}
                  onChange={(e) => onCfg({ selectedStrategy: e.target.value as StrategyId })}
                  className="w-full rounded border px-2 py-1 font-bold text-[10.5px] outline-none cursor-pointer bg-[var(--bg1)] text-[var(--gold)]"
                  style={{ borderColor: "var(--line)" }}
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
        </div>

        {/* STAGE 3: MARKET STRUCTURE & AOI FILTERS */}
        <div className="rounded-lg border overflow-hidden bg-[#090d16]" style={{ borderColor: "var(--line)" }}>
          <button
            onClick={() => toggleSection("s3_structure")}
            className="w-full px-3 py-2 flex items-center justify-between font-bold text-[10px] text-[var(--gold-hi)] bg-[var(--bg2)] hover:bg-[#151f31] transition-all"
          >
            <span>STAGE 3 · MARKET STRUCTURE & AOI FILTERS</span>
            <span>{openSections.s3_structure ? "▲" : "▼"}</span>
          </button>

          {openSections.s3_structure && (
            <div className="p-2.5 space-y-1.5">
              <Toggle
                label="PDH / PDL & INTRADAY EXTREMES"
                desc="Previous-day & live intraday liquidity extremes"
                on={cfg.aoi.pdh}
                onChange={() => onAoi({ pdh: !cfg.aoi.pdh })}
              />
              <Toggle
                label="ORDER BLOCKS & FAIR VALUE GAPS"
                desc="Displacement origin beside 3-candle FVG imbalances"
                on={cfg.aoi.ob}
                onChange={() => onAoi({ ob: !cfg.aoi.ob })}
              />
              <Toggle
                label="SESSION HIGH & LOW LEVELS"
                desc="London, New York, and Overlap extremes"
                on={cfg.aoi.session}
                onChange={() => onAoi({ session: !cfg.aoi.session })}
              />
              <Toggle
                label="TRIPLE TOPS & BOTTOMS"
                desc="Three pivot peaks/valleys within tolerance band"
                on={cfg.aoi.triple}
                onChange={() => onAoi({ triple: !cfg.aoi.triple })}
              />
            </div>
          )}
        </div>

        {/* STAGE 4: REACTION CANDLE MATHEMATICS */}
        <div className="rounded-lg border overflow-hidden bg-[#090d16]" style={{ borderColor: "var(--line)" }}>
          <button
            onClick={() => toggleSection("s4_candles")}
            className="w-full px-3 py-2 flex items-center justify-between font-bold text-[10px] text-[var(--gold-hi)] bg-[var(--bg2)] hover:bg-[#151f31] transition-all"
          >
            <span>STAGE 4 · REACTION CANDLE MATHEMATICS</span>
            <span>{openSections.s4_candles ? "▲" : "▼"}</span>
          </button>

          {openSections.s4_candles && (
            <div className="p-2.5 space-y-3">
              <Slider
                label="REJECTION WICK RATIO (LPR/HPR)"
                value={cfg.rejThresh}
                min={0.35}
                max={0.8}
                step={0.01}
                display={`${(cfg.rejThresh * 100).toFixed(0)}% of range`}
                onChange={(v) => onCfg({ rejThresh: v })}
              />

              <Slider
                label="POWER CANDLE MIN RANGE"
                value={cfg.powerAtr}
                min={0.8}
                max={2.5}
                step={0.05}
                display={`${cfg.powerAtr.toFixed(2)}× ATR`}
                onChange={(v) => onCfg({ powerAtr: v })}
              />
            </div>
          )}
        </div>

        {/* STAGE 5: RISK & SIZING ENGINE */}
        <div className="rounded-lg border overflow-hidden bg-[#090d16]" style={{ borderColor: "var(--line)" }}>
          <button
            onClick={() => toggleSection("s5_risk")}
            className="w-full px-3 py-2 flex items-center justify-between font-bold text-[10px] text-[var(--gold-hi)] bg-[var(--bg2)] hover:bg-[#151f31] transition-all"
          >
            <span>STAGE 5 · RISK & SIZING ENGINE</span>
            <span>{openSections.s5_risk ? "▲" : "▼"}</span>
          </button>

          {openSections.s5_risk && (
            <div className="p-2.5 space-y-3">
              {/* Sizing Mode Tabs */}
              <div>
                <span className="text-[8.5px] text-[var(--dim)] font-bold block mb-1">SIZING ALGORITHM</span>
                <div className="grid grid-cols-3 gap-1">
                  {(
                    [
                      { id: "fixedUSD", label: "Fixed USD" },
                      { id: "percentEquity", label: "% Equity" },
                      { id: "fractionalKelly", label: "Kelly Math" },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      onClick={() => onCfg({ sizingMode: m.id })}
                      className={`py-1 px-1.5 rounded font-bold text-[9.5px] transition-all ${
                        cfg.sizingMode === m.id
                          ? "bg-[var(--gold)] text-black font-black"
                          : "border border-[var(--line)] text-[var(--muted)]"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {cfg.sizingMode === "fixedUSD" && (
                <Slider
                  label="RISK PER TRADE (USD)"
                  value={cfg.riskUSD}
                  min={50}
                  max={1500}
                  step={25}
                  display={fmtUSD(cfg.riskUSD)}
                  onChange={(v) => onCfg({ riskUSD: v })}
                />
              )}

              {cfg.sizingMode === "percentEquity" && (
                <Slider
                  label="EQUITY RISK (%)"
                  value={cfg.equityRiskPct || 2.0}
                  min={0.5}
                  max={5.0}
                  step={0.25}
                  display={`${(cfg.equityRiskPct || 2.0).toFixed(2)}%`}
                  onChange={(v) => onCfg({ equityRiskPct: v })}
                />
              )}

              {cfg.sizingMode === "fractionalKelly" && (
                <Slider
                  label="KELLY LEVERAGE FRACTION"
                  value={cfg.kellyFraction || 0.35}
                  min={0.1}
                  max={0.8}
                  step={0.05}
                  display={`${((cfg.kellyFraction || 0.35) * 100).toFixed(0)}% Kelly`}
                  onChange={(v) => onCfg({ kellyFraction: v })}
                />
              )}

              <Slider
                label="TARGET RISK : REWARD"
                value={cfg.rr}
                min={1.2}
                max={4.0}
                step={0.1}
                display={`1 : ${cfg.rr.toFixed(1)}`}
                onChange={(v) => onCfg({ rr: v })}
              />

              {/* Dynamic Geometry Feedback */}
              <div className="grid grid-cols-3 gap-1 text-[9px] pt-1 border-t border-[var(--line)]">
                <div className="rounded border p-1 bg-[var(--bg1)]" style={{ borderColor: "var(--line)" }}>
                  <span className="text-[7.5px] text-[var(--dim)] block">EST. STOP</span>
                  <span className="font-bold text-[#f0546c]">{fmtP(slEst)}</span>
                </div>
                <div className="rounded border p-1 bg-[var(--bg1)]" style={{ borderColor: "var(--line)" }}>
                  <span className="text-[7.5px] text-[var(--dim)] block">LOTS/SIZE</span>
                  <span className="font-bold text-[var(--gold)]">{ozEst.toFixed(2)} units</span>
                </div>
                <div className="rounded border p-1 bg-[var(--bg1)]" style={{ borderColor: "var(--line)" }}>
                  <span className="text-[7.5px] text-[var(--dim)] block">TP PROFIT</span>
                  <span className="font-bold text-[var(--long)]">+{fmtP(tpEst)}/oz</span>
                </div>
              </div>

              {/* Automation Toggles */}
              <div className="space-y-1 pt-1">
                <Toggle
                  label="AUTO BREAKEVEN"
                  desc="Locks stop to entry once trade reaches +1.0R"
                  on={cfg.autoBreakeven}
                  onChange={() => onCfg({ autoBreakeven: !cfg.autoBreakeven })}
                />
                <Toggle
                  label="RSI EXHAUSTION"
                  desc="Fades extreme momentum into S/R"
                  on={cfg.enabledStrategies.rsi_exhaustion}
                  onChange={() =>
                    onCfg({
                      enabledStrategies: { ...cfg.enabledStrategies, rsi_exhaustion: !cfg.enabledStrategies.rsi_exhaustion },
                    })
                  }
                />
              </div>

              {/* Range Breakout specific section */}
              <div className="pt-2 border-t border-white/10 mt-2">
                 <Toggle
                   label="RANGE BREAKOUT EA"
                   desc="Trade breakouts of a defined time range (BM Trading Style)"
                   on={cfg.rbEnabled ?? false}
                   onChange={() => onCfg({ rbEnabled: !(cfg.rbEnabled ?? false) })}
                 />
                 {(cfg.rbEnabled ?? false) && (
                   <div className="mt-2 space-y-2 pl-2 border-l border-[var(--gold)]">
                     <div className="flex gap-2">
                       <NumberInput label="START HOUR (UTC)" value={cfg.rbStartH ?? 7} step={1} min={0} max={23} onChange={(v) => onCfg({ rbStartH: v })} />
                       <NumberInput label="START MINUTE" value={cfg.rbStartM ?? 0} step={5} min={0} max={55} onChange={(v) => onCfg({ rbStartM: v })} />
                     </div>
                     <div className="flex gap-2">
                       <NumberInput label="END HOUR (UTC)" value={cfg.rbEndH ?? 10} step={1} min={0} max={23} onChange={(v) => onCfg({ rbEndH: v })} />
                       <NumberInput label="END MINUTE" value={cfg.rbEndM ?? 0} step={5} min={0} max={55} onChange={(v) => onCfg({ rbEndM: v })} />
                     </div>
                     <NumberInput label="ORDER BUFFER (POINTS)" value={cfg.rbBufferPoints ?? 20} step={10} min={0} onChange={(v) => onCfg({ rbBufferPoints: v })} />
                   </div>
                 )}
              </div>
            </div>
          )}
        </div>

        {/* STAGE 6: DISCIPLINE GUARD & CIRCUIT BREAKER */}
        <div className="rounded-lg border overflow-hidden bg-[#090d16]" style={{ borderColor: "var(--line)" }}>
          <button
            onClick={() => toggleSection("s6_discipline")}
            className="w-full px-3 py-2 flex items-center justify-between font-bold text-[10px] text-[var(--gold-hi)] bg-[var(--bg2)] hover:bg-[#151f31] transition-all"
          >
            <span>STAGE 6 · DISCIPLINE GUARD & CIRCUIT BREAKER</span>
            <span>{openSections.s6_discipline ? "▲" : "▼"}</span>
          </button>

          {openSections.s6_discipline && (
            <div className="p-2.5 space-y-2">
              <Slider
                label="MAX DAILY SL HITS (CIRCUIT BREAKER)"
                value={cfg.maxDailySL}
                min={1}
                max={5}
                step={1}
                display={`${cfg.maxDailySL} hits max`}
                onChange={(v) => onCfg({ maxDailySL: v })}
              />

              <div className="rounded border p-2 bg-[var(--bg1)] text-[9.5px] space-y-1" style={{ borderColor: "var(--line)" }}>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--dim)]">DAILY SL USED:</span>
                  <span className={`font-bold ${st.dailySL >= cfg.maxDailySL ? "text-[#f0546c]" : "text-white"}`}>
                    {st.dailySL} / {cfg.maxDailySL}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--dim)]">ENGINE LOCK STATE:</span>
                  <span className={`font-bold ${st.halted ? "text-[#f0546c] animate-pulse" : "text-[var(--long)]"}`}>
                    {st.halted ? "HALTED (LOCKED)" : "ARMED (DISCIPLINED)"}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
