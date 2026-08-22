import type { EngineConfig, EngineState } from "../engine/types";
import { fmtUSD } from "../engine/types";
import EquityCurve from "./EquityCurve";
import type { Stats } from "../engine/engine";

interface Props {
  st: EngineState;
  cfg: EngineConfig;
  stats: Stats;
  onCfg: (p: Partial<EngineConfig>) => void;
}

export default function RiskAnalyticsView({ st, cfg, stats, onCfg }: Props) {
  const maxDDPercent = stats.maxDDPct || 0;

  return (
    <div className="space-y-4 font-mono text-[11.5px] p-2 md:p-4 max-w-[1720px] mx-auto animate-fade-in">
      {/* Top Banner */}
      <div
        className="rounded-xl border p-4 shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-3"
        style={{ borderColor: "var(--line)", background: "linear-gradient(180deg, #131c2d 0%, #0e1522 100%)" }}
      >
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--gold)] text-black font-extrabold text-xs">
              🛡️
            </span>
            <h1 className="text-base font-bold text-white tracking-wide">
              RISK ARCHITECTURE & PORTFOLIO DISCIPLINE DESK
            </h1>
          </div>
          <p className="text-[11px] text-[var(--muted)] mt-1">
            Institutional capital protection rules, dynamic position sizing engines, and drawdown circuit breakers.
          </p>
        </div>

        <div className="flex items-center gap-3 bg-[#090d16] border border-[var(--line)] rounded-lg px-3 py-1.5">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[var(--long)]" />
            <span className="text-[10px] text-[var(--dim)]">ACCOUNT BALANCE:</span>
            <span className="font-bold text-white text-[12px]">{fmtUSD(st.balance)}</span>
          </div>
          <span>·</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-[var(--dim)]">EQUITY:</span>
            <span className="font-bold text-[var(--gold)] text-[12px]">{fmtUSD(stats.equityNow)}</span>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border p-3.5 bg-[var(--bg1)] shadow" style={{ borderColor: "var(--line)" }}>
          <span className="text-[9px] text-[var(--dim)] uppercase font-bold tracking-wider block mb-1">
            NET PROFIT / LOSS
          </span>
          <div
            className="text-lg font-black"
            style={{ color: stats.net >= 0 ? "var(--long)" : "var(--short)" }}
          >
            {fmtUSD(stats.net)}
          </div>
          <span className="text-[9.5px] text-[var(--muted)] mt-0.5 block">
            {stats.closed.length} total closed trades
          </span>
        </div>

        <div className="rounded-xl border p-3.5 bg-[var(--bg1)] shadow" style={{ borderColor: "var(--line)" }}>
          <span className="text-[9px] text-[var(--dim)] uppercase font-bold tracking-wider block mb-1">
            OVERALL WIN RATE
          </span>
          <div className="text-lg font-black text-white">{stats.winRate.toFixed(1)}%</div>
          <span className="text-[9.5px] text-[var(--long)] mt-0.5 block">
            {stats.wins} wins / {stats.losses} losses
          </span>
        </div>

        <div className="rounded-xl border p-3.5 bg-[var(--bg1)] shadow" style={{ borderColor: "var(--line)" }}>
          <span className="text-[9px] text-[var(--dim)] uppercase font-bold tracking-wider block mb-1">
            PROFIT FACTOR
          </span>
          <div className="text-lg font-black text-[var(--gold)]">{stats.pf.toFixed(2)}</div>
          <span className="text-[9.5px] text-[var(--muted)] mt-0.5 block">
            Gross Win / Gross Loss
          </span>
        </div>

        <div className="rounded-xl border p-3.5 bg-[var(--bg1)] shadow" style={{ borderColor: "var(--line)" }}>
          <span className="text-[9px] text-[var(--dim)] uppercase font-bold tracking-wider block mb-1">
            MAX DRAWDOWN
          </span>
          <div className="text-lg font-black text-[#f0546c]">{fmtUSD(stats.maxDD)}</div>
          <span className="text-[9.5px] text-[var(--short)] mt-0.5 block">
            {maxDDPercent.toFixed(1)}% from peak
          </span>
        </div>
      </div>

      {/* Main Grid: Position Sizing & Discipline Controls (Left) + Equity Curve (Right) */}
      <div className="grid grid-cols-12 gap-4">
        {/* Left Column: Risk Controls */}
        <div className="col-span-12 lg:col-span-5 flex flex-col gap-3">
          {/* Position Sizing Engine */}
          <div
            className="rounded-xl border p-4 shadow space-y-3 bg-[var(--bg1)]"
            style={{ borderColor: "var(--line)" }}
          >
            <h3 className="font-bold text-white text-[12.5px] flex items-center gap-1.5 border-b pb-2" style={{ borderColor: "var(--line)" }}>
              <span>📐</span>
              <span>DYNAMIC POSITION SIZING ENGINE</span>
            </h3>

            <div>
              <span className="text-[9.5px] text-[var(--dim)] font-bold block mb-1">SIZING METHOD</span>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: "fixedUSD", label: "Fixed USD" },
                    { id: "percentEquity", label: "% of Equity" },
                    { id: "fractionalKelly", label: "Kelly Math" },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    onClick={() => onCfg({ sizingMode: m.id })}
                    className={`py-1.5 px-2 rounded-md font-bold text-[10.5px] transition-all ${
                      cfg.sizingMode === m.id
                        ? "bg-[var(--gold)] text-black font-black shadow"
                        : "border border-[var(--line)] text-[var(--muted)] hover:text-white bg-[#090d16]"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {cfg.sizingMode === "fixedUSD" && (
              <div>
                <div className="flex items-center justify-between text-[10px] text-[var(--dim)] mb-1">
                  <span>FIXED RISK PER TRADE</span>
                  <span className="text-white font-bold">{fmtUSD(cfg.riskUSD)}</span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="2000"
                  step="25"
                  value={cfg.riskUSD}
                  onChange={(e) => onCfg({ riskUSD: Number(e.target.value) })}
                  className="w-full accent-[var(--gold)]"
                />
              </div>
            )}

            {cfg.sizingMode === "percentEquity" && (
              <div>
                <div className="flex items-center justify-between text-[10px] text-[var(--dim)] mb-1">
                  <span>EQUITY RISK PERCENTAGE</span>
                  <span className="text-[var(--long)] font-bold">{cfg.equityRiskPct || 2.0}%</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="5.0"
                  step="0.25"
                  value={cfg.equityRiskPct || 2.0}
                  onChange={(e) => onCfg({ equityRiskPct: Number(e.target.value) })}
                  className="w-full accent-[var(--long)]"
                />
              </div>
            )}

            {cfg.sizingMode === "fractionalKelly" && (
              <div>
                <div className="flex items-center justify-between text-[10px] text-[var(--dim)] mb-1">
                  <span>FRACTIONAL KELLY LEVERAGE</span>
                  <span className="text-[var(--gold-hi)] font-bold">{((cfg.kellyFraction || 0.35) * 100).toFixed(0)}% Kelly</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="0.8"
                  step="0.05"
                  value={cfg.kellyFraction || 0.35}
                  onChange={(e) => onCfg({ kellyFraction: Number(e.target.value) })}
                  className="w-full accent-[var(--gold)]"
                />
              </div>
            )}
          </div>

          {/* Daily Loss & Circuit Breaker */}
          <div
            className="rounded-xl border p-4 shadow space-y-3 bg-[var(--bg1)]"
            style={{ borderColor: "var(--line)" }}
          >
            <h3 className="font-bold text-white text-[12.5px] flex items-center gap-1.5 border-b pb-2" style={{ borderColor: "var(--line)" }}>
              <span>🛑</span>
              <span>DAILY LOSS CIRCUIT BREAKER</span>
            </h3>

            <div>
              <div className="flex items-center justify-between text-[10px] text-[var(--dim)] mb-1">
                <span>MAX DAILY STOP-LOSS HITS</span>
                <span className="text-[#f0546c] font-bold">{cfg.maxDailySL} hits max</span>
              </div>
              <input
                type="range"
                min="1"
                max="5"
                step="1"
                value={cfg.maxDailySL}
                onChange={(e) => onCfg({ maxDailySL: Number(e.target.value) })}
                className="w-full accent-[#f0546c]"
              />
            </div>

            <div className="rounded-lg border p-2.5 bg-[#090d16] text-[10px] text-[var(--muted)] space-y-1" style={{ borderColor: "var(--line)" }}>
              <div className="flex items-center justify-between">
                <span>TODAY'S SL HITS:</span>
                <span className={`font-bold ${st.dailySL >= cfg.maxDailySL ? "text-[#f0546c]" : "text-white"}`}>
                  {st.dailySL} / {cfg.maxDailySL}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>CIRCUIT BREAKER STATUS:</span>
                <span className={`font-bold ${st.halted ? "text-[#f0546c] animate-pulse" : "text-[var(--long)]"}`}>
                  {st.halted ? "HALTED (LOCKED)" : "ACTIVE (DISCIPLINED)"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Interactive Equity Curve */}
        <div className="col-span-12 lg:col-span-7 flex flex-col gap-3">
          <div
            className="rounded-xl border p-4 shadow-lg bg-[var(--bg1)] h-[440px] flex flex-col"
            style={{ borderColor: "var(--line)" }}
          >
            <div className="flex items-center justify-between border-b pb-2.5 mb-2" style={{ borderColor: "var(--line)" }}>
              <h3 className="font-bold text-white text-[12.5px] flex items-center gap-1.5">
                <span>📈</span>
                <span>ACCOUNT GROWTH & EQUITY TRAJECTORY</span>
              </h3>
              <span className="text-[10px] text-[var(--dim)]">DYNAMIC MARK-TO-MARKET</span>
            </div>

            <div className="flex-1 w-full min-h-[340px]">
              <EquityCurve st={st} stats={stats} cfg={cfg} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
