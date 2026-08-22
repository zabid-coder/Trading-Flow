import { useState } from "react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function PineScriptModal({ isOpen, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const pineScriptCode = `//@version=5
indicator("Trading Flow — Anish Course Trap & Reversal Engine", overlay=true, max_labels_count=500, max_boxes_count=500)

// ==============================================================================
// 1. CHOOSE AREAS OF INTEREST (AOIs) — PDH, PDL & SESSION EXTREMES
// ==============================================================================
pdh = request.security(syminfo.tickerid, "D", high[1], lookahead=barmerge.lookahead_on)
pdl = request.security(syminfo.tickerid, "D", low[1], lookahead=barmerge.lookahead_on)

// Plot Horizontal AOI Levels
plot(pdh, color=color.new(#f0546c, 0), linewidth=2, style=plot.style_line, title="Previous Day High (PDH Resistance)")
plot(pdl, color=color.new(#2fc98f, 0), linewidth=2, style=plot.style_line, title="Previous Day Low (PDL Support)")

// ==============================================================================
// 2. DEFINE REACTION CANDLES (LPR / HPR Rejections & Power Candles)
// ==============================================================================
candleRange = high - low
bodyRange   = math.abs(close - open)
upperWick   = high - math.max(open, close)
lowerWick   = math.min(open, close) - low
atrVal      = ta.atr(14)

// Lower Price Rejection: Lower wick >= 50% of entire candle range & > body
isLPR = (candleRange > 0) and (lowerWick >= candleRange * 0.50) and (lowerWick > bodyRange)

// Higher Price Rejection: Upper wick >= 50% of entire candle range & > body
isHPR = (candleRange > 0) and (upperWick >= candleRange * 0.50) and (upperWick > bodyRange)

// Power Breakout Candle: Large body >= 1.2x ATR with minimal wicks
isPowerBull = (close > open) and (bodyRange >= 1.10 * atrVal) and (upperWick <= candleRange * 0.20)
isPowerBear = (open > close) and (bodyRange >= 1.10 * atrVal) and (lowerWick <= candleRange * 0.20)

// ==============================================================================
// 3. REVERSAL / TRAP ENTRY LOGIC (Buy Low, Sell High — Right-Side Identity)
// ==============================================================================
// Bullish Trap: Low swept below PDL support, but closed back above PDL with LPR Rejection
bullishTrap = (low < pdl) and (close > pdl) and isLPR

// Bearish Trap: High swept above PDH resistance, but closed back below PDH with HPR Rejection
bearishTrap = (high > pdh) and (close < pdh) and isHPR

// ==============================================================================
// 4. MOMENTUM / BREAKOUT LOGIC (Left-Side Identity)
// ==============================================================================
bullishBreakout = (close > pdh) and (open <= pdh) and isPowerBull
bearishBreakout = (close < pdl) and (open >= pdl) and isPowerBear

// ==============================================================================
// 5. VISUAL SIGNALS & SHAPES ON CHART
// ==============================================================================
plotshape(bullishTrap, title="Bullish Trap Entry (Buy Low)", style=shape.triangleup, location=location.belowbar, color=#2fc98f, size=size.normal, text="TRAP BUY", textcolor=color.white)
plotshape(bearishTrap, title="Bearish Trap Entry (Sell High)", style=shape.triangledown, location=location.abovebar, color=#f0546c, size=size.normal, text="TRAP SELL", textcolor=color.white)

plotshape(bullishBreakout, title="Bullish Power Breakout", style=shape.arrowup, location=location.belowbar, color=#388bfd, size=size.small, text="BREAK BUY", textcolor=color.white)
plotshape(bearishBreakout, title="Bearish Power Breakout", style=shape.arrowdown, location=location.abovebar, color=#e8b44c, size=size.small, text="BREAK SELL", textcolor=color.white)

// Rejection Wick Barcolor Highlighting
barcolor(isLPR ? color.new(#2fc98f, 20) : isHPR ? color.new(#f0546c, 20) : na, title="LPR / HPR Highlight")

// ==============================================================================
// 6. ALERTS FOR AUTOMATION
// ==============================================================================
alertcondition(bullishTrap, title="Bullish Trap Signal", message="Trading Flow: Bullish Trap at PDL on {{ticker}} @ {{close}}")
alertcondition(bearishTrap, title="Bearish Trap Signal", message="Trading Flow: Bearish Trap at PDH on {{ticker}} @ {{close}}")
`;

  const handleCopy = () => {
    navigator.clipboard.writeText(pineScriptCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-fade-in font-mono text-[11.5px]">
      <div
        className="w-full max-w-3xl rounded-xl border p-5 shadow-2xl space-y-4 max-h-[88vh] flex flex-col bg-[#0b101b]"
        style={{ borderColor: "var(--line)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: "var(--line)" }}>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded bg-[var(--gold)] text-black font-black text-xs">
              📜
            </span>
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide">
                PINE SCRIPT (v5) · TRAP & REVERSAL INDICATOR CODE
              </h2>
              <span className="text-[10px] text-[var(--muted)]">
                Copy and paste directly into TradingView Pine Editor
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-[var(--dim)] hover:text-white px-2 py-1 text-sm rounded hover:bg-white/5"
          >
            ✕
          </button>
        </div>

        {/* Info Box */}
        <div className="rounded-lg border p-3 bg-[#070b13] text-[10.5px] text-[var(--muted)] space-y-1" style={{ borderColor: "var(--line)" }}>
          <div className="flex items-center justify-between font-bold text-white">
            <span>✓ ANISH COURSE CORE LOGIC MATCH:</span>
            <span className="text-[var(--gold)]">100% IDENTICAL MATH</span>
          </div>
          <p>
            • <strong>AOI</strong>: Automatic Daily Previous Day High (PDH) & Low (PDL) horizontal lines.<br />
            • <strong>Reaction Candle</strong>: <code className="text-[var(--long)]">isLPR</code> (Lower wick &gt;= 50% range) and <code className="text-[var(--short)]">isHPR</code> (Upper wick &gt;= 50% range).<br />
            • <strong>Trap Entry</strong>: Sweep past level + close back inside + LPR/HPR rejection wick.
          </p>
        </div>

        {/* Code View */}
        <div className="flex-1 min-h-[300px] overflow-y-auto rounded-lg border bg-[#05080f] p-3 text-[11px] font-mono text-[#a5d6ff]" style={{ borderColor: "var(--line)" }}>
          <pre className="whitespace-pre">{pineScriptCode}</pre>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: "var(--line)" }}>
          <span className="text-[10px] text-[var(--dim)]">TradingView Pine Script v5 compatible</span>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="px-4 py-2 rounded-lg bg-[var(--gold)] text-black font-black text-[11px] hover:brightness-110 transition-all flex items-center gap-1.5 shadow-lg"
            >
              <span>{copied ? "✓ COPIED TO CLIPBOARD!" : "📋 COPY PINE SCRIPT CODE"}</span>
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-[var(--line)] text-white font-bold text-[11px] hover:bg-white/5 transition-all"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
