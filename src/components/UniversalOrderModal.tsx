import { useEffect, useState } from "react";
import type { EngineConfig, EngineState, SymbolMeta } from "../engine/types";
import { fmtP, fmtUSD, SUPPORTED_SYMBOLS } from "../engine/types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  st: EngineState;
  cfg: EngineConfig;
  initialSide?: "LONG" | "SHORT";
  onExecute: (trade: {
    side: "LONG" | "SHORT";
    entry: number;
    sl: number;
    tp: number;
    oz: number;
    risk: number;
  }) => void;
  onClosePosition?: () => void;
  onMoveToBreakeven?: () => void;
}

export default function UniversalOrderModal({
  isOpen,
  onClose,
  st,
  cfg,
  initialSide = "LONG",
  onExecute,
  onClosePosition,
  onMoveToBreakeven,
}: Props) {
  const [side, setSide] = useState<"LONG" | "SHORT">(initialSide);
  const [riskUSD, setRiskUSD] = useState(cfg.riskUSD);
  const [rrRatio, setRrRatio] = useState(cfg.rr || 2.0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const activeMeta =
    SUPPORTED_SYMBOLS.find((s) => s.symbol === cfg.activeSymbol) || SUPPORTED_SYMBOLS[0];

  const defaultSlDist =
    activeMeta.symbol === "XAUUSD" ? 4.5 : activeMeta.symbol === "BTCUSDT" ? 400 : 0.0035;

  const [slDistance, setSlDistance] = useState(defaultSlDist);

  useEffect(() => {
    setSide(initialSide);
  }, [initialSide]);

  useEffect(() => {
    setSlDistance(
      activeMeta.symbol === "XAUUSD" ? 4.5 : activeMeta.symbol === "BTCUSDT" ? 400 : 0.0035
    );
  }, [cfg.activeSymbol]);

  if (!isOpen) return null;

  const lastBar = st.bars[st.bars.length - 1];
  const lastPrice = lastBar ? lastBar.c : st.price;
  const halfSpread = cfg.spread / 2;

  const entry = side === "LONG" ? lastPrice + halfSpread : lastPrice - halfSpread;
  const sl = side === "LONG" ? entry - slDistance : entry + slDistance;
  const tp = side === "LONG" ? entry + slDistance * rrRatio : entry - slDistance * rrRatio;

  // Calculate lot size based on strict risk math
  const pointVal = activeMeta.pointValue;
  const oz = Math.max(0.01, riskUSD / (slDistance * pointVal));

  const handlePlaceOrder = () => {
    if (slDistance <= cfg.spread) {
      setErrorMsg(`SL distance must exceed current spread (${cfg.spread} pts)`);
      setTimeout(() => setErrorMsg(null), 3000);
      return;
    }
    setErrorMsg(null);
    onExecute({
      side,
      entry,
      sl,
      tp,
      oz: Number(oz.toFixed(2)),
      risk: riskUSD,
    });
    onClose();
  };

  const openTrade = st.open;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-fade-in font-mono text-[11.5px] select-none">
      <div
        className="w-full max-w-lg rounded-2xl border p-5 shadow-2xl space-y-4 bg-[#0a0f18] text-white flex flex-col"
        style={{ borderColor: "var(--line)", boxShadow: "0 20px 60px rgba(0,0,0,0.8)" }}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: "var(--line)" }}>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--gold)] text-black font-black text-xs">
              ⚡
            </span>
            <div>
              <h2 className="text-sm font-extrabold tracking-wide text-white flex items-center gap-2">
                <span>UNIVERSAL ORDER EXECUTION DESK</span>
                <span
                  className="text-[8.5px] px-1.5 py-0.5 rounded font-black tracking-wider"
                  style={{
                    background: cfg.feedMode === "live" ? "rgba(47,201,143,0.2)" : "rgba(232,180,76,0.2)",
                    color: cfg.feedMode === "live" ? "var(--long)" : "var(--gold)",
                  }}
                >
                  {cfg.feedMode === "live" ? "● MT5 LIVE" : "◆ SIMULATOR"}
                </span>
              </h2>
              <span className="text-[10px] text-[var(--muted)]">
                {activeMeta.label} ({activeMeta.symbol}) · Spread: {cfg.spread} pts
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

        {/* Long / Short Switcher Buttons */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setSide("LONG")}
            className={`py-2.5 rounded-xl font-black text-[12px] transition-all flex items-center justify-center gap-2 ${
              side === "LONG"
                ? "bg-[#2fc98f] text-black shadow-lg shadow-[#2fc98f]/20 scale-[1.01]"
                : "border border-[#2fc98f]/30 text-[#2fc98f] hover:bg-[#2fc98f]/10 bg-[#090d16]"
            }`}
          >
            <span>▲ BUY / LONG</span>
            <span className="text-[10px] opacity-80">({fmtP(lastPrice + halfSpread, activeMeta.digits)})</span>
          </button>

          <button
            onClick={() => setSide("SHORT")}
            className={`py-2.5 rounded-xl font-black text-[12px] transition-all flex items-center justify-center gap-2 ${
              side === "SHORT"
                ? "bg-[#f0546c] text-black shadow-lg shadow-[#f0546c]/20 scale-[1.01]"
                : "border border-[#f0546c]/30 text-[#f0546c] hover:bg-[#f0546c]/10 bg-[#090d16]"
            }`}
          >
            <span>▼ SELL / SHORT</span>
            <span className="text-[10px] opacity-80">({fmtP(lastPrice - halfSpread, activeMeta.digits)})</span>
          </button>
        </div>

        {/* Risk & Position Sizing Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border p-3 bg-[#090d16]" style={{ borderColor: "var(--line)" }}>
            <div className="flex items-center justify-between text-[9px] text-[var(--dim)] mb-1 font-bold">
              <span>RISK AMOUNT ($)</span>
              <span className="text-[var(--gold)]">{((riskUSD / st.balance) * 100).toFixed(1)}% Eq</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--gold)] font-black text-[13px]">$</span>
              <input
                type="number"
                value={riskUSD}
                onChange={(e) => setRiskUSD(Math.max(10, Number(e.target.value)))}
                className="w-full bg-transparent font-black text-[14px] text-white outline-none"
              />
            </div>
          </div>

          <div className="rounded-xl border p-3 bg-[#090d16]" style={{ borderColor: "var(--line)" }}>
            <span className="block text-[9px] text-[var(--dim)] mb-1 font-bold">
              CALCULATED LOT / UNIT SIZE
            </span>
            <div className="font-black text-[14px] text-[var(--gold-hi)]">
              {oz.toFixed(2)} <span className="text-[10px] text-[var(--dim)]">units/lots</span>
            </div>
          </div>
        </div>

        {/* SL & TP Geometry Cards */}
        <div className="grid grid-cols-3 gap-2 text-[10.5px]">
          <div className="rounded-xl border p-2.5 bg-[#090d16]" style={{ borderColor: "var(--line)" }}>
            <span className="block text-[8px] text-[var(--dim)] font-bold">ENTRY PRICE</span>
            <span className="font-bold text-white text-[12px]">{fmtP(entry, activeMeta.digits)}</span>
          </div>

          <div
            className="rounded-xl border p-2.5"
            style={{ borderColor: "rgba(240,84,108,0.4)", background: "rgba(240,84,108,0.08)" }}
          >
            <span className="block text-[8px] text-[#f0546c] font-bold">STOP LOSS (-{fmtUSD(riskUSD)})</span>
            <span className="font-bold text-[#f0546c] text-[12px]">{fmtP(sl, activeMeta.digits)}</span>
          </div>

          <div
            className="rounded-xl border p-2.5"
            style={{ borderColor: "rgba(47,201,143,0.4)", background: "rgba(47,201,143,0.08)" }}
          >
            <span className="block text-[8px] text-[#2fc98f] font-bold">TAKE PROFIT (+{fmtUSD(riskUSD * rrRatio)})</span>
            <span className="font-bold text-[#2fc98f] text-[12px]">{fmtP(tp, activeMeta.digits)}</span>
          </div>
        </div>

        {/* SL Distance Slider */}
        <div className="space-y-1 rounded-xl border p-3 bg-[#090d16]" style={{ borderColor: "var(--line)" }}>
          <div className="flex items-center justify-between text-[10px] text-[var(--dim)]">
            <span>STOP LOSS DISTANCE</span>
            <span className="text-white font-bold">{slDistance.toFixed(activeMeta.digits === 5 ? 4 : 2)} pts</span>
          </div>
          <input
            type="range"
            min={activeMeta.symbol === "XAUUSD" ? "1.0" : activeMeta.symbol === "BTCUSDT" ? "50" : "0.0010"}
            max={activeMeta.symbol === "XAUUSD" ? "15.0" : activeMeta.symbol === "BTCUSDT" ? "1500" : "0.0100"}
            step={activeMeta.symbol === "XAUUSD" ? "0.2" : activeMeta.symbol === "BTCUSDT" ? "10" : "0.0002"}
            value={slDistance}
            onChange={(e) => setSlDistance(Number(e.target.value))}
            className="w-full accent-[var(--gold)]"
          />
        </div>

        {/* Target R:R Multiplier Selector */}
        <div className="flex items-center justify-between gap-2 text-[10px]">
          <span className="text-[var(--dim)] font-bold">RISK-TO-REWARD TARGET:</span>
          <div className="flex items-center gap-1">
            {[1.5, 2.0, 2.5, 3.0].map((r) => (
              <button
                key={r}
                onClick={() => setRrRatio(r)}
                className={`px-2.5 py-1 rounded-md font-black text-[10px] transition-all ${
                  rrRatio === r
                    ? "bg-[var(--gold)] text-black shadow"
                    : "border border-[var(--line)] text-[var(--muted)] hover:text-white bg-[#090d16]"
                }`}
              >
                1:{r.toFixed(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="p-2 rounded-lg bg-red-950/60 border border-red-500/50 text-red-300 text-[10px] font-semibold text-center animate-pulse">
            ⚠️ {errorMsg}
          </div>
        )}

        {/* Main Execute Button */}
        <button
          onClick={handlePlaceOrder}
          className="w-full py-3 rounded-xl font-black text-[13px] tracking-wider transition-all flex items-center justify-center gap-2 shadow-xl hover:brightness-110 active:scale-[0.99]"
          style={{
            background: side === "LONG" ? "#2fc98f" : "#f0546c",
            color: "#000",
          }}
        >
          <span>⚡ EXECUTE {side} ({fmtUSD(riskUSD)} RISK · {oz.toFixed(2)} LOTS)</span>
        </button>

        {/* Active Open Position Quick Bar (If trade currently running) */}
        {openTrade && (
          <div
            className="rounded-xl border p-3 flex items-center justify-between text-[10.5px]"
            style={{ borderColor: "var(--line)", background: "var(--bg2)" }}
          >
            <div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[var(--long)] animate-ping" />
                <span className="font-bold text-white">1 ACTIVE POSITION: {openTrade.side}</span>
                <span className="text-[9px] text-[var(--gold)]">({openTrade.oz.toFixed(2)} units)</span>
              </div>
              <div className="text-[9px] text-[var(--dim)]">
                Entry: {fmtP(openTrade.entry)} · SL: {fmtP(openTrade.sl)} · TP: {fmtP(openTrade.tp)}
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {onMoveToBreakeven && !openTrade.isBreakeven && (
                <button
                  onClick={onMoveToBreakeven}
                  className="px-2 py-1 rounded bg-[var(--gold)]/15 border border-[var(--gold)]/40 text-[var(--gold)] text-[9.5px] font-bold hover:bg-[var(--gold)]/25 transition-all"
                >
                  ⚡ BreakEven
                </button>
              )}
              {onClosePosition && (
                <button
                  onClick={() => {
                    onClosePosition();
                    onClose();
                  }}
                  className="px-2.5 py-1 rounded bg-[#f0546c]/20 border border-[#f0546c]/50 text-[#f0546c] text-[9.5px] font-bold hover:bg-[#f0546c]/30 transition-all"
                >
                  Close Market
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
