import { useEffect, useRef, useState } from "react";
import type { EngineConfig, EngineState } from "../engine/types";
import { fmtClock, fmtP, SUPPORTED_SYMBOLS } from "../engine/types";
import { secureRandomId } from "../utils/crypto";
import PineScriptModal from "./PineScriptModal";

const N = 110;
const W = 1000;
const H = 490;
const AXIS = 68;
const PLOT = W - AXIS;
const PAD_T = 20;
const PAD_B = 54;

function niceStep(span: number) {
  const raw = span / 6;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const r = raw / mag;
  const m = r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10;
  return m * mag;
}

interface Props {
  st: EngineState;
  cfg: EngineConfig;
  onDecide?: (id: number, approve: boolean) => void;
  onMoveToBreakeven?: () => void;
  onPartialClose?: (ratio?: number) => void;
}

export default function CandleChart({
  st,
  cfg,
  onDecide,
  onMoveToBreakeven,
  onPartialClose,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const tvContainerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ i: number; y: number } | null>(null);
  const [pineModalOpen, setPineModalOpen] = useState(false);

  // Pine Script Indicator Overlay Toggles
  const [showTrapSignals, setShowTrapSignals] = useState(true);
  const [showRejectionWicks, setShowRejectionWicks] = useState(true);
  const [showAoiLines, setShowAoiLines] = useState(true);
  const [showOrderBlocks, setShowOrderBlocks] = useState(true);

  const activeMeta =
    SUPPORTED_SYMBOLS.find((s) => s.symbol === cfg.activeSymbol) || SUPPORTED_SYMBOLS[0];

  // Embed TradingView widget if chartView === "tradingview"
  useEffect(() => {
    if (cfg.chartView !== "tradingview" || !tvContainerRef.current) return;

    tvContainerRef.current.innerHTML = "";
    const containerId = secureRandomId("tv_chart_container");
    const div = document.createElement("div");
    div.id = containerId;
    div.style.height = "100%";
    div.style.width = "100%";
    tvContainerRef.current.appendChild(div);

    const tvIntervalMap: Record<string, string> = {
      "1m": "1",
      "5m": "5",
      "15m": "15",
      "30m": "30",
      "1h": "60",
      "4h": "240",
    };

    const bootWidget = () => {
      if (!(window as any).TradingView) return;
      new (window as any).TradingView.widget({
        autosize: true,
        symbol: activeMeta.tvSymbol,
        interval: tvIntervalMap[cfg.timeframe] || "15",
        timezone: "Etc/UTC",
        theme: "dark",
        style: "1",
        locale: "en",
        toolbar_bg: "#0c121e",
        enable_publishing: false,
        hide_top_toolbar: false,
        allow_symbol_change: true,
        backgroundColor: "#0c121e",
        gridColor: "rgba(127,149,180,0.08)",
        container_id: containerId,
      });
    };

    if ((window as any).TradingView) {
      bootWidget();
    } else {
      const s = document.createElement("script");
      s.src = "https://s3.tradingview.com/tv.js";
      s.async = true;
      s.onload = bootWidget;
      document.head.appendChild(s);
    }
  }, [cfg.chartView, cfg.activeSymbol, cfg.timeframe, activeMeta.tvSymbol]);

  const bars = st.bars.slice(-N);
  const offset = st.bars.length - bars.length;

  let lo = Infinity;
  let hi = -Infinity;
  for (const b of bars) {
    lo = Math.min(lo, b.l);
    hi = Math.max(hi, b.h);
  }
  const open = st.open;
  if (open) {
    lo = Math.min(lo, open.sl);
    hi = Math.max(hi, open.tp);
  }
  let span = hi - lo;
  if (span < 1) span = 1;

  // fold in nearby AOI levels
  const aois = st.aois.filter((a) => a.active);
  const extra: number[] = [];
  for (const a of aois) {
    for (const e of [a.y1, a.y2]) if (e > lo - span * 0.3 && e < hi + span * 0.3) extra.push(e);
  }
  if (extra.length) {
    lo = Math.min(lo, ...extra);
    hi = Math.max(hi, ...extra);
    span = hi - lo;
  }
  lo -= span * 0.05;
  hi += span * 0.05;
  span = hi - lo;

  const y = (p: number) => PAD_T + ((hi - p) / span) * (H - PAD_T - PAD_B);
  const xOf = (i: number) => ((i + 0.5) * PLOT) / N;
  const bw = Math.max(2.5, (PLOT / N) * 0.58);

  const step = niceStep(span);
  const gridLines: number[] = [];
  for (let p = Math.ceil(lo / step) * step; p < hi; p += step) gridLines.push(p);

  const last = bars[bars.length - 1] || { t: Date.now(), o: 2750, h: 2750, l: 2750, c: 2750, v: 0, day: 0 };
  const lastY = y(last.c);

  const visTrades = st.trades.filter((t) => t.entryIndex >= offset);

  // Exact Pine Script v5 mathematical indicator evaluations for every bar
  const evaluatedBars = bars.map((b, i) => {
    const candleRange = b.h - b.l;
    const bodyRange = Math.abs(b.c - b.o);
    const upperWick = b.h - Math.max(b.o, b.c);
    const lowerWick = Math.min(b.o, b.c) - b.l;

    // Pine Script LPR / HPR Rejections
    const lowerWickPct = candleRange > 0 ? (lowerWick / candleRange) * 100 : 0;
    const upperWickPct = candleRange > 0 ? (upperWick / candleRange) * 100 : 0;

    const isLPR = candleRange > 0 && lowerWick >= candleRange * (cfg.rejThresh || 0.5) && lowerWick > bodyRange;
    const isHPR = candleRange > 0 && upperWick >= candleRange * (cfg.rejThresh || 0.5) && upperWick > bodyRange;

    // Power Candle Breakout
    const isPowerBull = b.c > b.o && bodyRange >= 1.15 * st.atr && upperWick <= candleRange * 0.22;
    const isPowerBear = b.o > b.c && bodyRange >= 1.15 * st.atr && lowerWick <= candleRange * 0.22;

    // Trap Reversal Logic (Right-Side Identity)
    let bullishTrap = false;
    let bearishTrap = false;
    let sweptAoiLabel = "";

    for (const a of aois) {
      if (a.role === "S" && b.l < a.ty && b.c > a.ty && isLPR) {
        bullishTrap = true;
        sweptAoiLabel = a.label;
        break;
      }
      if (a.role === "R" && b.h > a.ty && b.c < a.ty && isHPR) {
        bearishTrap = true;
        sweptAoiLabel = a.label;
        break;
      }
    }

    return {
      b,
      i,
      candleRange,
      bodyRange,
      upperWick,
      lowerWick,
      lowerWickPct,
      upperWickPct,
      isLPR,
      isHPR,
      isPowerBull,
      isPowerBear,
      bullishTrap,
      bearishTrap,
      sweptAoiLabel,
    };
  });

  const onMove = (e: React.MouseEvent) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return;
    const mx = ((e.clientX - r.left) / r.width) * W;
    const my = ((e.clientY - r.top) / r.height) * H;
    const i = Math.floor((mx / PLOT) * N);
    if (i >= 0 && i < bars.length && mx <= PLOT) setHover({ i, y: my });
    else setHover(null);
  };

  const hoverData = hover ? evaluatedBars[hover.i] : null;

  return (
    <div
      className="rounded-xl border overflow-hidden shadow-2xl font-mono text-[11.5px] bg-[var(--bg1)]"
      style={{ borderColor: "var(--line)" }}
    >
      {/* Pine Script Modal */}
      <PineScriptModal isOpen={pineModalOpen} onClose={() => setPineModalOpen(false)} />

      {/* Top Header & Indicator Toolbar */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 bg-[#090d16]"
        style={{ borderColor: "var(--line)" }}
      >
        <div className="flex items-center gap-3">
          <span className="font-bold text-[12px] text-white">
            {activeMeta.label} · <span className="text-[var(--gold)]">{cfg.timeframe.toUpperCase()}</span>
          </span>
          <span className="text-[10px] text-[var(--dim)]">
            ATR(14): <span className="text-white font-semibold">${st.atr.toFixed(2)}</span>
          </span>
        </div>

        {/* Pine Script Indicator Overlay Toggles */}
        <div className="flex flex-wrap items-center gap-2 text-[10px]">
          <button
            onClick={() => setShowTrapSignals(!showTrapSignals)}
            className={`px-2 py-0.5 rounded font-bold transition-all ${
              showTrapSignals
                ? "bg-[#2fc98f]/20 border border-[#2fc98f]/60 text-[#2fc98f]"
                : "border border-[var(--line)] text-[var(--dim)]"
            }`}
          >
            {showTrapSignals ? "✓ TRAP SIGNALS (▲/▼)" : "TRAP SIGNALS"}
          </button>

          <button
            onClick={() => setShowRejectionWicks(!showRejectionWicks)}
            className={`px-2 py-0.5 rounded font-bold transition-all ${
              showRejectionWicks
                ? "bg-[var(--gold)]/20 border border-[var(--gold)]/60 text-[var(--gold)]"
                : "border border-[var(--line)] text-[var(--dim)]"
            }`}
          >
            {showRejectionWicks ? "✓ LPR/HPR WICKS" : "LPR/HPR WICKS"}
          </button>

          <button
            onClick={() => setShowAoiLines(!showAoiLines)}
            className={`px-2 py-0.5 rounded font-bold transition-all ${
              showAoiLines
                ? "bg-[#388bfd]/20 border border-[#388bfd]/60 text-[#388bfd]"
                : "border border-[var(--line)] text-[var(--dim)]"
            }`}
          >
            {showAoiLines ? "✓ AOI (PDH/PDL)" : "AOI LEVELS"}
          </button>

          {/* Export / View Pine Script Code Button */}
          <button
            onClick={() => setPineModalOpen(true)}
            className="px-2.5 py-1 rounded bg-[var(--gold)] text-black font-black text-[10px] hover:brightness-110 transition-all flex items-center gap-1 shadow"
          >
            <span>📜 PINE SCRIPT (v5)</span>
          </button>
        </div>
      </div>

      {/* Main Chart Body */}
      <div className="relative min-h-[490px] bg-[#070b14]">
        {cfg.chartView === "tradingview" ? (
          <div ref={tvContainerRef} className="h-[490px] w-full" />
        ) : (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            className="block w-full cursor-crosshair select-none"
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
          >
            {/* Horizontal Grid lines */}
            {gridLines.map((p) => (
              <g key={p}>
                <line
                  x1={0}
                  x2={PLOT}
                  y1={y(p)}
                  y2={y(p)}
                  stroke="rgba(255,255,255,0.05)"
                  strokeWidth="0.8"
                  strokeDasharray="2 4"
                />
                <text
                  x={PLOT + 6}
                  y={y(p) + 3.5}
                  fill="var(--dim)"
                  fontSize="9.5"
                  fontFamily="var(--font-mono)"
                >
                  {fmtP(p, activeMeta.digits)}
                </text>
              </g>
            ))}

            {/* AOI Zones & Horizontal Indicator Plots */}
            {showAoiLines &&
              aois.map((a, i) => {
                const yTop = y(Math.max(a.y1, a.y2));
                const yBot = y(Math.min(a.y1, a.y2));
                const hZone = Math.max(2, yBot - yTop);
                const isRes = a.role === "R";
                const col = isRes ? "#f0546c" : "#2fc98f";
                return (
                  <g key={i}>
                    {/* Shaded AOI / Order Block Band */}
                    <rect
                      x={0}
                      y={yTop}
                      width={PLOT}
                      height={hZone}
                      fill={isRes ? "rgba(240,84,108,0.07)" : "rgba(47,201,143,0.07)"}
                      stroke={col}
                      strokeWidth="0.8"
                      strokeDasharray="3 3"
                    />
                    <text
                      x={8}
                      y={yTop + 10}
                      fill={col}
                      fontSize="9"
                      fontWeight="800"
                      fontFamily="var(--font-mono)"
                    >
                      {a.label} ({fmtP(a.ty, activeMeta.digits)})
                    </text>
                  </g>
                );
              })}

            {/* BM Trading Range Breakout EA Overlays */}
            {cfg.rbEnabled && st.rbHigh != null && st.rbLow != null && (
              <g className="range-breakout-overlay">
                {(() => {
                  const isGold = (cfg.activeSymbol || "").startsWith("XAU");
                  const pointScale = isGold ? 0.01 : 0.0001;
                  const buffer = (cfg.rbBufferPoints ?? 20) * pointScale;
                  const longTrigger = st.rbHigh + buffer;
                  const shortTrigger = st.rbLow - buffer;
                  const yHigh = y(st.rbHigh);
                  const yLow = y(st.rbLow);
                  const yBuyTrig = y(longTrigger);
                  const ySellTrig = y(shortTrigger);

                  return (
                    <>
                      {/* Shaded Range Channel */}
                      <rect
                        x={0}
                        y={Math.min(yHigh, yLow)}
                        width={PLOT}
                        height={Math.max(2, Math.abs(yLow - yHigh))}
                        fill="rgba(234, 179, 8, 0.05)"
                        stroke="rgba(234, 179, 8, 0.4)"
                        strokeWidth="1"
                        strokeDasharray="4 4"
                      />
                      {/* Range High Line */}
                      <line x1={0} y1={yHigh} x2={PLOT} y2={yHigh} stroke="#eab308" strokeWidth="1.2" />
                      <text x={PLOT - 160} y={yHigh - 4} fill="#eab308" fontSize="8.5" fontWeight="bold" fontFamily="var(--font-mono)">
                        RB HIGH: {fmtP(st.rbHigh, activeMeta.digits)}
                      </text>

                      {/* Range Low Line */}
                      <line x1={0} y1={yLow} x2={PLOT} y2={yLow} stroke="#eab308" strokeWidth="1.2" />
                      <text x={PLOT - 160} y={yLow + 10} fill="#eab308" fontSize="8.5" fontWeight="bold" fontFamily="var(--font-mono)">
                        RB LOW: {fmtP(st.rbLow, activeMeta.digits)}
                      </text>

                      {/* Buy Trigger Level */}
                      <line x1={0} y1={yBuyTrig} x2={PLOT} y2={yBuyTrig} stroke="#2fc98f" strokeWidth="1" strokeDasharray="2 2" />
                      <text x={PLOT - 140} y={yBuyTrig - 4} fill="#2fc98f" fontSize="8" fontWeight="bold" fontFamily="var(--font-mono)">
                        ▲ BUY TRIGGER: {fmtP(longTrigger, activeMeta.digits)}
                      </text>

                      {/* Sell Trigger Level */}
                      <line x1={0} y1={ySellTrig} x2={PLOT} y2={ySellTrig} stroke="#f0546c" strokeWidth="1" strokeDasharray="2 2" />
                      <text x={PLOT - 140} y={ySellTrig + 10} fill="#f0546c" fontSize="8" fontWeight="bold" fontFamily="var(--font-mono)">
                        ▼ SELL TRIGGER: {fmtP(shortTrigger, activeMeta.digits)}
                      </text>
                    </>
                  );
                })()}
              </g>
            )}

            {/* Candlesticks with Exact Pine Script Highlights */}
            {evaluatedBars.map((item) => {
              const { b, i, isLPR, isHPR, isPowerBull, isPowerBear, bullishTrap, bearishTrap, lowerWickPct, upperWickPct } = item;
              const xi = xOf(i);
              const yo = y(b.o);
              const yc = y(b.c);
              const yh = y(b.h);
              const yl = y(b.l);
              const isUp = b.c >= b.o;
              const col = isUp ? "#2fc98f" : "#f0546c";
              const bodyTop = Math.min(yo, yc);
              const bodyH = Math.max(1.5, Math.abs(yc - yo));

              return (
                <g key={i}>
                  {/* Candlestick Wicks */}
                  <line
                    x1={xi}
                    x2={xi}
                    y1={yh}
                    y2={yl}
                    stroke={isLPR ? "#2fc98f" : isHPR ? "#f0546c" : col}
                    strokeWidth={isLPR || isHPR ? "1.8" : "1.2"}
                  />

                  {/* Real Body */}
                  <rect
                    x={xi - bw / 2}
                    y={bodyTop}
                    width={bw}
                    height={bodyH}
                    fill={col}
                    rx={0.5}
                  />

                  {/* LPR / HPR Rejection Wick Badge */}
                  {showRejectionWicks && isLPR && (
                    <g>
                      <circle cx={xi} cy={yl} r="3" fill="#2fc98f" />
                      <text
                        x={xi}
                        y={yl + 11}
                        textAnchor="middle"
                        fill="#2fc98f"
                        fontSize="7.5"
                        fontWeight="900"
                        fontFamily="var(--font-mono)"
                      >
                        LPR {lowerWickPct.toFixed(0)}%
                      </text>
                    </g>
                  )}

                  {showRejectionWicks && isHPR && (
                    <g>
                      <circle cx={xi} cy={yh} r="3" fill="#f0546c" />
                      <text
                        x={xi}
                        y={yh - 5}
                        textAnchor="middle"
                        fill="#f0546c"
                        fontSize="7.5"
                        fontWeight="900"
                        fontFamily="var(--font-mono)"
                      >
                        HPR {upperWickPct.toFixed(0)}%
                      </text>
                    </g>
                  )}

                  {/* Pine Script Bullish Trap Entry Signal (▲ Buy Low) */}
                  {showTrapSignals && bullishTrap && (
                    <g>
                      {/* Triangle Up Shape */}
                      <path
                        d={`M${xi - 5},${yl + 22} L${xi + 5},${yl + 22} L${xi},${yl + 14} Z`}
                        fill="#2fc98f"
                        stroke="#000"
                        strokeWidth="0.8"
                      />
                      <rect
                        x={xi - 28}
                        y={yl + 24}
                        width={56}
                        height={13}
                        rx="2"
                        fill="#2fc98f"
                      />
                      <text
                        x={xi}
                        y={yl + 33}
                        textAnchor="middle"
                        fill="#000"
                        fontSize="7.5"
                        fontWeight="900"
                        fontFamily="var(--font-mono)"
                      >
                        TRAP BUY
                      </text>
                    </g>
                  )}

                  {/* Pine Script Bearish Trap Entry Signal (▼ Sell High) */}
                  {showTrapSignals && bearishTrap && (
                    <g>
                      {/* Triangle Down Shape */}
                      <path
                        d={`M${xi - 5},${yh - 22} L${xi + 5},${yh - 22} L${xi},${yh - 14} Z`}
                        fill="#f0546c"
                        stroke="#000"
                        strokeWidth="0.8"
                      />
                      <rect
                        x={xi - 28}
                        y={yh - 37}
                        width={56}
                        height={13}
                        rx="2"
                        fill="#f0546c"
                      />
                      <text
                        x={xi}
                        y={yh - 28}
                        textAnchor="middle"
                        fill="#000"
                        fontSize="7.5"
                        fontWeight="900"
                        fontFamily="var(--font-mono)"
                      >
                        TRAP SELL
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* Entry / Exit Markers */}
            {visTrades.map((t) => {
              const xi = xOf(t.entryIndex - offset);
              const col = t.side === "LONG" ? "#2fc98f" : "#f0546c";
              const ye = y(t.entry);
              return (
                <g key={"t" + t.id}>
                  {t.side === "LONG" ? (
                    <path d={`M${xi - 6},${ye + 14} L${xi + 6},${ye + 14} L${xi},${ye + 4} Z`} fill={col} stroke="#000" strokeWidth="0.8" />
                  ) : (
                    <path d={`M${xi - 6},${ye - 14} L${xi + 6},${ye - 14} L${xi},${ye - 4} Z`} fill={col} stroke="#000" strokeWidth="0.8" />
                  )}
                  {t.exit != null && t.exitIndex != null && t.exitIndex >= offset && (
                    <circle
                      cx={xOf(t.exitIndex - offset)}
                      cy={y(t.exit)}
                      r="3.5"
                      fill="var(--bg1)"
                      stroke={(t.pnl ?? 0) >= 0 ? "#2fc98f" : "#f0546c"}
                      strokeWidth="1.8"
                    />
                  )}
                </g>
              );
            })}

            {/* Last Price Marker */}
            <line
              x1={0}
              x2={PLOT}
              y1={lastY}
              y2={lastY}
              stroke="var(--gold)"
              strokeWidth="1.2"
              strokeDasharray="2 3"
              opacity="0.9"
            />
            <rect x={PLOT + 2} y={lastY - 8} width={AXIS - 4} height={16} rx={2} fill="var(--gold)" />
            <text
              x={PLOT + AXIS / 2}
              y={lastY + 3.5}
              textAnchor="middle"
              fill="#000"
              fontSize="10"
              fontWeight="900"
              fontFamily="var(--font-mono)"
            >
              {fmtP(last.c, activeMeta.digits)}
            </text>

            {/* Crosshair */}
            {hover && hoverData && (
              <g>
                <line
                  x1={xOf(hover.i)}
                  x2={xOf(hover.i)}
                  y1={PAD_T}
                  y2={H - PAD_B}
                  stroke="var(--muted)"
                  strokeWidth="0.8"
                  strokeDasharray="3 3"
                  opacity="0.7"
                />
                <line
                  x1={0}
                  x2={PLOT}
                  y1={hover.y}
                  y2={hover.y}
                  stroke="var(--muted)"
                  strokeWidth="0.8"
                  strokeDasharray="3 3"
                  opacity="0.5"
                />
                {hover.y > PAD_T && hover.y < H - PAD_B && (
                  <g>
                    <rect x={PLOT + 2} y={hover.y - 8} width={AXIS - 4} height={16} rx={2} fill="#253553" />
                    <text
                      x={PLOT + AXIS / 2}
                      y={hover.y + 3.5}
                      textAnchor="middle"
                      fill="#fff"
                      fontSize="9.5"
                      fontFamily="var(--font-mono)"
                    >
                      {(hi - ((hover.y - PAD_T) / (H - PAD_T - PAD_B)) * span).toFixed(activeMeta.digits)}
                    </text>
                  </g>
                )}
              </g>
            )}
          </svg>
        )}

        {/* Hover Logic Inspector Tooltip (Pine Script Conditions Breakdown) */}
        {hoverData && cfg.chartView === "native" && (
          <div
            className="absolute bottom-3 left-3 z-30 rounded-lg p-2.5 shadow-xl font-mono text-[10px] space-y-1 bg-[#060910]/95 border border-[var(--line)] backdrop-blur-md"
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-1">
              <span className="text-[var(--gold)] font-bold">PINE SCRIPT LOGIC INSPECTOR</span>
              <span className="text-white">{fmtClock(hoverData.b.t)}</span>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[9.5px]">
              <div>O: <span className="text-white">{fmtP(hoverData.b.o)}</span></div>
              <div>H: <span className="text-white">{fmtP(hoverData.b.h)}</span></div>
              <div>L: <span className="text-white">{fmtP(hoverData.b.l)}</span></div>
              <div>C: <span className="text-white">{fmtP(hoverData.b.c)}</span></div>
            </div>

            <div className="pt-1 border-t border-white/10 space-y-0.5 text-[9px]">
              <div className="flex items-center justify-between gap-2">
                <span>Lower Wick (LPR):</span>
                <span className={hoverData.isLPR ? "text-[#2fc98f] font-bold" : "text-[var(--dim)]"}>
                  {hoverData.lowerWickPct.toFixed(0)}% {hoverData.isLPR ? "(LPR CONFIRMED)" : ""}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>Upper Wick (HPR):</span>
                <span className={hoverData.isHPR ? "text-[#f0546c] font-bold" : "text-[var(--dim)]"}>
                  {hoverData.upperWickPct.toFixed(0)}% {hoverData.isHPR ? "(HPR CONFIRMED)" : ""}
                </span>
              </div>
              {hoverData.bullishTrap && (
                <div className="text-[#2fc98f] font-bold">
                  ★ BULLISH TRAP TRIGGERED ({hoverData.sweptAoiLabel})
                </div>
              )}
              {hoverData.bearishTrap && (
                <div className="text-[#f0546c] font-bold">
                  ★ BEARISH TRAP TRIGGERED ({hoverData.sweptAoiLabel})
                </div>
              )}
            </div>
          </div>
        )}

        {/* 1-Click Floating In-Chart Signal Decision HUD */}
        {cfg.chartView === "native" && onDecide && (() => {
          const pending = st.queue.filter((q) => q.status === "PENDING");
          if (pending.length === 0) return null;
          const topPending = pending[0];
          const lastIdx = st.bars.length - 1;
          const barsLeft = Math.max(0, 4 - (lastIdx - topPending.entryIndex));
          const isLong = topPending.side === "LONG";

          return (
            <div
              className="absolute top-4 right-20 z-20 flex flex-col gap-2 rounded-xl p-3.5 shadow-2xl bg-[#090d16]/95 border backdrop-blur-md select-none min-w-[280px]"
              style={{
                borderColor: isLong ? "rgba(47,201,143,0.5)" : "rgba(240,84,108,0.5)",
                boxShadow: isLong ? "0 0 24px rgba(47,201,143,0.2)" : "0 0 24px rgba(240,84,108,0.2)",
              }}
            >
              <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2">
                <div className="flex items-center gap-1.5">
                  <span
                    className="rounded px-2 py-0.5 font-mono text-[10px] font-black tracking-wider"
                    style={{
                      background: isLong ? "rgba(47,201,143,0.2)" : "rgba(240,84,108,0.2)",
                      color: isLong ? "#2fc98f" : "#f0546c",
                      border: `1px solid ${isLong ? "rgba(47,201,143,0.6)" : "rgba(240,84,108,0.6)"}`,
                    }}
                  >
                    {topPending.side}
                  </span>
                  <span className="font-mono text-[11px] font-bold text-white tracking-tight">{topPending.setup}</span>
                </div>
                <span className="font-mono text-[9.5px] font-bold text-[var(--gold-hi)] bg-[var(--gold)]/10 px-1.5 py-0.5 rounded">
                  {barsLeft} BAR{barsLeft === 1 ? "" : "S"} LEFT
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 font-mono text-[10.5px] my-0.5">
                <div>
                  <span className="text-[8px] text-[var(--dim)] block tracking-widest">ENTRY</span>
                  <span className="font-bold text-white">{fmtP(topPending.entry, activeMeta.digits)}</span>
                </div>
                <div>
                  <span className="text-[8px] text-[var(--dim)] block tracking-widest">STOP</span>
                  <span className="font-bold text-[#f0546c]">{fmtP(topPending.sl, activeMeta.digits)}</span>
                </div>
                <div>
                  <span className="text-[8px] text-[var(--dim)] block tracking-widest">TARGET</span>
                  <span className="font-bold text-[#2fc98f]">{fmtP(topPending.tp, activeMeta.digits)}</span>
                </div>
              </div>

              {/* Progress countdown */}
              <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${(barsLeft / 4) * 100}%`,
                    background: barsLeft <= 1 ? "#f0546c" : "var(--gold)",
                  }}
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => onDecide(topPending.id, true)}
                  className="flex-1 rounded-lg py-2 font-mono text-[11px] font-extrabold tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-md hover:brightness-110"
                  style={{
                    background: "#2fc98f",
                    color: "#000",
                  }}
                >
                  <span>✓</span>
                  <span>{cfg.feedMode === "live" ? "DISPATCH" : "APPROVE"}</span>
                </button>
                <button
                  onClick={() => onDecide(topPending.id, false)}
                  className="px-3 rounded-lg py-2 font-mono text-[11px] font-bold border border-white/20 text-[var(--muted)] hover:bg-white/10 transition-all"
                >
                  REJECT
                </button>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
