import type { EngineConfig, EngineState } from "../engine/types";
import { fmtUSD } from "../engine/types";
import type { Stats } from "../engine/engine";

interface Props {
  st: EngineState;
  stats: Stats;
  cfg: EngineConfig;
}

export default function EquityCurve({ st, stats, cfg }: Props) {
  const data = st.equity.slice(-360);
  const W = 600;
  const H = 148;
  const padT = 10;
  const padB = 8;
  let lo = Math.min(...data, cfg.account);
  let hi = Math.max(...data, cfg.account);
  if (hi - lo < 1) { hi += 1; lo -= 1; }
  const span = hi - lo;
  lo -= span * 0.08;
  hi += span * 0.08;

  const x = (i: number) => (i / (data.length - 1)) * W;
  const y = (v: number) => padT + ((hi - v) / (hi - lo)) * (H - padT - padB);

  let line = "";
  data.forEach((v, i) => {
    line += `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
  });
  const area = `${line}L${W},${H}L0,${H}Z`;
  const up = stats.equityNow >= cfg.account;

  return (
    <div className="panel rise-in p-4" style={{ animationDelay: "0.18s" }}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="panel-title mb-1">Equity Curve</div>
          <div className="font-mono text-[24px] font-semibold leading-none" style={{ color: up ? "var(--long)" : "var(--short)" }}>
            {fmtUSD(stats.equityNow)}
          </div>
        </div>
        <div className="flex gap-5 font-mono text-[11px]">
          <div>
            <div className="text-[9px] tracking-[0.2em] text-[var(--dim)]">NET P/L</div>
            <div style={{ color: stats.net + stats.openPnl >= 0 ? "var(--long)" : "var(--short)" }}>
              {fmtUSD(stats.net + stats.openPnl)}
            </div>
          </div>
          <div>
            <div className="text-[9px] tracking-[0.2em] text-[var(--dim)]">MAX DD</div>
            <div style={{ color: "var(--short)" }}>−{fmtUSD(stats.maxDD)} ({stats.maxDDPct.toFixed(1)}%)</div>
          </div>
          <div>
            <div className="text-[9px] tracking-[0.2em] text-[var(--dim)]">PROFIT FACTOR</div>
            <div style={{ color: stats.pf >= 1 ? "var(--long)" : "var(--short)" }}>
              {stats.pf >= 99 ? "∞" : stats.pf.toFixed(2)}
            </div>
          </div>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[132px] w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={up ? "var(--long)" : "var(--short)"} stopOpacity="0.28" />
            <stop offset="100%" stopColor={up ? "var(--long)" : "var(--short)"} stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {/* account baseline */}
        <line x1="0" x2={W} y1={y(cfg.account)} y2={y(cfg.account)} stroke="var(--dim)" strokeDasharray="3 5" strokeWidth="1" opacity="0.6" />
        <path d={area} fill="url(#eqFill)" />
        <path d={line} fill="none" stroke={up ? "var(--long)" : "var(--short)"} strokeWidth="1.8" strokeLinejoin="round" />
        <circle cx={x(data.length - 1)} cy={y(data[data.length - 1])} r="3" fill={up ? "var(--long)" : "var(--short)"} className="blink-soft" />
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[9px] text-[var(--dim)]">
        <span>−360 BARS</span>
        <span>START {fmtUSD(cfg.account)}</span>
        <span>NOW</span>
      </div>
    </div>
  );
}
