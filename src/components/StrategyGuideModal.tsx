interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function StrategyGuideModal({ isOpen, onClose }: Props) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-fade-in font-mono text-[11.5px]">
      <div
        className="w-full max-w-3xl rounded-xl border p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto glass-panel border-white/15"
        style={{ color: "var(--ink)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b pb-3 border-white/10">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--gold)] text-black text-[11px] font-black">
              ?
            </span>
            <h2 className="text-sm font-bold tracking-wider text-[var(--gold-hi)]">
              TRADING FLOW · STRATEGY PLAYBOOK & EXECUTION GUIDE
            </h2>
          </div>
          <button onClick={onClose} className="text-[var(--dim)] hover:text-white px-2 py-1 text-sm">
            ✕
          </button>
        </div>

        {/* Section 1: Workflow */}
        <div className="p-3 rounded border space-y-2" style={{ borderColor: "var(--line)", background: "var(--bg2)" }}>
          <div className="font-bold text-[12px] text-white">1. Where to Click & How to Trade (Professional Workflow)</div>
          <div className="text-[10.5px] text-[var(--muted)] leading-relaxed space-y-1.5">
            <p>
              • <strong>Automated / Supervised Mode</strong>: When a high-probability institutional trap forms, it lands in the <span className="text-[var(--gold)] font-bold">Action Center</span> on your right. Click <strong>"✓ APPROVE & DISPATCH"</strong> to send the order to MetaTrader 5 / Exness or your paper account.
            </p>
            <p>
              • <strong>Manual Discretionary Mode</strong>: Use the <span className="text-[var(--long)] font-bold">Pro Order Desk</span> to place immediate Buy/Sell orders with automated lot sizing based on your exact USD risk.
            </p>
            <p>
              • <strong>Live vs Simulator</strong>: Switch the top bar between <strong>"LIVE REAL"</strong> (connected to live OANDA Gold & Binance feeds) and <strong>"SIMULATOR"</strong> for instant scenario backtesting.
            </p>
          </div>
        </div>

        {/* Section 2: Active Strategies */}
        <div className="p-3 rounded border space-y-2.5" style={{ borderColor: "var(--line)", background: "var(--bg2)" }}>
          <div className="font-bold text-[12px] text-white">2. Active Strategies & Algorithm Logic</div>

          <div className="border-l-2 border-[var(--long)] pl-2.5 space-y-1">
            <div className="font-bold text-[11px] text-[var(--long)]">Strategy A: Liquidity Trap & Sweep (Course Core)</div>
            <div className="text-[10px] text-[var(--muted)] leading-relaxed">
              Price hunts stops above Prior Day High (PDH) or below Prior Day Low (PDL), fails to hold, and closes back inside on a Long/High Pin Rejection (LPR/HPR) wick. We enter at candle close with a tight stop outside the sweep and a 1:2 to 1:3 Take Profit.
            </div>
          </div>

          <div className="border-l-2 border-[var(--gold)] pl-2.5 space-y-1">
            <div className="font-bold text-[11px] text-[var(--gold)]">Strategy B: Institutional Order Block & FVG Retest</div>
            <div className="text-[10px] text-[var(--muted)] leading-relaxed">
              Identifies unmitigated Fair Value Gaps (FVG) and institutional supply/demand order blocks, entering when price pulls back into the zone with confirmation.
            </div>
          </div>
        </div>

        {/* Section 3: Risk & Discipline Math */}
        <div className="p-3 rounded border space-y-2" style={{ borderColor: "var(--line)", background: "var(--bg2)" }}>
          <div className="font-bold text-[12px] text-white">3. Institutional Risk Management Rules</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[10px] text-[var(--muted)]">
            <div className="p-2 rounded bg-[var(--bg)] border border-[var(--line)]">
              <span className="font-bold text-white block mb-0.5">Fixed USD Risk Sizing</span>
              Position size is calculated dynamically: <br />
              <code className="text-[var(--gold)]">Lots = Risk $ / (Stop Distance × Point Value)</code>
            </div>
            <div className="p-2 rounded bg-[var(--bg)] border border-[var(--line)]">
              <span className="font-bold text-white block mb-0.5">Daily Loss Circuit Breaker</span>
              If the engine hits 2 stop-losses in a single day, trading automatically halts to prevent tilt and drawdowns.
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-5 py-1.5 rounded bg-[var(--gold)] text-black font-bold text-[11px] hover:brightness-110"
          >
            Got It, Back to Terminal
          </button>
        </div>
      </div>
    </div>
  );
}
