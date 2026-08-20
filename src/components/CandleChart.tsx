import { useEffect, useRef, useState } from "react";
import type { EngineConfig, EngineState } from "../engine/types";
import { fmtClock, fmtP, SUPPORTED_SYMBOLS } from "../engine/types";

const N = 110;
const W = 1000;
const H = 480;
const AXIS = 68;
const PLOT = W - AXIS;
const PAD_T = 16;
const PAD_B = 52;

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

export default function CandleChart({ st, cfg, onDecide, onMoveToBreakeven, onPartialClose }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const tvContainerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ i: number; y: number } | null>(null);

  const activeMeta = SUPPORTED_SYMBOLS.find((s) => s.symbol === cfg.activeSymbol) || SUPPORTED_SYMBOLS[0];

  // Embed TradingView widget if chartView === "tradingview"
  useEffect(() => {
    if (cfg.chartView !== "tradingview" || !tvContainerRef.current) return;

    tvContainerRef.current.innerHTML = "";
    const containerId = "tv_chart_container_" + Math.random().toString(36).substring(7);
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

  const onMove = (e: React.MouseEvent) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return;
    const mx = ((e.clientX - r.left) / r.width) * W;
    const my = ((e.clientY - r.top) / r.height) * H;
    const i = Math.floor((mx / PLOT) * N);
    if (i >= 0 && i < bars.length && mx <= PLOT) setHover({ i, y: my });
    else setHover(null);
  };

  const hoverBar = hover ? bars[hover.i] : null;
  const hoverCls = hover ? st.classes[offset + hover.i] : null;

  return (
    <div
      className="rounded-lg border overflow-hidden shadow-xl font-mono text-[11.5px]"
      style={{ borderColor: "var(--line)", background: "var(--bg1)" }}
    >
      {/* Chart Top Header */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2"
        style={{ borderColor: "var(--line)", background: "var(--bg2)" }}
      >
        <div className="flex items-center gap-3">
          <span className="font-bold text-[12px] text-white">
            {activeMeta.label} · <span className="text-[var(--gold)]">{cfg.timeframe.toUpperCase()}</span>
          </span>
          <span className="text-[10px] text-[var(--dim)]">
            ATR(14): <span className="text-white font-semibold">${st.atr.toFixed(2)}</span>
          </span>
        </div>

        {/* AOI Legend Pills */}
        <div className="flex items-center gap-3 text-[10px] text-[var(--muted)]">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-[#f0546c]/40 border border-[#f0546c]" />
            <span>RESISTANCE AOI</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-[#2fc98f]/40 border border-[#2fc98f]" />
            <span>SUPPORT AOI</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="h-0.5 w-3 bg-[var(--gold)]" />
            <span>MARK PRICE</span>
          </span>
          <span className="text-[var(--dim)] font-bold">({aois.length} LIVE AOIS)</span>
        </div>
      </div>

      {/* Main Chart Body */}
      <div className="relative min-h-[460px] bg-[#0c121e]">
        {cfg.chartView === "tradingview" ? (
          <div ref={tvContainerRef} className="h-[480px] w-full" />
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
                  stroke="var(--line-soft)"
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

            {/* AOI Zones */}
            {aois.map((a, i) => {
              const yTop = y(Math.max(a.y1, a.y2));
              const yBot = y(Math.min(a.y1, a.y2));
              const hZone = Math.max(2, yBot - yTop);
              const isRes = a.role === "R";
              const col = isRes ? "var(--short)" : "var(--long)";
              return (
                <g key={i}>
                  <rect
                    x={0}
                    y={yTop}
                    width={PLOT}
                    height={hZone}
                    fill={isRes ? "rgba(240,84,108,0.08)" : "rgba(47,201,143,0.08)"}
                    stroke={col}
                    strokeWidth="0.8"
                    strokeDasharray="3 3"
                  />
                  <text
                    x={8}
                    y={yTop + 10}
                    fill={col}
                    fontSize="8.5"
                    fontWeight="700"
                    fontFamily="var(--font-mono)"
                  >
                    {a.label}
                  </text>
                </g>
              );
            })}

            {/* Candlesticks */}
            {bars.map((b, i) => {
              const xi = xOf(i);
              const yo = y(b.o);
              const yc = y(b.c);
              const yh = y(b.h);
              const yl = y(b.l);
              const isUp = b.c >= b.o;
              const col = isUp ? "var(--long)" : "var(--short)";
              const bodyTop = Math.min(yo, yc);
              const bodyH = Math.max(1.5, Math.abs(yc - yo));

              return (
                <g key={i}>
                  {/* Wicks */}
                  <line x1={xi} x2={xi} y1={yh} y2={yl} stroke={col} strokeWidth="1.2" />
                  {/* Real Body */}
                  <rect
                    x={xi - bw / 2}
                    y={bodyTop}
                    width={bw}
                    height={bodyH}
                    fill={isUp ? "#2fc98f" : "#f0546c"}
                    rx={0.5}
                  />
                </g>
              );
            })}

            {/* Entry / Exit Markers */}
            {visTrades.map((t) => {
              const xi = xOf(t.entryIndex - offset);
              const col = t.side === "LONG" ? "var(--long)" : "var(--short)";
              const ye = y(t.entry);
              return (
                <g key={"t" + t.id}>
                  {t.side === "LONG" ? (
                    <path d={`M${xi - 5},${ye + 14} L${xi + 5},${ye + 14} L${xi},${ye + 5} Z`} fill={col} />
                  ) : (
                    <path d={`M${xi - 5},${ye - 14} L${xi + 5},${ye - 14} L${xi},${ye - 5} Z`} fill={col} />
                  )}
                  {t.exit != null && t.exitIndex != null && t.exitIndex >= offset && (
                    <circle
                      cx={xOf(t.exitIndex - offset)}
                      cy={y(t.exit)}
                      r="3"
                      fill="var(--bg1)"
                      stroke={(t.pnl ?? 0) >= 0 ? "var(--long)" : "var(--short)"}
                      strokeWidth="1.6"
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
              strokeWidth="1"
              strokeDasharray="2 3"
              opacity="0.85"
            />
            <rect x={PLOT + 2} y={lastY - 8} width={AXIS - 4} height={16} rx={2} fill="var(--gold)" />
            <text
              x={PLOT + AXIS / 2}
              y={lastY + 3.5}
              textAnchor="middle"
              fill="#000"
              fontSize="10"
              fontWeight="800"
              fontFamily="var(--font-mono)"
            >
              {fmtP(last.c, activeMeta.digits)}
            </text>

            {/* Crosshair */}
            {hover && hoverBar && (
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
              className="absolute top-4 right-20 z-20 flex flex-col gap-2 rounded-xl p-3.5 shadow-2xl glass-panel animate-slide-in select-none min-w-[280px]"
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
                      color: isLong ? "var(--long)" : "var(--short)",
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
                  <span className="font-bold text-[var(--short)]">{fmtP(topPending.sl, activeMeta.digits)}</span>
                </div>
                <div>
                  <span className="text-[8px] text-[var(--dim)] block tracking-widest">TARGET</span>
                  <span className="font-bold text-[var(--long)]">{fmtP(topPending.tp, activeMeta.digits)}</span>
                </div>
              </div>

              {/* Progress countdown */}
              <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${(barsLeft / 4) * 100}%`,
                    background: barsLeft <= 1 ? "var(--short)" : "var(--gold)",
                  }}
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => onDecide(topPending.id, true)}
                  className="flex-1 rounded-lg py-2 font-mono text-[11px] font-extrabold tracking-wider tactile-btn flex items-center justify-center gap-1.5"
                  style={{
                    background: "rgba(47,201,143,0.22)",
                    color: "var(--long)",
                    border: "1px solid rgba(47,201,143,0.7)",
                    boxShadow: "0 0 14px rgba(47,201,143,0.25)",
                  }}
                >
                  <span>✓</span>
                  <span>{cfg.feedMode === "live" ? "DISPATCH" : "APPROVE"}</span>
                </button>
                <button
                  onClick={() => onDecide(topPending.id, false)}
                  className="rounded-lg px-3 py-2 font-mono text-[11px] font-bold tracking-wider tactile-btn"
                  style={{
                    background: "rgba(240,84,108,0.18)",
                    color: "var(--short)",
                    border: "1px solid rgba(240,84,108,0.6)",
                  }}
                >
                  ✕ SKIP
                </button>
              </div>
            </div>
          );
        })()}

        {/* Live In-Chart Floating Position Control Pill */}
        {cfg.chartView === "native" && st.open && (() => {
          const t = st.open;
          const half = cfg.spread / 2;
          const lastBar = st.bars[st.bars.length - 1];
          const curPrice = lastBar ? lastBar.c : t.entry;
          const upnl = t.side === "LONG"
            ? t.oz * (curPrice - half - t.entry)
            : t.oz * (t.entry - (curPrice + half));
          const currentR = upnl / Math.max(1, t.risk);
          const isWinning = upnl >= 0;

          return (
            <div
              className="absolute top-4 left-4 z-20 flex items-center gap-3 rounded-xl px-3 py-2 shadow-2xl glass-panel animate-slide-in select-none border border-white/15"
              style={{
                boxShadow: isWinning ? "0 0 20px rgba(47,201,143,0.2)" : "0 0 20px rgba(240,84,108,0.2)",
              }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="rounded px-1.5 py-0.5 font-mono text-[9px] font-black tracking-wider"
                  style={{
                    background: t.side === "LONG" ? "rgba(47,201,143,0.2)" : "rgba(240,84,108,0.2)",
                    color: t.side === "LONG" ? "var(--long)" : "var(--short)",
                    border: `1px solid ${t.side === "LONG" ? "rgba(47,201,143,0.5)" : "rgba(240,84,108,0.5)"}`,
                  }}
                >
                  {t.side}
                </span>
                <div>
                  <span className="text-[8.5px] text-[var(--dim)] font-mono block">FLOATING P&L</span>
                  <span className={`font-mono text-[13px] font-extrabold ${isWinning ? "text-[var(--long)]" : "text-[var(--short)]"}`}>
                    {isWinning ? "+" : ""}${upnl.toFixed(0)} ({isWinning ? "+" : ""}{currentR.toFixed(2)}R)
                  </span>
                </div>
              </div>

              <div className="h-6 w-px bg-white/10" />

              {/* Quick Actions */}
              <div className="flex items-center gap-1.5">
                {onMoveToBreakeven && !t.isBreakeven && (
                  <button
                    onClick={onMoveToBreakeven}
                    className="rounded-lg px-2.5 py-1 text-[10px] font-mono font-bold text-[var(--gold-hi)] bg-[var(--gold)]/15 border border-[var(--gold)]/40 hover:bg-[var(--gold)]/25 tactile-btn"
                    title="Move stop loss to entry price + spread buffer"
                  >
                    ⚡ BE
                  </button>
                )}
                {t.isBreakeven && (
                  <span className="rounded px-1.5 py-0.5 text-[8.5px] font-mono font-bold text-[var(--long)] bg-[var(--long)]/10 border border-[var(--long)]/30">
                    BE LOCKED
                  </span>
                )}
                {onPartialClose && !t.partialClosed && (
                  <button
                    onClick={() => onPartialClose(0.5)}
                    className="rounded-lg px-2.5 py-1 text-[10px] font-mono font-bold text-white bg-white/10 border border-white/20 hover:bg-white/20 tactile-btn"
                    title="Realize 50% profit immediately"
                  >
                    💰 50%
                  </button>
                )}
              </div>
            </div>
          );
        })()}

        {/* Hover Tooltip */}
        {cfg.chartView === "native" && hover && hoverBar && (
          <div
            className="pointer-events-none absolute top-3 z-10 rounded-md border px-3 py-1.5 font-mono text-[10.5px] shadow-xl"
            style={{
              left: `${Math.min(75, Math.max(3, (xOf(hover.i) / W) * 100))}%`,
              borderColor: "var(--line)",
              background: "rgba(10,16,28,0.96)",
            }}
          >
            <div className="flex items-center gap-2 text-[var(--muted)] mb-0.5">
              <span>{fmtClock(hoverBar.t)} UTC</span>
              {hoverCls && (
                <span className="text-[8.5px] px-1 py-px rounded bg-[#1e293b] font-bold text-[var(--gold)]">
                  {hoverCls}
                </span>
              )}
            </div>
            <div className="grid grid-cols-4 gap-x-3 text-[10px]">
              <span>O: {fmtP(hoverBar.o, activeMeta.digits)}</span>
              <span className="text-[var(--long)]">H: {fmtP(hoverBar.h, activeMeta.digits)}</span>
              <span className="text-[var(--short)]">L: {fmtP(hoverBar.l, activeMeta.digits)}</span>
              <span>C: {fmtP(hoverBar.c, activeMeta.digits)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
