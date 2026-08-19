import { useState } from "react";
import type { EngineConfig, EngineState } from "../engine/types";
import { fmtP, fmtUSD } from "../engine/types";
import EquityCurve from "./EquityCurve";
import TradeLog from "./TradeLog";
import EventFeed from "./EventFeed";
import type { Stats } from "../engine/engine";
import { exportJournalToCsv } from "../engine/storage";

interface Props {
  st: EngineState;
  cfg: EngineConfig;
  stats: Stats;
  onClosePosition?: () => void;
  onMoveToBreakeven?: () => void;
  onPartialClose?: (ratio?: number) => void;
}

export default function BottomTerminalTabs({
  st,
  cfg,
  stats,
  onClosePosition,
  onMoveToBreakeven,
  onPartialClose,
}: Props) {
  const [activeTab, setActiveTab] = useState<"positions" | "history" | "equity" | "logs">("positions");

  const openTrade = st.open;
  const lastBar = st.bars[st.bars.length - 1];
  const lastPrice = lastBar ? lastBar.c : st.price;
  const halfSpread = cfg.spread / 2;

  const currentPnl = openTrade
    ? openTrade.oz *
      (openTrade.side === "LONG"
        ? lastPrice - halfSpread - openTrade.entry
        : openTrade.entry - (lastPrice + halfSpread))
    : 0;

  const pnlPercent = openTrade ? (currentPnl / openTrade.risk) * 100 : 0;

  const handleExportCsv = () => {
    exportJournalToCsv(st.trades, cfg.activeSymbol);
  };

  return (
    <div
      className="rounded-lg border overflow-hidden shadow-xl font-mono text-[11.5px]"
      style={{ borderColor: "var(--line)", background: "var(--bg1)" }}
    >
      {/* Tab Navigation Header */}
      <div
        className="flex items-center justify-between border-b px-3 py-1.5"
        style={{ borderColor: "var(--line)", background: "var(--bg2)" }}
      >
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab("positions")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-[11px] font-bold transition-all ${
              activeTab === "positions"
                ? "bg-[var(--gold)] text-black"
                : "text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--bg3)]"
            }`}
          >
            <span>POSITIONS</span>
            {openTrade && (
              <span
                className="px-1 py-px rounded-full text-[9px] font-extrabold"
                style={{
                  background: currentPnl >= 0 ? "rgba(47,201,143,0.3)" : "rgba(240,84,108,0.3)",
                  color: currentPnl >= 0 ? "var(--long)" : "var(--short)",
                }}
              >
                1 LIVE
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("history")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-[11px] font-bold transition-all ${
              activeTab === "history"
                ? "bg-[var(--gold)] text-black"
                : "text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--bg3)]"
            }`}
          >
            <span>TRADE JOURNAL</span>
            <span className="text-[9px] text-[var(--dim)]">({stats.closed.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("equity")}
            className={`px-3 py-1 rounded text-[11px] font-bold transition-all ${
              activeTab === "equity"
                ? "bg-[var(--gold)] text-black"
                : "text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--bg3)]"
            }`}
          >
            EQUITY CURVE
          </button>

          <button
            onClick={() => setActiveTab("logs")}
            className={`px-3 py-1 rounded text-[11px] font-bold transition-all ${
              activeTab === "logs"
                ? "bg-[var(--gold)] text-black"
                : "text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--bg3)]"
            }`}
          >
            ENGINE WIRE & LOGS
          </button>
        </div>

        {/* Quick summary stats & CSV Export */}
        <div className="hidden sm:flex items-center gap-4 text-[10.5px]">
          {activeTab === "history" && stats.closed.length > 0 && (
            <button
              onClick={handleExportCsv}
              className="px-2 py-0.5 rounded bg-[var(--bg3)] border border-[var(--line)] text-[10px] font-bold text-[var(--gold)] hover:bg-[var(--gold)] hover:text-black transition-all flex items-center gap-1"
            >
              <span>📥 Export CSV</span>
            </button>
          )}
          <div className="flex items-center gap-1">
            <span className="text-[var(--dim)]">NET P&L:</span>
            <span className="font-bold" style={{ color: stats.net >= 0 ? "var(--long)" : "var(--short)" }}>
              {fmtUSD(stats.net)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[var(--dim)]">WIN RATE:</span>
            <span className="font-bold text-[var(--ink)]">{stats.winRate.toFixed(1)}%</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[var(--dim)]">PROFIT FACTOR:</span>
            <span className="font-bold text-[var(--gold)]">{stats.pf.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Tab Contents */}
      <div className="p-3">
        {activeTab === "positions" && (
          <div>
            {!openTrade ? (
              <div className="flex flex-col items-center justify-center py-8 text-center text-[var(--dim)] space-y-1">
                <span className="h-2 w-2 rounded-full bg-[var(--gold)] opacity-50 animate-ping" />
                <span className="font-bold text-[12px] text-[var(--muted)]">NO OPEN POSITIONS</span>
                <span className="text-[10px]">
                  Engine is monitoring for AOI sweeps and rejection candles. Confirmed signals will display here.
                </span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="border-b text-[9px] text-[var(--dim)] tracking-wider" style={{ borderColor: "var(--line)" }}>
                      <th className="pb-2">SIDE</th>
                      <th className="pb-2">SYMBOL</th>
                      <th className="pb-2">SETUP</th>
                      <th className="pb-2">SIZE / RISK</th>
                      <th className="pb-2">ENTRY</th>
                      <th className="pb-2">MARK PRICE</th>
                      <th className="pb-2">STOP LOSS</th>
                      <th className="pb-2">TAKE PROFIT</th>
                      <th className="pb-2">UNREALIZED P&L</th>
                      <th className="pb-2 text-right">MANAGE ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)]">
                    <tr className="hover:bg-[var(--bg2)] transition-colors">
                      <td className="py-2.5 font-bold">
                        <span
                          className="px-2 py-0.5 rounded text-[9.5px]"
                          style={{
                            background: openTrade.side === "LONG" ? "rgba(47,201,143,0.15)" : "rgba(240,84,108,0.15)",
                            color: openTrade.side === "LONG" ? "var(--long)" : "var(--short)",
                            border: `1px solid ${openTrade.side === "LONG" ? "var(--long)" : "var(--short)"}44`,
                          }}
                        >
                          {openTrade.side}
                        </span>
                      </td>
                      <td className="py-2.5 font-bold text-[var(--ink)]">{cfg.activeSymbol}</td>
                      <td className="py-2.5 text-[var(--muted)]">{openTrade.setup}</td>
                      <td className="py-2.5">
                        <span className="text-[var(--gold)]">{openTrade.oz.toFixed(2)} units</span>
                        <span className="text-[var(--dim)] text-[9.5px]"> (${openTrade.risk.toFixed(0)})</span>
                      </td>
                      <td className="py-2.5 font-semibold">{fmtP(openTrade.entry)}</td>
                      <td className="py-2.5 font-semibold text-[var(--gold-hi)]">{fmtP(lastPrice)}</td>
                      <td className="py-2.5 font-semibold text-[var(--short)]">
                        {fmtP(openTrade.sl)}
                        {openTrade.isBreakeven && (
                          <span className="ml-1 text-[8px] px-1 py-px rounded bg-[var(--gold)]/20 text-[var(--gold)] font-bold">
                            BE
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 font-semibold text-[var(--long)]">{fmtP(openTrade.tp)}</td>
                      <td className="py-2.5 font-bold text-[12px]">
                        <span style={{ color: currentPnl >= 0 ? "var(--long)" : "var(--short)" }}>
                          {fmtUSD(currentPnl)} ({pnlPercent >= 0 ? "+" : ""}{pnlPercent.toFixed(1)}% R)
                        </span>
                      </td>
                      <td className="py-2.5 text-right space-x-1.5">
                        {onMoveToBreakeven && !openTrade.isBreakeven && (
                          <button
                            onClick={onMoveToBreakeven}
                            className="px-2 py-1 rounded bg-[var(--gold)]/15 text-[var(--gold)] hover:bg-[var(--gold)]/30 transition-colors text-[9.5px] font-bold"
                            title="Move Stop Loss to Entry (Risk-Free)"
                          >
                            ⚡ BE
                          </button>
                        )}
                        {onPartialClose && !openTrade.partialClosed && (
                          <button
                            onClick={() => onPartialClose(0.5)}
                            className="px-2 py-1 rounded bg-[var(--long)]/15 text-[var(--long)] hover:bg-[var(--long)]/30 transition-colors text-[9.5px] font-bold"
                            title="Close 50% of position and book profit"
                          >
                            💰 50% TP
                          </button>
                        )}
                        {onClosePosition && (
                          <button
                            onClick={onClosePosition}
                            className="px-2.5 py-1 rounded bg-[var(--short)]/15 text-[var(--short)] hover:bg-[var(--short)]/30 transition-colors text-[9.5px] font-bold"
                          >
                            ✕ Close
                          </button>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === "history" && (
          <div className="h-[280px]">
            <TradeLog st={st} stats={stats} />
          </div>
        )}

        {activeTab === "equity" && (
          <div className="h-[280px]">
            <EquityCurve st={st} stats={stats} cfg={cfg} />
          </div>
        )}

        {activeTab === "logs" && (
          <div className="h-[280px]">
            <EventFeed st={st} />
          </div>
        )}
      </div>
    </div>
  );
}
