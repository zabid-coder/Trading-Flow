import type { EngineConfig, EngineState, Timeframe } from "../engine/types";
import { fmtP, fmtUSD, SUPPORTED_SYMBOLS, TIMEFRAMES } from "../engine/types";
import { activeSessions } from "../engine/market";

export const SPEEDS = [
  { label: "1×", ms: 1150 },
  { label: "3×", ms: 430 },
  { label: "8×", ms: 150 },
  { label: "MAX", ms: 55 },
];

interface Props {
  st: EngineState;
  cfg: EngineConfig;
  running: boolean;
  onToggleRun: () => void;
  speed: number;
  onSpeed: (i: number) => void;
  onNewScenario: () => void;
  onToggleLiveMode: () => void;
  onSelectSymbol: (sym: string) => void;
  onSelectTimeframe: (tf: Timeframe) => void;
  onToggleChartView: () => void;
  onOpenBrokerSettings: () => void;
  onOpenGuide: () => void;
  tick: number;
}

export default function HeaderBar({
  st,
  cfg,
  running,
  onToggleRun,
  speed,
  onSpeed,
  onNewScenario,
  onToggleLiveMode,
  onSelectSymbol,
  onSelectTimeframe,
  onToggleChartView,
  onOpenBrokerSettings,
  onOpenGuide,
  tick,
}: Props) {
  const last = st.bars[st.bars.length - 1] || { t: Date.now(), o: 2750, h: 2750, l: 2750, c: 2750, v: 0, day: 0 };
  const prev = st.bars[st.bars.length - 2] ?? last;
  const dir = last.c >= prev.c ? "up" : "down";
  const chg = last.c - st.dayOpen;
  const chgPct = st.dayOpen ? (chg / st.dayOpen) * 100 : 0;
  const hour = Math.floor((((last.t % 86400000) + 86400000) % 86400000) / 3600000);
  const ses = activeSessions(hour);

  const activeMeta = SUPPORTED_SYMBOLS.find((s) => s.symbol === cfg.activeSymbol) || SUPPORTED_SYMBOLS[0];
  const isLive = cfg.feedMode === "live";

  const halfSpread = cfg.spread / 2;
  const sellPrice = last.c - halfSpread;
  const buyPrice = last.c + halfSpread;
  const spreadPoints = (cfg.spread * (activeMeta.digits === 5 ? 10000 : 100)).toFixed(1);

  return (
    <header
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-3 py-2 lg:px-4 font-mono select-none"
      style={{
        borderColor: "var(--line)",
        background: "linear-gradient(180deg, #121927 0%, #0c121e 100%)",
      }}
    >
      {/* 1. Left: Brand & Instrument + Timeframe Selector (TradingView / OANDA Style) */}
      <div className="flex items-center gap-3">
        {/* Brand logo */}
        <div className="flex items-center gap-2 pr-2 border-r border-[var(--line)]">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--gold)]/15 border border-[var(--gold)] text-[var(--gold)] font-extrabold text-sm">
            TF
          </span>
          <span className="font-bold text-sm tracking-wide text-white hidden md:inline">
            TRADING<span className="text-[var(--gold)]">FLOW</span>
          </span>
        </div>

        {/* Instrument Selector Pill */}
        <div className="flex items-center gap-2 bg-[#090d16] border border-[#232f48] rounded-md px-2 py-1">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--gold)] text-black text-[9px] font-black">
            ✦
          </span>
          <select
            value={cfg.activeSymbol}
            onChange={(e) => onSelectSymbol(e.target.value)}
            className="bg-transparent text-white font-bold text-[12px] outline-none cursor-pointer pr-1"
          >
            {SUPPORTED_SYMBOLS.map((s) => (
              <option key={s.symbol} value={s.symbol} className="bg-[#0e1522] text-white">
                {s.label} · {s.source}
              </option>
            ))}
          </select>
        </div>

        {/* Timeframe Selector Pills (1m, 5m, 15m, 30m, 1h, 4h) */}
        <div className="flex items-center bg-[#090d16] border border-[#232f48] rounded-md p-0.5">
          {TIMEFRAMES.map((tf) => {
            const isActive = cfg.timeframe === tf.label;
            return (
              <button
                key={tf.label}
                onClick={() => onSelectTimeframe(tf.label)}
                className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all ${
                  isActive
                    ? "bg-[#253553] text-white shadow-sm"
                    : "text-[var(--dim)] hover:text-white hover:bg-[#162135]"
                }`}
              >
                {tf.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Center: OANDA-style Sell / Buy Quote Spread Box */}
      <div className="flex items-center gap-2">
        <div className="flex items-center bg-[#080d16] border border-[#232f48] rounded-lg p-1 gap-2 shadow-inner">
          {/* Sell Box */}
          <div className="flex flex-col items-center justify-center px-3 py-1 rounded bg-[#f0546c]/10 border border-[#f0546c]/40 text-center min-w-[90px]">
            <span className="text-[13px] font-bold text-[#f0546c] leading-tight">
              {fmtP(sellPrice, activeMeta.digits)}
            </span>
            <span className="text-[8.5px] font-black text-[#f0546c] tracking-wider">SELL</span>
          </div>

          {/* Spread indicator */}
          <div className="flex flex-col items-center justify-center px-1 text-center">
            <span className="text-[10px] font-bold text-[var(--muted)]">{spreadPoints}</span>
            <span className="text-[7.5px] text-[var(--dim)] tracking-tighter">SPREAD</span>
          </div>

          {/* Buy Box */}
          <div className="flex flex-col items-center justify-center px-3 py-1 rounded bg-[#388bfd]/10 border border-[#388bfd]/40 text-center min-w-[90px]">
            <span className="text-[13px] font-bold text-[#388bfd] leading-tight">
              {fmtP(buyPrice, activeMeta.digits)}
            </span>
            <span className="text-[8.5px] font-black text-[#388bfd] tracking-wider">BUY</span>
          </div>
        </div>

        {/* Change % badge */}
        <div
          className="hidden sm:flex flex-col justify-center px-2 py-1 rounded border text-[10.5px] font-semibold"
          style={{
            borderColor: chg >= 0 ? "rgba(47,201,143,0.3)" : "rgba(240,84,108,0.3)",
            color: chg >= 0 ? "var(--long)" : "var(--short)",
            background: chg >= 0 ? "rgba(47,201,143,0.08)" : "rgba(240,84,108,0.08)",
          }}
        >
          <span>{chg >= 0 ? "+" : "−"}{Math.abs(chg).toFixed(activeMeta.digits)}</span>
          <span className="text-[9px] text-[var(--dim)]">{chgPct >= 0 ? "+" : "−"}{Math.abs(chgPct).toFixed(2)}%</span>
        </div>
      </div>

      {/* 3. Right: Feed Mode, Chart View, Simulator Controls & Settings */}
      <div className="flex items-center gap-2.5">
        {/* Feed Mode Switch (LIVE vs SIM) */}
        <div className="flex items-center rounded-md border p-0.5" style={{ borderColor: "var(--line)", background: "var(--bg2)" }}>
          <button
            onClick={onToggleLiveMode}
            className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all ${
              !isLive ? "bg-[var(--gold)] text-black font-extrabold shadow" : "text-[var(--dim)] hover:text-white"
            }`}
          >
            SIMULATOR
          </button>
          <button
            onClick={onToggleLiveMode}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold transition-all ${
              isLive ? "bg-[var(--long)] text-black font-extrabold shadow animate-pulse" : "text-[var(--dim)] hover:text-white"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-black" />
            <span>LIVE REAL</span>
          </button>
        </div>

        {/* Chart View Toggle (Native Strategy Chart vs Official TradingView Widget) */}
        <button
          onClick={onToggleChartView}
          className="hidden md:flex items-center gap-1 rounded-md border px-2.5 py-1 text-[10.5px] font-bold transition-all hover:border-[var(--gold)]"
          style={{
            borderColor: "var(--line)",
            background: cfg.chartView === "tradingview" ? "rgba(232,180,76,0.15)" : "var(--bg2)",
            color: cfg.chartView === "tradingview" ? "var(--gold-hi)" : "var(--muted)",
          }}
          title="Toggle between Strategy Scanner Chart and Official TradingView Widget"
        >
          <span>{cfg.chartView === "tradingview" ? "📊 TRADINGVIEW" : "📈 STRATEGY CHART"}</span>
        </button>

        {/* Simulator speed buttons when in simulated mode */}
        {!isLive && (
          <div className="hidden lg:flex items-center overflow-hidden rounded-md border" style={{ borderColor: "var(--line)" }}>
            <button
              onClick={onToggleRun}
              className="px-2 py-1 transition-colors hover:bg-[var(--bg3)] text-[var(--gold-hi)]"
              title={running ? "Pause feed" : "Resume feed"}
            >
              {running ? "⏸" : "▶"}
            </button>
            {SPEEDS.map((s, i) => (
              <button
                key={s.label}
                onClick={() => onSpeed(i)}
                className="border-l px-1.5 py-1 text-[9.5px] font-bold"
                style={{
                  borderColor: "var(--line)",
                  color: speed === i ? "var(--gold-hi)" : "var(--dim)",
                  background: speed === i ? "rgba(232,180,76,0.14)" : "transparent",
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        {/* Audio Mute Toggle */}
        <button
          onClick={() => {
            const next = !cfg.soundEnabled;
            onToggleRun(); // momentary touch
            onToggleRun();
          }}
          className="flex items-center gap-1 rounded-md border px-2 py-1 text-[10.5px] font-bold transition-all hover:border-[var(--gold)]"
          style={{
            borderColor: "var(--line)",
            background: cfg.soundEnabled ? "rgba(47,201,143,0.12)" : "var(--bg2)",
            color: cfg.soundEnabled ? "var(--long)" : "var(--dim)",
          }}
          title={cfg.soundEnabled ? "Sound Alert Enabled (Press M to mute)" : "Sound Alert Muted (Press M to enable)"}
        >
          <span>{cfg.soundEnabled ? "🔊" : "🔇"}</span>
        </button>

        {/* Guide / Playbook button */}
        <button
          onClick={onOpenGuide}
          className="flex items-center gap-1 rounded-md border px-2.5 py-1 text-[10.5px] font-bold transition-all hover:border-[var(--gold)]"
          style={{
            borderColor: "var(--line)",
            background: "var(--bg2)",
            color: "var(--gold-hi)",
          }}
          title="Open Strategy Guide & Explanations"
        >
          <span>📖 PLAYBOOK</span>
        </button>

        {/* Broker Execution Settings Launcher */}
        <button
          onClick={onOpenBrokerSettings}
          className="flex items-center gap-1 rounded-md border px-2.5 py-1 text-[10.5px] font-bold transition-all hover:border-[var(--gold)]"
          style={{
            borderColor: "var(--gold-deep)",
            background: "rgba(232,180,76,0.12)",
            color: "var(--gold)",
          }}
        >
          <span>⚙️ BROKER</span>
        </button>
      </div>
    </header>
  );
}
