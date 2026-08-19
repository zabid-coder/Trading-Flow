import { useState } from "react";
import type { EngineConfig, EngineState } from "../engine/types";
import { fmtP, fmtUSD, SUPPORTED_SYMBOLS } from "../engine/types";

interface Props {
  st: EngineState;
  cfg: EngineConfig;
  onExecuteManual: (trade: {
    side: "LONG" | "SHORT";
    entry: number;
    sl: number;
    tp: number;
    oz: number;
    risk: number;
  }) => void;
}

export default function OrderDesk({ st, cfg, onExecuteManual }: Props) {
  const lastBar = st.bars[st.bars.length - 1];
  const lastPrice = lastBar ? lastBar.c : st.price;
  const activeMeta = SUPPORTED_SYMBOLS.find((s) => s.symbol === cfg.activeSymbol) || SUPPORTED_SYMBOLS[0];

  const [side, setSide] = useState<"LONG" | "SHORT">("LONG");
  const [riskUSD, setRiskUSD] = useState(cfg.riskUSD);
  const [slDistance, setSlDistance] = useState(activeMeta.symbol === "XAUUSD" ? 4.5 : activeMeta.symbol === "BTCUSDT" ? 400 : 0.0035);
  const [rrRatio, setRrRatio] = useState(2.0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
    onExecuteManual({
      side,
      entry,
      sl,
      tp,
      oz: Number(oz.toFixed(2)),
      risk: riskUSD,
    });
  };

  return (
    <div
      className="rounded-lg border overflow-hidden shadow-lg font-mono text-[11px] flex flex-col"
      style={{ borderColor: "var(--line)", background: "var(--bg1)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between border-b px-3 py-2"
        style={{ borderColor: "var(--line)", background: "var(--bg2)" }}
      >
        <span className="font-bold text-white text-[11.5px]">PRO ORDER EXECUTION DESK</span>
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--gold)]/10 text-[var(--gold)] font-bold">
          1-CLICK DISPATCH
        </span>
      </div>

      <div className="p-3 space-y-3">
        {/* Long / Short Switcher Buttons */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setSide("LONG")}
            className={`py-2 rounded-md font-bold text-[12px] transition-all flex items-center justify-center gap-1.5 ${
              side === "LONG"
                ? "bg-[#2fc98f] text-black shadow-md font-black"
                : "border border-[#2fc98f]/40 text-[#2fc98f] hover:bg-[#2fc98f]/10"
            }`}
          >
            <span>▲ BUY / LONG</span>
          </button>

          <button
            onClick={() => setSide("SHORT")}
            className={`py-2 rounded-md font-bold text-[12px] transition-all flex items-center justify-center gap-1.5 ${
              side === "SHORT"
                ? "bg-[#f0546c] text-black shadow-md font-black"
                : "border border-[#f0546c]/40 text-[#f0546c] hover:bg-[#f0546c]/10"
            }`}
          >
            <span>▼ SELL / SHORT</span>
          </button>
        </div>

        {/* Risk & Sizing Controls */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="block text-[9px] text-[var(--dim)] mb-1">RISK AMOUNT ($)</span>
            <input
              type="number"
              value={riskUSD}
              onChange={(e) => setRiskUSD(Math.max(10, Number(e.target.value)))}
              className="w-full rounded border px-2 py-1 font-bold text-[11.5px] outline-none"
              style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--gold)" }}
            />
          </div>

          <div>
            <span className="block text-[9px] text-[var(--dim)] mb-1">POSITION SIZE</span>
            <div className="rounded border px-2 py-1 text-[11.5px] font-bold text-white bg-[var(--bg)]" style={{ borderColor: "var(--line)" }}>
              {oz.toFixed(2)} units
            </div>
          </div>
        </div>

        {/* SL & TP Geometry */}
        <div className="grid grid-cols-3 gap-2 text-[10px]">
          <div className="rounded border p-1.5" style={{ borderColor: "var(--line)", background: "var(--bg2)" }}>
            <span className="block text-[8px] text-[var(--dim)]">MARK ENTRY</span>
            <span className="font-bold text-white">{fmtP(entry, activeMeta.digits)}</span>
          </div>

          <div className="rounded border p-1.5" style={{ borderColor: "rgba(240,84,108,0.3)", background: "rgba(240,84,108,0.06)" }}>
            <span className="block text-[8px] text-[#f0546c]">STOP LOSS</span>
            <span className="font-bold text-[#f0546c]">{fmtP(sl, activeMeta.digits)}</span>
          </div>

          <div className="rounded border p-1.5" style={{ borderColor: "rgba(47,201,143,0.3)", background: "rgba(47,201,143,0.06)" }}>
            <span className="block text-[8px] text-[#2fc98f]">TAKE PROFIT</span>
            <span className="font-bold text-[#2fc98f]">{fmtP(tp, activeMeta.digits)}</span>
          </div>
        </div>

        {/* SL Distance Slider */}
        <div>
          <div className="flex items-center justify-between text-[9px] text-[var(--dim)] mb-1">
            <span>SL DISTANCE</span>
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

        {/* Error Alert */}
        {errorMsg && (
          <div className="p-2 rounded bg-red-950/60 border border-red-500/50 text-red-300 text-[10px] font-semibold text-center animate-pulse">
            ⚠️ {errorMsg}
          </div>
        )}

        {/* Execute Button */}
        <button
          onClick={handlePlaceOrder}
          className="w-full py-2 rounded-md font-bold text-[12px] tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg"
          style={{
            background: side === "LONG" ? "#2fc98f" : "#f0546c",
            color: "#000",
          }}
        >
          <span>⚡ EXECUTE {side} ({fmtUSD(riskUSD)} RISK)</span>
        </button>
      </div>
    </div>
  );
}
