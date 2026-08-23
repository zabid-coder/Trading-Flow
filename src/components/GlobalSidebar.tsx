import React from "react";
import type { DashboardView, EngineConfig, EngineState } from "../engine/types";
import { fmtUSD } from "../engine/types";

interface Props {
  activeView: DashboardView;
  onSelectView: (v: DashboardView) => void;
  st: EngineState;
  cfg: EngineConfig;
  onOpenBrokerModal: () => void;
  onToggleSound: () => void;
  soundEnabled: boolean;
}

export default function GlobalSidebar({
  activeView,
  onSelectView,
  st,
  cfg,
  onOpenBrokerModal,
  onToggleSound,
  soundEnabled,
}: Props) {
  const pendingCount = st.queue.filter((q) => q.status === "PENDING").length;
  const closedTradesCount = st.trades.filter((t) => !t.open).length;

  return (
    <aside className="w-64 bg-[#090e18] border-r border-[#1a2538] flex flex-col shrink-0 h-screen select-none font-sans text-gray-300 z-30">
      {/* Brand Header */}
      <div className="p-4 flex items-center justify-between border-b border-[#1a2538] bg-[#0c1322]">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => onSelectView("dashboard")}>
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[var(--gold)] to-amber-300 text-black flex items-center justify-center font-black text-sm shadow-md shadow-amber-500/20">
            TF
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-white text-[14px] tracking-wide">Trading Flow</span>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[var(--gold)]/20 text-[var(--gold)] border border-[var(--gold)]/40 font-mono">
                PRO
              </span>
            </div>
            <div className="text-[10px] text-gray-400 font-mono flex items-center gap-1.5 mt-0.5">
              <span className={`h-1.5 w-1.5 rounded-full ${cfg.feedMode === "live" ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
              <span>{cfg.feedMode === "live" ? "LIVE FEED" : "SIM ENGINE"}</span>
              <span className="text-gray-600">·</span>
              <span className="text-gray-300 font-semibold">{cfg.activeSymbol}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Groups */}
      <div className="flex-1 overflow-y-auto py-3 px-2 space-y-4 custom-scrollbar">
        {/* OVERVIEW */}
        <div>
          <div className="px-3 pb-1 text-[9px] font-bold text-gray-400 uppercase tracking-widest font-mono">OVERVIEW</div>
          <div className="space-y-0.5">
            <SidebarButton
              icon="🏠"
              label="Dashboard"
              active={activeView === "dashboard"}
              onClick={() => onSelectView("dashboard")}
            />
            <SidebarButton
              icon="≡"
              label="Trades Ledger"
              badge={closedTradesCount > 0 ? closedTradesCount : undefined}
              badgeColor="bg-[#1e293b] text-gray-300 border border-gray-700"
              active={activeView === "trades"}
              onClick={() => onSelectView("trades")}
            />
          </div>
        </div>

        {/* EXECUTION & TERMINAL */}
        <div>
          <div className="px-3 pb-1 text-[9px] font-bold text-gray-400 uppercase tracking-widest font-mono">EXECUTION</div>
          <div className="space-y-0.5">
            <SidebarButton
              icon="📊"
              label="Live Terminal"
              active={activeView === "terminal"}
              badge={st.open ? "1 OPEN" : undefined}
              badgeColor="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-mono"
              onClick={() => onSelectView("terminal")}
            />
            <SidebarButton
              icon="⚡"
              label="Signals Queue"
              badge={pendingCount > 0 ? pendingCount : undefined}
              badgeColor="bg-rose-500 text-white animate-pulse"
              active={activeView === "signals"}
              onClick={() => onSelectView("signals")}
            />
          </div>
        </div>

        {/* SETUP & STRATEGIES */}
        <div>
          <div className="px-3 pb-1 text-[9px] font-bold text-gray-400 uppercase tracking-widest font-mono">SETUP</div>
          <div className="space-y-0.5">
            <SidebarButton
              icon="⚙️"
              label="Strategies & EA"
              active={activeView === "strategies"}
              badge={cfg.rbEnabled ? "RB ON" : undefined}
              badgeColor="bg-amber-500/20 text-amber-300 border border-amber-500/40"
              onClick={() => onSelectView("strategies")}
            />
          </div>
        </div>

        {/* ANALYZE */}
        <div>
          <div className="px-3 pb-1 text-[9px] font-bold text-gray-400 uppercase tracking-widest font-mono">ANALYZE</div>
          <div className="space-y-0.5">
            <SidebarButton
              icon="📈"
              label="Performance Analysis"
              active={activeView === "analysis"}
              onClick={() => onSelectView("analysis")}
            />
            <SidebarButton
              icon="📑"
              label="Audit Reports"
              active={activeView === "reports"}
              onClick={() => onSelectView("reports")}
            />
          </div>
        </div>

        {/* SYSTEM */}
        <div>
          <div className="px-3 pb-1 text-[9px] font-bold text-gray-400 uppercase tracking-widest font-mono">SYSTEM</div>
          <div className="space-y-0.5">
            <SidebarButton
              icon="📖"
              label="Visual Academy"
              active={activeView === "academy"}
              onClick={() => onSelectView("academy")}
            />
            <SidebarButton
              icon="🔌"
              label="Broker & API Bridge"
              active={false}
              onClick={onOpenBrokerModal}
            />
          </div>
        </div>
      </div>

      {/* Sidebar Footer */}
      <div className="p-3 border-t border-[#1a2538] bg-[#0c1322] flex flex-col gap-2">
        <div className="flex items-center justify-between px-2.5 py-2 rounded-lg bg-[#121b2d] border border-[#1e2d48]">
          <div className="flex flex-col">
            <span className="text-[9px] text-gray-400 font-mono">ACCOUNT BALANCE</span>
            <span className="text-[13px] font-bold text-white font-mono">{fmtUSD(st.balance)}</span>
          </div>
          <button
            onClick={onToggleSound}
            className={`p-1.5 rounded-md border transition-all text-xs ${
              soundEnabled
                ? "bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20"
                : "bg-gray-800/60 border-gray-700 text-gray-500 hover:text-gray-300"
            }`}
            title={soundEnabled ? "Mute Synthesizer Audio" : "Enable Synthesizer Audio"}
          >
            {soundEnabled ? "🔊" : "🔇"}
          </button>
        </div>
      </div>
    </aside>
  );
}

function SidebarButton({
  icon,
  label,
  active = false,
  badge,
  badgeColor,
  onClick,
}: {
  icon: string;
  label: string;
  active?: boolean;
  badge?: string | number;
  badgeColor?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full px-3 py-2 rounded-lg font-medium text-[12px] flex items-center justify-between transition-all group ${
        active
          ? "bg-[#182742] text-white font-semibold shadow-inner border border-blue-500/30 text-blue-100"
          : "text-gray-400 hover:text-white hover:bg-[#121d30]"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span className={`text-[13px] transition-transform group-hover:scale-110 ${active ? "opacity-100" : "opacity-70"}`}>
          {icon}
        </span>
        <span className="tracking-wide">{label}</span>
      </div>

      {badge !== undefined && (
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${badgeColor || "bg-blue-600 text-white"}`}>
          {badge}
        </span>
      )}
    </button>
  );
}
