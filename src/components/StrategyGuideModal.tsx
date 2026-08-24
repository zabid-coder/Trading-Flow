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

          <div className="border-l-2 border-[var(--gold)] pl-2.5 space-y-1">
            <div className="font-bold text-[11px] text-[var(--gold)]">1. Chris Creamer 4-Layer Institutional Framework (Core)</div>
            <div className="text-[10px] text-[var(--muted)] leading-relaxed">
              4-Gate Pipeline: (1) Environment (Synthetic GEX) ➔ (2) Location (0.705-0.886 Fibonacci OTE Discount/Premium) ➔ (3) Confirmation (Volume Delta & Trapped Traders Absorption) ➔ (4) 1:2.5R Precision Trigger.
            </div>
          </div>

          <div className="border-l-2 border-[var(--long)] pl-2.5 space-y-1">
            <div className="font-bold text-[11px] text-[var(--long)]">2. Asian Range Liquidity Sweep (Gold Special)</div>
            <div className="text-[10px] text-[var(--muted)] leading-relaxed">
              London session sweeps above/below 00:00–07:00 GMT Asian Range, traps breakout retail traders, and snaps back inside to target the opposite Asian boundary (Win rate 72-76%).
            </div>
          </div>

          <div className="border-l-2 border-blue-400 pl-2.5 space-y-1">
            <div className="font-bold text-[11px] text-blue-400">3. 50/200 EMA Institutional Trend Pullback</div>
            <div className="text-[10px] text-[var(--muted)] leading-relaxed">
              4H Macro trend alignment (EMA50 &gt; EMA200) executing high-probability pullbacks with Pin Bar (LPR/HPR) confirmation during London &amp; NY Killzones.
            </div>
          </div>

          <div className="border-l-2 border-purple-400 pl-2.5 space-y-1">
            <div className="font-bold text-[11px] text-purple-400">4. 14-Period RSI Exhaustion &amp; Momentum Fade</div>
            <div className="text-[10px] text-[var(--muted)] leading-relaxed">
              Fades extreme oversold (&le; 28) or overbought (&ge; 72) momentum spikes into key swing extremes with mean-reversion targets.
            </div>
          </div>
        </div>

        {/* Section 3: Risk & Discipline Math */}
        <div className="p-3 rounded border space-y-2" style={{ borderColor: "var(--line)", background: "var(--bg2)" }}>
          <div className="font-bold text-[12px] text-white">3. Institutional Anti-Blowout Risk Management</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[10px] text-[var(--muted)]">
            <div className="p-2 rounded bg-[var(--bg)] border border-[var(--line)]">
              <span className="font-bold text-white block mb-0.5">Dynamic 1.5% Percent Equity Sizing</span>
              Position size scales automatically with balance: <br />
              <code className="text-[var(--gold)]">Lots = (Balance × 1.5%) / (Stop Distance × Point Value)</code>
            </div>
            <div className="p-2 rounded bg-[var(--bg)] border border-[var(--line)]">
              <span className="font-bold text-white block mb-0.5">Anti-Streak Drawdown Guard</span>
              If 2 consecutive stop-losses occur, risk automatically cuts by 50% (0.75%) until the next win, mathematically preventing blowouts.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-2 border-t border-white/10">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded font-bold text-black bg-[var(--gold)] hover:bg-[var(--gold-hi)] transition-colors shadow-lg font-mono text-xs"
          >
            I UNDERSTAND THE RULES · CLOSE PLAYBOOK
          </button>
        </div>
      </div>
    </div>
  );
}
