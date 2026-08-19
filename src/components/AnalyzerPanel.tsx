import { useState } from "react";
import type { EngineConfig } from "../engine/types";
import { createEngine, computeStats } from "../engine/engine";

interface Scenario {
  seed: number;
  net: number;
  winRate: number;
  pf: number;
  maxDDPct: number;
  trades: number;
  avgR: number;
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export default function AnalyzerPanel({ cfg }: { cfg: EngineConfig }) {
  const [results, setResults] = useState<Scenario[] | null>(null);
  const [running, setRunning] = useState(false);

  const run = () => {
    setRunning(true);
    setResults(null);
    window.setTimeout(() => {
      const base = 1000 + Math.floor(Math.random() * 90000);
      const out: Scenario[] = Array.from({ length: 12 }, (_, i) => {
        const seed = base + i * 7919;
        const e = createEngine(seed, { ...cfg, actionCenter: false });
        const s = computeStats(e, cfg);
        return { seed, net: s.net, winRate: s.winRate, pf: s.pf, maxDDPct: s.maxDDPct, trades: s.closed.length, avgR: s.avgR };
      });
      setResults(out);
      setRunning(false);
    }, 60);
  };

  const profitable = results ? results.filter((r) => r.net > 0).length : 0;
  const verdict = !results
    ? null
    : profitable >= 9
      ? { label: "ROBUST ACROSS SCENARIOS", color: "var(--long)" }
      : profitable >= 6
        ? { label: "SEED-SENSITIVE — SIZE DOWN", color: "var(--gold)" }
        : { label: "FRAGILE — TUNE BEFORE LIVE", color: "var(--short)" };

  const maxAbs = results ? Math.max(1, ...results.map((r) => Math.abs(r.net))) : 1;

  return (
    <div className="panel rise-in flex h-full flex-col p-4" style={{ animationDelay: "0.34s" }}>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="panel-title">Analyzer Lab · Stress Test</div>
          <div className="mt-0.5 font-body text-[10px] italic text-[var(--dim)]">12 fresh market scenarios, your exact config. Is the edge real — or seed luck?</div>
        </div>
        <button
          onClick={run}
          disabled={running}
          className="seg-btn rounded-md px-3.5 py-2 font-mono text-[10.5px] font-bold tracking-[0.14em] active:scale-[0.97]"
          style={{ background: "rgba(232,180,76,0.16)", color: "var(--gold-hi)", border: "1px solid var(--gold-deep)" }}
        >
          {running ? "RUNNING…" : results ? "↻ RE-RUN 12" : "▶ RUN 12 SCENARIOS"}
        </button>
      </div>

      {!results ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2.5 rounded-md border border-dashed py-8" style={{ borderColor: "var(--line)" }}>
          {running ? (
            <>
              <div className="h-[3px] w-40 overflow-hidden rounded-full" style={{ background: "var(--bg3)" }}>
                <div className="h-full w-1/2 rounded-full" style={{ background: "var(--gold)", animation: "marquee 1s linear infinite" }} />
              </div>
              <span className="font-mono text-[10px] tracking-[0.2em] text-[var(--muted)]">REPLAYING 700-BAR HISTORIES…</span>
            </>
          ) : (
            <>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M4 20V10M9 20V4M14 20v-7M19 20V8" stroke="var(--dim)" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <span className="font-body text-[11px] italic text-[var(--dim)]">Distributions of win rate, expectancy and drawdown — before you trust the config with money.</span>
            </>
          )}
        </div>
      ) : (
        <>
          {/* 12-scenario net P/L bars */}
          <div className="flex h-[104px] items-end gap-1.5 rounded-md border px-3 pb-0 pt-2" style={{ borderColor: "var(--line-soft)", background: "var(--bg1)" }}>
            {results.map((r, i) => {
              const h = Math.max(4, (Math.abs(r.net) / maxAbs) * 82);
              const up = r.net >= 0;
              return (
                <div
                  key={r.seed}
                  className="group relative flex-1 rounded-t-[3px] transition-all duration-500 hover:opacity-80"
                  title={`seed ${r.seed} · ${r.trades} trades · ${r.winRate.toFixed(0)}% win · ${r.avgR >= 0 ? "+" : ""}${r.avgR.toFixed(2)}R · DD ${r.maxDDPct.toFixed(1)}%`}
                  style={{
                    height: `${h}px`,
                    background: up ? "linear-gradient(180deg, var(--long), rgba(47,201,143,0.35))" : "linear-gradient(180deg, var(--short), rgba(240,84,108,0.35))",
                    animationDelay: `${i * 40}ms`,
                  }}
                />
              );
            })}
          </div>
          <div className="mt-1 flex justify-between font-mono text-[8px] tracking-widest text-[var(--dim)]">
            <span>SCENARIO 1</span>
            <span>NET P/L PER SCENARIO · HOVER FOR DETAIL</span>
            <span>12</span>
          </div>

          {/* stats strip */}
          <div className="mt-2.5 grid grid-cols-4 gap-2">
            {[
              { k: "PROFITABLE", v: `${profitable}/12`, c: profitable >= 9 ? "var(--long)" : profitable >= 6 ? "var(--gold)" : "var(--short)" },
              { k: "MEDIAN WIN", v: `${median(results.map((r) => r.winRate)).toFixed(0)}%`, c: "var(--ink)" },
              { k: "MEDIAN PF", v: median(results.map((r) => Math.min(r.pf, 9))).toFixed(2), c: "var(--ink)" },
              { k: "WORST DD", v: `−${Math.max(...results.map((r) => r.maxDDPct)).toFixed(1)}%`, c: "var(--short)" },
            ].map((s) => (
              <div key={s.k} className="rounded-md border px-2 py-1.5 text-center" style={{ borderColor: "var(--line-soft)", background: "var(--bg1)" }}>
                <div className="font-mono text-[7.5px] tracking-[0.16em] text-[var(--dim)]">{s.k}</div>
                <div className="font-mono text-[13px] font-bold" style={{ color: s.c }}>{s.v}</div>
              </div>
            ))}
          </div>

          {verdict && (
            <div className="mt-2.5 rounded-md border px-3 py-2 text-center font-mono text-[10.5px] font-bold tracking-[0.18em]" style={{ borderColor: `${verdict.color}55`, color: verdict.color, background: "var(--bg1)" }}>
              {verdict.label}
            </div>
          )}
        </>
      )}
    </div>
  );
}
