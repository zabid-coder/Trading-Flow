interface Finding {
  n: string;
  title: string;
  verdict: string;
  vColor: string;
  body: string;
  bad?: string;
  good?: string;
}

const FINDINGS: Finding[] = [
  {
    n: "01",
    title: "PDH / PDL LOOK-AHEAD",
    verdict: "PINE HAZARD · ENGINE CLEAN",
    vColor: "var(--short)",
    body: "Bare high/low inside request.security with lookahead_on leaks the still-forming day's extremes into historical bars — the AOI stops being \"yesterday\" and the backtest is fiction. This engine freezes PDH/PDL only at session rollover, from the fully completed prior day; the live bar never contributes early.",
    bad: 'pdh = request.security(sym, "D", high, lookahead=barmerge.lookahead_on)',
    good: 'pdh = request.security(sym, "D", high[1], lookahead=barmerge.lookahead_off)',
  },
  {
    n: "02",
    title: "FOOTNOTE → BAR OFFSET",
    verdict: "TRANSCRIPTION BUG",
    vColor: "var(--gold)",
    body: "[17] and [32] were citation markers in the source prose that got transcribed as history offsets. high[17] means \"17 daily bars ago\", and strategy.position_size[32] means \"the position 32 bars back\" — neither exists in the spec. Correct Pine: high[1] for the last completed daily bar; SL-hit counting belongs on the closed-trade counter, not an index guess.",
    bad: "strategy.position_size[32] > 0",
    good: "ta.change(strategy.closedtrades) > 0  // then check last trade profit",
  },
  {
    n: "03",
    title: "PIP VALUE SKIPPED",
    verdict: "PATCHED",
    vColor: "var(--long)",
    body: "Spec step 5 sizes as Risk ÷ (SL Δ × pip value); the template coded Risk ÷ SL Δ. Self-consistent inside TradingView's engine, wrong the moment it is piped to a broker as a lot size. This engine now carries an explicit point value — $1.00 per oz per $1.00 move on XAUUSD — in the config, the sizing math, and every RISK event on the wire.",
    bad: "qty = riskUSD / slDistance",
    good: "qty = riskUSD / (slDistance * pointValue)  // $1.00/oz for XAUUSD",
  },
  {
    n: "04",
    title: "SCOPE: PDH/PDL ONLY",
    verdict: "FULL COVERAGE",
    vColor: "var(--info)",
    body: "The template wired a single AOI type. This engine runs all four families from the spec — A: triple tops/bottoms (confirmed pivots, right-side lag, no repaint), B: order blocks anchored to FVGs with mitigation, C: London/NY/overlap extremes, D: PDH/PDL plus live CDH/CDL — under both identities, each independently toggleable above.",
  },
];

export default function SpecIntegrity() {
  return (
    <div className="panel rise-in mt-4 p-4" style={{ animationDelay: "0.2s", borderTop: "2px solid var(--gold-deep)" }}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden>
            <path d="M7.5 1.2l1.8 3.7 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4L1.7 5.5l4-.6z" stroke="var(--gold)" strokeWidth="1.1" strokeLinejoin="round" />
          </svg>
          <span className="panel-title" style={{ color: "var(--gold)" }}>Spec Integrity Audit</span>
        </div>
        <span className="rounded-sm px-1.5 py-px font-mono text-[8.5px] font-bold tracking-[0.16em]" style={{ color: "var(--long)", background: "rgba(47,201,143,0.12)" }}>
          4 FINDINGS · ALL RESOLVED
        </span>
      </div>

      <div className="space-y-2.5">
        {FINDINGS.map((f) => (
          <div key={f.n} className="group rounded-md border px-3 py-2.5 transition-colors duration-200 hover:border-[var(--line)]" style={{ borderColor: "var(--line-soft)", background: "var(--bg1)" }}>
            <div className="mb-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <span className="font-mono text-[10px] font-bold" style={{ color: "var(--gold)" }}>{f.n}</span>
              <span className="font-display text-[11px] font-bold tracking-wide text-[var(--ink)]">{f.title}</span>
              <span className="ml-auto rounded-sm px-1.5 py-px font-mono text-[8px] font-bold tracking-[0.14em]" style={{ color: f.vColor, background: "var(--bg2)", border: `1px solid ${f.vColor}44` }}>
                {f.verdict}
              </span>
            </div>
            <p className="font-body text-[10.5px] leading-snug text-[var(--muted)]">{f.body}</p>
            {(f.bad || f.good) && (
              <div className="mt-2 space-y-1 font-mono text-[9.5px] leading-relaxed">
                {f.bad && (
                  <div className="flex items-start gap-2 rounded px-2 py-1" style={{ background: "rgba(240,84,108,0.07)" }}>
                    <span className="select-none font-bold" style={{ color: "var(--short)" }}>−</span>
                    <code className="text-[var(--short)]" style={{ textDecoration: "line-through", textDecorationColor: "rgba(240,84,108,0.5)" }}>{f.bad}</code>
                  </div>
                )}
                {f.good && (
                  <div className="flex items-start gap-2 rounded px-2 py-1" style={{ background: "rgba(47,201,143,0.07)" }}>
                    <span className="select-none font-bold" style={{ color: "var(--long)" }}>+</span>
                    <code className="text-[var(--long)]">{f.good}</code>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 border-t pt-2.5 font-body text-[10px] italic leading-snug text-[var(--dim)]" style={{ borderColor: "var(--line-soft)" }}>
        Prose → code transcription rule: every bracketed marker in the source must be matched against the spec
        before it is allowed to survive as a bar offset. When in doubt, it was a footnote.
      </div>
    </div>
  );
}
