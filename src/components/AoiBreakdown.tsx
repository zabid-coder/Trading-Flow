import type { EngineState } from "../engine/types";

const FAMILIES = ["DAY EXTREMES", "TRIPLES", "ORDER BLOCKS", "SESSIONS"] as const;

export default function AoiBreakdown({ st }: { st: EngineState }) {
  const closed = st.trades.filter((t) => !t.open);

  const rows = FAMILIES.map((f) => {
    const ts = closed.filter((t) => t.family === f);
    const wins = ts.filter((t) => (t.pnl ?? 0) > 0).length;
    const net = ts.reduce((s, t) => s + (t.pnl ?? 0), 0);
    const avgR = ts.length ? ts.reduce((s, t) => s + (t.r ?? 0), 0) / ts.length : 0;
    return { f, n: ts.length, wins, winRate: ts.length ? (wins / ts.length) * 100 : 0, net, avgR };
  }).sort((a, b) => b.net - a.net);

  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.net)));
  const best = rows.find((r) => r.n > 0 && r.net > 0);
  const worst = [...rows].reverse().find((r) => r.n > 0 && r.net < 0);

  return (
    <div className="panel rise-in flex h-full flex-col p-4" style={{ animationDelay: "0.26s" }}>
      <div className="mb-2 flex items-center justify-between">
        <div className="panel-title">AOI Family Performance</div>
        <span className="font-mono text-[9px] tracking-[0.18em] text-[var(--dim)]">CLOSED TRADES ONLY · NET OF SPREAD</span>
      </div>

      {closed.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-md border border-dashed py-8" style={{ borderColor: "var(--line)" }}>
          <span className="font-body text-[11px] italic text-[var(--dim)]">Once trades close, this table reveals which AOI family actually pays you.</span>
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            {rows.map((r, i) => (
              <div key={r.f} className="group rounded-md border px-3 py-2 transition-all duration-200 hover:border-[var(--line)] hover:translate-x-[2px]" style={{ borderColor: "var(--line-soft)", background: "var(--bg1)" }}>
                <div className="flex items-center gap-3">
                  <span className="w-4 font-mono text-[10px] font-bold text-[var(--dim)]">{i + 1}</span>
                  <span className="w-[110px] shrink-0 font-mono text-[10px] font-semibold tracking-wider text-[var(--ink)]">{r.f}</span>
                  <span className="w-14 shrink-0 font-mono text-[9.5px] text-[var(--muted)]">{r.n} TRD</span>
                  <span className="w-14 shrink-0 font-mono text-[9.5px]" style={{ color: r.winRate >= 50 ? "var(--long)" : "var(--short)" }}>
                    {r.winRate.toFixed(0)}% W
                  </span>
                  <span className="w-16 shrink-0 font-mono text-[9.5px]" style={{ color: r.avgR >= 0 ? "var(--long)" : "var(--short)" }}>
                    {r.avgR >= 0 ? "+" : ""}{r.avgR.toFixed(2)}R
                  </span>
                  <div className="h-[6px] min-w-0 flex-1 overflow-hidden rounded-full" style={{ background: "var(--bg3)" }}>
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${(Math.abs(r.net) / maxAbs) * 100}%`,
                        background: r.net >= 0 ? "linear-gradient(90deg, rgba(47,201,143,0.4), var(--long))" : "linear-gradient(90deg, rgba(240,84,108,0.4), var(--short))",
                      }}
                    />
                  </div>
                  <span className="w-[70px] shrink-0 text-right font-mono text-[11px] font-bold" style={{ color: r.net >= 0 ? "var(--long)" : "var(--short)" }}>
                    {r.net >= 0 ? "+" : "−"}${Math.abs(r.net).toFixed(0)}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-auto border-t pt-2 font-body text-[10.5px] italic leading-snug text-[var(--muted)]" style={{ borderColor: "var(--line-soft)" }}>
            {best && worst ? (
              <>
                <span style={{ color: "var(--long)" }}>{best.f}</span> is paying · <span style={{ color: "var(--short)" }}>{worst.f}</span> is bleeding — consider toggling families in the AOI filters.
              </>
            ) : best ? (
              <>Every armed family is green so far — <span style={{ color: "var(--long)" }}>{best.f}</span> leads the board.</>
            ) : (
              <>Not enough closed data yet to rank the families.</>
            )}
          </div>
        </>
      )}
    </div>
  );
}
