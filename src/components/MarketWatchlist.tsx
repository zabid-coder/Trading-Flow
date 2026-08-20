import { SUPPORTED_SYMBOLS, SymbolMeta } from "../engine/types";

interface Props {
  activeSymbol: string;
  onSelect: (sym: string) => void;
  price: number;
  feedMode: "simulated" | "live";
}

export default function MarketWatchlist({ activeSymbol, onSelect, price, feedMode }: Props) {
  return (
    <div
      className="glass-panel overflow-hidden shadow-2xl font-mono text-[11px] flex flex-col h-full border border-white/10"
    >
      {/* Header */}
      <div
        className="flex items-center justify-between border-b px-3 py-2 border-white/10 bg-black/40"
      >
        <span className="font-extrabold text-white text-[11px] tracking-wider">MARKET WATCH</span>
        <span
          className="text-[8.5px] px-1.5 py-0.5 rounded font-extrabold"
          style={{
            background: feedMode === "live" ? "rgba(47,201,143,0.18)" : "rgba(232,180,76,0.18)",
            color: feedMode === "live" ? "var(--long)" : "var(--gold-hi)",
          }}
        >
          {feedMode === "live" ? "LIVE" : "SIM"}
        </span>
      </div>

      {/* Symbol List */}
      <div className="divide-y divide-[var(--line)]">
        {SUPPORTED_SYMBOLS.map((s: SymbolMeta) => {
          const isActive = s.symbol === activeSymbol;
          return (
            <button
              key={s.symbol}
              onClick={() => onSelect(s.symbol)}
              className={`w-full p-2.5 text-left transition-all flex items-center justify-between hover:bg-[var(--bg2)] ${
                isActive ? "bg-[#162238] border-l-2 border-[var(--gold)]" : ""
              }`}
            >
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-[11.5px] text-white">{s.symbol}</span>
                  <span className="text-[8px] px-1 py-px rounded bg-[#1e293b] text-[var(--dim)] font-semibold">
                    {s.source}
                  </span>
                </div>
                <div className="text-[9px] text-[var(--muted)] truncate max-w-[120px]">{s.label}</div>
              </div>

              <div className="text-right">
                <div className="font-bold text-[11.5px] text-white">
                  {isActive ? price.toFixed(s.digits) : s.category === "FOREX" ? "1.0850" : s.symbol.startsWith("BTC") ? "68,450" : s.symbol.startsWith("ETH") ? "3,610" : "2,748.50"}
                </div>
                <div className="text-[9px] text-[#2fc98f] font-semibold">+0.42%</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Quick Info Box */}
      <div className="mt-auto p-2.5 border-t border-[var(--line)] bg-[var(--bg2)] text-[9.5px] text-[var(--dim)] space-y-1">
        <div className="flex items-center justify-between">
          <span>DATA FEED:</span>
          <span className="text-white font-bold">{feedMode === "live" ? "Binance / OANDA Live" : "Calibrated Simulator"}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>SPREAD MODEL:</span>
          <span className="text-[var(--gold)] font-bold">Dynamic Tier-1</span>
        </div>
      </div>
    </div>
  );
}
