const SYMBOLS = [
  { s: "XAUUSD", p: 2031.4, d: 2 },
  { s: "XAGUSD", p: 24.18, d: 2 },
  { s: "EURUSD", p: 1.0842, d: 4 },
  { s: "GBPUSD", p: 1.2716, d: 4 },
  { s: "USDJPY", p: 151.42, d: 2 },
  { s: "US30", p: 39128, d: 0 },
  { s: "US100", p: 18344, d: 0 },
  { s: "BTCUSD", p: 67241, d: 0 },
  { s: "DXY", p: 104.31, d: 2 },
  { s: "USOIL", p: 78.44, d: 2 },
  { s: "GER40", p: 18491, d: 0 },
  { s: "AUDUSD", p: 0.6571, d: 4 },
];

export default function TickerTape({ tick }: { tick: number }) {
  const items = SYMBOLS.map((x, i) => {
    const drift = Math.sin(tick * 0.35 + i * 1.7) * 0.28 + Math.sin(tick * 0.09 + i) * 0.14;
    const price = x.p * (1 + drift / 100);
    return { ...x, price, up: drift >= 0 };
  });

  const row = (keyPrefix: string) => (
    <div className="flex shrink-0 items-center" aria-hidden={keyPrefix === "b"}>
      {items.map((it) => (
        <span key={keyPrefix + it.s} className="flex items-center gap-2 px-5 font-mono text-[11px]">
          <span className="font-semibold tracking-wider" style={{ color: it.s === "XAUUSD" ? "var(--gold)" : "var(--muted)" }}>
            {it.s}
          </span>
          <span style={{ color: "var(--ink)" }}>{it.price.toFixed(it.d)}</span>
          <span style={{ color: it.up ? "var(--long)" : "var(--short)" }}>
            {it.up ? "▲" : "▼"} {Math.abs(it.price - it.p).toFixed(it.d)}
          </span>
          <span className="ml-3 h-1 w-1 rounded-full" style={{ background: "var(--line)" }} />
        </span>
      ))}
    </div>
  );

  return (
    <div
      className="relative overflow-hidden border-b py-1.5"
      style={{ borderColor: "var(--line-soft)", background: "rgba(10,15,24,0.85)" }}
    >
      <div className="marquee-track flex w-max">
        {row("a")}
        {row("b")}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-[#0a0f18] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-[#0a0f18] to-transparent" />
    </div>
  );
}
