type Verdict = "engine" | "blueprint" | "parity" | "bug";

const ROWS: { area: string; bp: string; en: string; v: Verdict; note: string }[] = [
  {
    area: "PDH/PDL LOOK-AHEAD",
    bp: "high[1] + lookahead_off — repaint-proof",
    en: "frozen at session rollover from completed day",
    v: "parity",
    note: "Both correct. The original template's bare high/low + lookahead_on was the bug; both fixes kill it.",
  },
  {
    area: "DAILY-LOSS COUNTER",
    bp: "closedtrades-delta tracking (fixed the [32] footnote bug)",
    en: "same + same-bar re-entry lock after TP and SL",
    v: "engine",
    note: "Blueprint counts losses correctly; engine additionally refuses any entry on the bar an exit filled.",
  },
  {
    area: "AOI COVERAGE",
    bp: "4 families, but OBs are flat lines that never mitigate",
    en: "zones + OB mitigation + CDH/CDL + overlap levels",
    v: "engine",
    note: "Stale OB lines trade forever in the blueprint. Engine retires mitigated blocks.",
  },
  {
    area: "REACTION FILTER",
    bp: "LPR / HPR / power candle",
    en: "same + boring-candle classifier (doji, fighting wicks)",
    v: "engine",
    note: "Spec step 3 explicitly bans boring candles — engine enforces it, blueprint doesn't.",
  },
  {
    area: "POSITION SIZING",
    bp: "MT5 trade_tick_value / tick_size — broker-native",
    en: "explicit point value ($1.00/oz for gold)",
    v: "blueprint",
    note: "Best practice for live multi-asset. Adopted into the corrected receiver below.",
  },
  {
    area: "STOP PLACEMENT",
    bp: "low − syminfo.mintick — a one-tick stop",
    en: "wick extreme + buffer, rejects SL < 0.15×ATR",
    v: "engine",
    note: "With $375 fixed risk, a 1-tick stop implies a monster lot and instant stop-out. Guard ported into fixed Pine.",
  },
  {
    area: "FRICTION MODEL",
    bp: "none — fills at exact levels",
    en: "spread on every fill, entry and exit, both sides",
    v: "engine",
    note: "Frictionless backtests overstate win rate — the classic live-account surprise.",
  },
  {
    area: "BACKTEST FIRES TRADES",
    bp: "default_qty_value=0 → strategy.entry qty is 0",
    en: "explicit risk-based qty on every entry",
    v: "engine",
    note: "Blueprint's backtest silently executes nothing. Fixed Pine passes qty= explicitly.",
  },
  {
    area: "ALERT PAYLOAD",
    bp: "docs template uses {{plot_0}} as stop_loss — that's the PDH plot",
    en: "payload built from the actual trade object",
    v: "engine",
    note: "Sending PDH as the stop loss to a broker is an unprotected live position. Use order-fill placeholders.",
  },
  {
    area: "LIVE EXECUTION PATH",
    bp: "Pine → webhook → FastAPI → MT5 → SQLite — real production",
    en: "browser simulation (verification layer)",
    v: "blueprint",
    note: "This is the blueprint's job and it does it well. Full corrected stack included below.",
  },
  {
    area: "DISCIPLINE GROUND TRUTH",
    bp: "scans MT5 history deals for today's losses",
    en: "simulated counter",
    v: "blueprint",
    note: "Live terminal is the source of truth. Receiver keeps this — plus SQLite mirror.",
  },
];

const BUGS = [
  {
    n: "B1",
    title: "default_qty_value=0 — silent no-op",
    body: "strategy.entry() without qty falls back to the zero default: the backtest never opens a single position, so every metric it prints is void.",
    fix: "qty = riskUSD / slDistance, passed explicitly to every strategy.entry().",
  },
  {
    n: "B2",
    title: "{{plot_0}} is not the stop loss",
    body: "plot_0 resolves to the first plot() call — the PDH line. Piping that as stop_loss sends the broker a stop at yesterday's high while you're long below it.",
    fix: "Use {{strategy.order.*}} order-fill placeholders (PAYLOAD tab) — they carry the real executed levels.",
  },
  {
    n: "B3",
    title: "low − syminfo.mintick stop",
    body: "One tick of breathing room. Fixed-dollar sizing divides risk by that distance, implying an enormous lot; any normal wick fills it instantly.",
    fix: "buffer = max(5 × mintick, 0.15 × ATR14) below the sweep wick — the engine's degenerate-geometry guard.",
  },
];

const vStyle = (v: Verdict) =>
  v === "engine"
    ? { label: "ENGINE WINS", c: "var(--long)" }
    : v === "blueprint"
      ? { label: "BLUEPRINT WINS", c: "var(--info)" }
      : v === "parity"
        ? { label: "PARITY", c: "var(--gold)" }
        : { label: "BUG", c: "var(--short)" };

export default function SpecBattle() {
  const tally = ROWS.reduce(
    (m, r) => {
      m[r.v]++;
      return m;
    },
    { engine: 0, blueprint: 0, parity: 0, bug: 0 } as Record<Verdict, number>
  );

  return (
    <div className="panel rise-in p-4" style={{ animationDelay: "0.16s", borderTop: "2px solid var(--gold-deep)" }}>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2.5">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M3 2v7a3 3 0 006 0V2M3 4h6M6 2v12M6 14h-3M6 14h6M11 2l2 5-2 5" stroke="var(--gold)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="panel-title" style={{ color: "var(--gold)" }}>Spec Battle · Blueprint vs Engine</span>
        </div>
        <span className="rounded-sm px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.14em]" style={{ color: "var(--gold-hi)", background: "rgba(232,180,76,0.12)", border: "1px solid var(--gold-deep)" }}>
          MERGE VERDICT — ENGINE {tally.engine} · BLUEPRINT {tally.blueprint} · PARITY {tally.parity}
        </span>
        <span className="ml-auto font-body text-[10.5px] italic text-[var(--muted)]">
          Logic layer: engine wins · Execution layer: blueprint wins · Ship the merge.
        </span>
      </div>

      {/* comparison rows */}
      <div className="overflow-hidden rounded-md border" style={{ borderColor: "var(--line-soft)" }}>
        <div className="grid grid-cols-[1.1fr_1.5fr_1.5fr_auto] gap-x-3 border-b px-3 py-1.5 font-mono text-[8.5px] tracking-[0.18em] text-[var(--dim)]" style={{ borderColor: "var(--line-soft)", background: "var(--bg1)" }}>
          <span>SUBSYSTEM</span>
          <span style={{ color: "var(--info)" }}>BLUEPRINT (TV + FASTAPI + MT5)</span>
          <span style={{ color: "var(--long)" }}>TRADING FLOW</span>
          <span>VERDICT</span>
        </div>
        {ROWS.map((r) => {
          const s = vStyle(r.v);
          return (
            <div
              key={r.area}
              className="group grid grid-cols-[1.1fr_1.5fr_1.5fr_auto] items-start gap-x-3 border-b px-3 py-2 transition-colors duration-150 last:border-b-0 hover:bg-[var(--bg2)]"
              style={{ borderColor: "var(--line-soft)", background: "var(--bg0)" }}
            >
              <span className="font-display text-[10.5px] font-bold tracking-wide text-[var(--ink)]">{r.area}</span>
              <span className="font-mono text-[9.5px] leading-snug text-[var(--muted)]">{r.bp}</span>
              <span className="font-mono text-[9.5px] leading-snug text-[var(--muted)]">{r.en}</span>
              <span className="rounded-sm px-1.5 py-0.5 font-mono text-[8px] font-bold tracking-[0.12em]" style={{ color: s.c, background: "var(--bg2)", border: `1px solid ${s.c}44`, whiteSpace: "nowrap" }}>
                {s.label}
              </span>
              <span className="col-span-4 -mt-0.5 font-body text-[9.5px] italic leading-snug text-[var(--dim)] opacity-70 transition-opacity duration-200 group-hover:opacity-100">
                {r.note}
              </span>
            </div>
          );
        })}
      </div>

      {/* blueprint bugs */}
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        {BUGS.map((b) => (
          <div key={b.n} className="rounded-md border p-3 transition-transform duration-200 hover:-translate-y-[2px]" style={{ borderColor: "rgba(240,84,108,0.35)", background: "rgba(75,27,38,0.22)" }}>
            <div className="mb-1 flex items-center gap-2">
              <span className="rounded-sm px-1.5 py-px font-mono text-[9px] font-bold" style={{ color: "var(--short)", border: "1px solid rgba(240,84,108,0.5)" }}>{b.n}</span>
              <span className="font-display text-[11px] font-bold tracking-wide text-[var(--ink)]">{b.title}</span>
            </div>
            <p className="font-body text-[10px] leading-snug text-[var(--muted)]">{b.body}</p>
            <p className="mt-1.5 border-t pt-1.5 font-mono text-[9px] leading-snug" style={{ borderColor: "rgba(240,84,108,0.25)", color: "var(--long)" }}>
              FIX → {b.fix}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-3 border-t pt-2.5 font-body text-[10.5px] italic leading-snug text-[var(--muted)]" style={{ borderColor: "var(--line-soft)" }}>
        All three fixes are already applied in the Deployment Bridge below — corrected Pine v5, receiver v2 with broker-native tick sizing,
        filling-mode detection and the tight-stop guardrail. Copy what you need; nothing ships with a known landmine.
      </div>
    </div>
  );
}
