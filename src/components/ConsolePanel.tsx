import type { CSSProperties } from "react";
import type { EngineConfig, EngineState } from "../engine/types";
import { fmtUSD } from "../engine/types";
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
      <div className="mb-1.5 flex items-center justify-between">
        <span className="font-mono text-[9.5px] tracking-[0.18em] text-[var(--muted)]">{props.label}</span>
        <span className="font-mono text-[11px] font-semibold text-[var(--gold-hi)]">{props.display}</span>
      </div>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(parseFloat(e.target.value))}
        className="w-full"
        style={{ "--fill": `${pct}%` } as CSSProperties}
      />
    </label>
  );
}

function Toggle({ label, desc, on, onChange }: { label: string; desc: string; on: boolean; onChange: () => void }) {
  return (
    <button onClick={onChange} className="group flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition-all duration-200"
      style={{ borderColor: on ? "var(--line)" : "var(--line-soft)", background: on ? "var(--bg2)" : "var(--bg1)", opacity: on ? 1 : 0.55 }}>
      <span>
        <span className="block font-mono text-[11px] font-semibold tracking-wide" style={{ color: on ? "var(--ink)" : "var(--muted)" }}>{label}</span>
        <span className="block font-body text-[10px] text-[var(--dim)]">{desc}</span>
      </span>
      <span className="relative h-4 w-8 shrink-0 rounded-full transition-colors duration-200" style={{ background: on ? "rgba(232,180,76,0.3)" : "var(--bg3)" }}>
        <span className="absolute top-0.5 h-3 w-3 rounded-full transition-all duration-200" style={{ left: on ? "18px" : "2px", background: on ? "var(--gold)" : "var(--dim)" }} />
      </span>
    </button>
  );
}

export default function ConsolePanel({ cfg, onCfg, onAoi, st, stats }: Props) {
  const slEst = Math.max(st.atr + Math.max(0.12 * st.atr, 0.25), 0.5) + cfg.spread / 2;
  const ozEst = Math.min(cfg.riskUSD / (slEst * cfg.pointValue), 300);
  const tpEst = slEst * cfg.rr;

  const idCard = (active: boolean, color: string) => ({
    borderColor: active ? color : "var(--line-soft)",
    background: active ? "var(--bg2)" : "var(--bg1)",
    boxShadow: active ? `0 0 0 1px ${color}55, 0 0 22px ${color}22` : "none",
  });

  return (
    <div className="glass-panel rise-in p-4" style={{ animationDelay: "0.15s" }}>
      <div className="panel-title mb-3 font-bold text-white tracking-wider">Engine Console</div>

      {/* ---- execution mode ---- */}
      <div className="mb-4">
        <div className="mb-2 font-mono text-[9px] tracking-[0.22em] text-[var(--dim)]">STEP 0 · EXECUTION MODE</div>
        <div className="space-y-1.5">
          <Toggle
            label="ACTION CENTER"
            desc="Signals queue for your approve / reject — every decision scored"
            on={cfg.actionCenter}
            onChange={() => onCfg({ actionCenter: !cfg.actionCenter })}
          />
          <Toggle
            label="TRADING WINDOW"
            desc="Scheduler arms the engine only inside marked hours"
            on={cfg.windowEnabled}
            onChange={() => onCfg({ windowEnabled: !cfg.windowEnabled })}
          />
        </div>
      </div>

      {/* ---- identity ---- */}
      <div className="mb-4">
        <div className="mb-2 font-mono text-[9px] tracking-[0.22em] text-[var(--dim)]">STEP 1 · TRADING IDENTITY</div>
        <div className="grid grid-cols-1 gap-2">
          <button onClick={() => onCfg({ identity: "reversal" })} className="rounded-md border p-3 text-left transition-all duration-200 hover:translate-y-[-1px]" style={idCard(cfg.identity === "reversal", "var(--gold)")}>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <svg width="20" height="16" viewBox="0 0 20 16" fill="none" aria-hidden>
                  <path d="M1 4h18" stroke="var(--gold)" strokeWidth="1.2" strokeDasharray="3 2" />
                  <path d="M10 15V7.5M10 7.5L7 10M10 7.5l3 2.5" stroke="var(--long)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M10 3.5V1" stroke="var(--muted)" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                <span className="font-display text-[12.5px] font-bold tracking-wide">REVERSAL / TRAP</span>
              </span>
              {cfg.identity === "reversal" && <span className="rounded-sm px-1.5 py-px font-mono text-[8px] font-bold tracking-widest" style={{ color: "var(--gold)", background: "rgba(232,180,76,0.14)" }}>ACTIVE</span>}
            </div>
            <div className="mt-1 font-body text-[10.5px] leading-snug text-[var(--muted)]">
              Buy low · sell high. Sweep an AOI, reject, enter on the LPR/HPR close.
            </div>
            <div className="mt-1.5 font-mono text-[8.5px] tracking-[0.16em]" style={{ color: "var(--gold)" }}>★ RECOMMENDED FOR SOLO TRADERS</div>
          </button>

          <button onClick={() => onCfg({ identity: "breakout" })} className="rounded-md border p-3 text-left transition-all duration-200 hover:translate-y-[-1px]" style={idCard(cfg.identity === "breakout", "var(--info)")}>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <svg width="20" height="16" viewBox="0 0 20 16" fill="none" aria-hidden>
                  <path d="M1 10h18" stroke="var(--info)" strokeWidth="1.2" strokeDasharray="3 2" />
                  <rect x="8" y="2" width="4" height="8" rx="1" fill="var(--long)" />
                  <path d="M10 1v1M10 12v2.5" stroke="var(--muted)" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                <span className="font-display text-[12.5px] font-bold tracking-wide">BREAKOUT / MOMENTUM</span>
              </span>
              {cfg.identity === "breakout" && <span className="rounded-sm px-1.5 py-px font-mono text-[8px] font-bold tracking-widest" style={{ color: "var(--info)", background: "rgba(110,155,216,0.14)" }}>ACTIVE</span>}
            </div>
            <div className="mt-1 font-body text-[10.5px] leading-snug text-[var(--muted)]">
              Buy higher · sell lower. Approach, pull back, then a power candle breaks the AOI.
            </div>
          </button>
        </div>
      </div>

      {/* ---- risk engine ---- */}
      <div className="mb-4 rounded-md border p-3" style={{ borderColor: "var(--line-soft)", background: "var(--bg1)" }}>
        <div className="mb-2 flex items-center justify-between">
          <span className="font-mono text-[9px] tracking-[0.22em] text-[var(--dim)]">STEP 5 · RISK & SIZING ENGINE</span>
          <span className="font-mono text-[10px] text-[var(--muted)]">BAL <span className="font-semibold text-[var(--ink)]">{fmtUSD(st.balance)}</span></span>
        </div>

        {/* Position Sizing Mode Tabs */}
        <div className="mb-3">
          <span className="mb-1 block font-mono text-[9px] tracking-[0.16em] text-[var(--muted)]">SIZING ALGORITHM</span>
          <div className="flex overflow-hidden rounded-md border" style={{ borderColor: "var(--line)" }}>
            <button
              onClick={() => onCfg({ sizingMode: "fixedUSD" })}
              className="flex-1 py-1 font-mono text-[10px] font-bold transition-colors"
              style={{
                background: (cfg.sizingMode || "percentEquity") === "fixedUSD" ? "rgba(232,180,76,0.18)" : "var(--bg2)",
                color: (cfg.sizingMode || "percentEquity") === "fixedUSD" ? "var(--gold-hi)" : "var(--muted)",
              }}
            >
              Fixed USD
            </button>
            <button
              onClick={() => onCfg({ sizingMode: "percentEquity" })}
              className="flex-1 py-1 font-mono text-[10px] font-bold transition-colors"
              style={{
                background: cfg.sizingMode === "percentEquity" ? "rgba(232,180,76,0.18)" : "var(--bg2)",
                color: cfg.sizingMode === "percentEquity" ? "var(--gold-hi)" : "var(--muted)",
              }}
            >
              % Equity
            </button>
            <button
              onClick={() => onCfg({ sizingMode: "fractionalKelly" })}
              className="flex-1 py-1 font-mono text-[10px] font-bold transition-colors"
              style={{
                background: cfg.sizingMode === "fractionalKelly" ? "rgba(232,180,76,0.18)" : "var(--bg2)",
                color: cfg.sizingMode === "fractionalKelly" ? "var(--gold-hi)" : "var(--muted)",
              }}
            >
              Kelly Criterion
            </button>
          </div>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2">
          {cfg.sizingMode === "percentEquity" ? (
            <label className="block">
              <span className="mb-1 block font-mono text-[9px] tracking-[0.16em] text-[var(--muted)]">EQUITY RISK (%)</span>
              <input
                type="number"
                min={0.5}
                max={10}
                step={0.5}
                value={cfg.equityRiskPct || 2.0}
                onChange={(e) => onCfg({ equityRiskPct: Math.max(0.5, Math.min(10, Number(e.target.value) || 2)) })}
                className="w-full rounded-md border px-2 py-1.5 font-mono text-[13px] font-semibold outline-none transition-colors focus:border-[var(--gold)]"
                style={{ borderColor: "var(--line)", background: "var(--bg2)", color: "var(--gold-hi)" }}
              />
            </label>
          ) : cfg.sizingMode === "fractionalKelly" ? (
            <label className="block">
              <span className="mb-1 block font-mono text-[9px] tracking-[0.16em] text-[var(--muted)]">KELLY FRACTION</span>
              <input
                type="number"
                min={0.1}
                max={1.0}
                step={0.05}
                value={cfg.kellyFraction || 0.35}
                onChange={(e) => onCfg({ kellyFraction: Math.max(0.1, Math.min(1.0, Number(e.target.value) || 0.35)) })}
                className="w-full rounded-md border px-2 py-1.5 font-mono text-[13px] font-semibold outline-none transition-colors focus:border-[var(--gold)]"
                style={{ borderColor: "var(--line)", background: "var(--bg2)", color: "var(--gold-hi)" }}
              />
            </label>
          ) : (
            <label className="block">
              <span className="mb-1 block font-mono text-[9px] tracking-[0.16em] text-[var(--muted)]">RISK / TRADE (USD)</span>
              <input
                type="number"
                min={25}
                max={5000}
                step={25}
                value={cfg.riskUSD}
                onChange={(e) => onCfg({ riskUSD: Math.max(25, Math.min(5000, Number(e.target.value) || 25)) })}
                className="w-full rounded-md border px-2 py-1.5 font-mono text-[13px] font-semibold outline-none transition-colors focus:border-[var(--gold)]"
                style={{ borderColor: "var(--line)", background: "var(--bg2)", color: "var(--gold-hi)" }}
              />
            </label>
          )}

          <div>
            <span className="mb-1 block font-mono text-[9px] tracking-[0.16em] text-[var(--muted)]">MAX DAILY SL HITS</span>
            <div className="flex overflow-hidden rounded-md border" style={{ borderColor: "var(--line)" }}>
              {[1, 2, 3].map((n) => (
                <button key={n} onClick={() => onCfg({ maxDailySL: n })} className="seg-btn flex-1 py-1.5 font-mono text-[12px] font-bold"
                  style={{ background: cfg.maxDailySL === n ? "rgba(240,84,108,0.16)" : "var(--bg2)", color: cfg.maxDailySL === n ? "var(--short)" : "var(--muted)" }}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <Slider label="RISK : REWARD TARGET" value={cfg.rr} min={1.5} max={4} step={0.1} display={`1 : ${cfg.rr.toFixed(1)}`} onChange={(v) => onCfg({ rr: v })} />
          <Slider label="MODELED SPREAD (FRICTION)" value={cfg.spread} min={0} max={0.6} step={0.05} display={`$${cfg.spread.toFixed(2)}`} onChange={(v) => onCfg({ spread: v })} />
          <Slider label="SLIPPAGE MODEL (POINTS)" value={cfg.slippagePoints || 0.15} min={0} max={0.5} step={0.05} display={`±${(cfg.slippagePoints || 0.15).toFixed(2)} pts`} onChange={(v) => onCfg({ slippagePoints: v })} />
          
          <div className="pt-1">
            <Toggle
              label="TRAILING STOP LOSS"
              desc={`Locks profit past +${(cfg.trailThresholdR || 1.5).toFixed(1)}R at ${(cfg.trailAtrDist || 1.0).toFixed(1)}× ATR`}
              on={!!cfg.trailingStop}
              onChange={() => onCfg({ trailingStop: !cfg.trailingStop })}
            />
          </div>

          <div className="grid grid-cols-3 gap-2 rounded-md border border-dashed px-2.5 py-2 font-mono text-[10px]" style={{ borderColor: "var(--line)" }}>
            <div>
              <div className="text-[8px] tracking-[0.16em] text-[var(--dim)]">EST. STOP</div>
              <div className="font-semibold text-[var(--ink)]">${slEst.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-[8px] tracking-[0.16em] text-[var(--dim)]">SIZE</div>
              <div className="font-semibold text-[var(--gold-hi)]">{ozEst.toFixed(1)} oz</div>
            </div>
            <div>
              <div className="text-[8px] tracking-[0.16em] text-[var(--dim)]">TP TARGET</div>
              <div className="font-semibold text-[var(--long)]">+${tpEst.toFixed(2)}/oz</div>
            </div>
          </div>
        </div>
      </div>

      {/* ---- AOI filters ---- */}
      <div className="mb-4">
        <div className="mb-2 font-mono text-[9px] tracking-[0.22em] text-[var(--dim)]">STEP 2 · AREAS OF INTEREST</div>
        <div className="space-y-1.5">
          <Toggle label="PDH / PDL · CDH / CDL" desc="Previous-day & live intraday extremes" on={cfg.aoi.pdh} onChange={() => onAoi({ pdh: !cfg.aoi.pdh })} />
          <Toggle label="TRIPLE TOPS / BOTTOMS" desc="Three pivots within tolerance band" on={cfg.aoi.triple} onChange={() => onAoi({ triple: !cfg.aoi.triple })} />
          <Toggle label="ORDER BLOCKS + FVG" desc="Expansion origin beside fair value gaps" on={cfg.aoi.ob} onChange={() => onAoi({ ob: !cfg.aoi.ob })} />
          <Toggle label="SESSION LEVELS" desc="London · New York · overlap extremes" on={cfg.aoi.session} onChange={() => onAoi({ session: !cfg.aoi.session })} />
        </div>
        <div className="mt-2">
          <Slider label="TRIPLE PIVOT TOLERANCE" value={cfg.tripleTol} min={0.05} max={0.4} step={0.01} display={`±${cfg.tripleTol.toFixed(2)}%`} onChange={(v) => onCfg({ tripleTol: v })} />
        </div>
      </div>

      {/* ---- reaction filters ---- */}
      <div className="mb-4">
        <div className="mb-2 font-mono text-[9px] tracking-[0.22em] text-[var(--dim)]">STEP 3 · REACTION CANDLES</div>
        <div className="space-y-3">
          <Slider label="REJECTION WICK RATIO (LPR/HPR)" value={cfg.rejThresh} min={0.35} max={0.7} step={0.01} display={`${Math.round(cfg.rejThresh * 100)}% of range`} onChange={(v) => onCfg({ rejThresh: v })} />
          <Slider label="POWER CANDLE MIN RANGE" value={cfg.powerAtr} min={0.8} max={2.2} step={0.05} display={`${cfg.powerAtr.toFixed(2)}× ATR`} onChange={(v) => onCfg({ powerAtr: v })} />
        </div>
      </div>

      {/* ---- session ledger ---- */}
      <div>
        <div className="mb-2 font-mono text-[9px] tracking-[0.22em] text-[var(--dim)]">STEP 6 · DISCIPLINE LEDGER</div>
        <div className="grid grid-cols-2 gap-1.5 font-mono text-[10.5px]">
          <div className="rounded-md border px-2.5 py-2" style={{ borderColor: "var(--line-soft)", background: "var(--bg1)" }}>
            <div className="text-[8px] tracking-[0.16em] text-[var(--dim)]">DAILY SL USED</div>
            <div className="text-[15px] font-bold" style={{ color: st.dailySL >= cfg.maxDailySL ? "var(--short)" : "var(--ink)" }}>{st.dailySL}<span className="text-[10px] text-[var(--dim)]">/{cfg.maxDailySL}</span></div>
          </div>
          <div className="rounded-md border px-2.5 py-2" style={{ borderColor: "var(--line-soft)", background: "var(--bg1)" }}>
            <div className="text-[8px] tracking-[0.16em] text-[var(--dim)]">ENGINE STATE</div>
            <div className="text-[15px] font-bold" style={{ color: st.halted ? "var(--short)" : st.open ? "var(--gold)" : "var(--long)" }}>
              {st.halted ? "HALTED" : st.open ? "IN TRADE" : "ARMED"}
            </div>
          </div>
          <div className="col-span-2 rounded-md border px-2.5 py-2 font-body text-[10px] italic leading-snug text-[var(--muted)]" style={{ borderColor: "var(--line-soft)", background: "var(--bg1)" }}>
            {st.halted
              ? "Two clean losses is a full day's tuition. The platform is closed — tomorrow is a new edge."
              : "Hit the daily limit and the engine closes the platform. No overrides, no revenge trades."}
          </div>
        </div>
      </div>
    </div>
  );
}
