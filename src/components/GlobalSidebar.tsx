import React from "react";
import type { DashboardView, EngineConfig, EngineState } from "../engine/types";
import { fmtUSD } from "../engine/types";
import {
  LayoutDashboard,
  Receipt,
  Terminal,
  Zap,
  Brain,
  BookOpen,
  BarChart3,
  FileText,
  Settings,
  Volume2,
  VolumeX,
  Radio,
} from "lucide-react";

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
  const isConnected = st.liveStatus === "connected" || st.feedMode === "simulated";

  return (
    <aside className="w-64 bg-[#070707] border-r border-white/5 flex flex-col shrink-0 h-screen select-none font-sans text-slate-300 z-30">
      {/* 1. Brand Header */}
      <div className="p-4 flex items-center justify-between border-b border-white/5 bg-[#0a0a0a]">
        <div
          className="flex items-center gap-3 cursor-pointer group"
          onClick={() => onSelectView("dashboard")}
        >
          <div className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-[#fcd34d] via-[#f59e0b] to-[#b45309] shadow-lg shadow-[#f59e0b]/20">
            <span className="font-mono font-black text-black text-xs tracking-tighter">TF</span>
            <div className="absolute -inset-0.5 rounded-lg bg-gradient-to-br from-[#fcd34d] to-[#b45309] opacity-40 blur-sm -z-10 group-hover:opacity-75 transition-opacity" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-white text-[13px] tracking-wide font-sans">
                TRADING FLOW
              </span>
              <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-[#f59e0b]/20 text-[#fcd34d] border border-[#f59e0b]/40 font-mono">
                PRO
              </span>
            </div>
            <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isConnected ? "bg-[#10b981] animate-pulse" : "bg-[#ef4444]"
                }`}
              />
              <span>{cfg.feedMode === "live" ? "MT5 LIVE" : "SIMULATION"}</span>
              <span className="text-slate-600">·</span>
              <span className="text-amber-300 font-bold">{cfg.activeSymbol}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Navigation Groups */}
      <div className="flex-1 overflow-y-auto py-3 px-2 space-y-4 custom-scrollbar">
        {/* OVERVIEW */}
        <div>
          <div className="px-3 pb-1 text-[9px] font-extrabold text-slate-500 uppercase tracking-widest font-mono">
            OVERVIEW
          </div>
          <div className="space-y-0.5">
            <SidebarButton
              icon={<LayoutDashboard size={15} />}
              label="Bento Dashboard"
              active={activeView === "dashboard"}
              onClick={() => onSelectView("dashboard")}
            />
            <SidebarButton
              icon={<Receipt size={15} />}
              label="Trades Ledger"
              badge={closedTradesCount > 0 ? closedTradesCount : undefined}
              badgeColor="bg-[#181818] text-slate-300 border border-white/10"
              active={activeView === "trades"}
              onClick={() => onSelectView("trades")}
            />
          </div>
        </div>

        {/* EXECUTION & TERMINAL */}
        <div>
          <div className="px-3 pb-1 text-[9px] font-extrabold text-slate-500 uppercase tracking-widest font-mono">
            EXECUTION
          </div>
          <div className="space-y-0.5">
            <SidebarButton
              icon={<Terminal size={15} />}
              label="Live Terminal"
              active={activeView === "terminal"}
              badge={st.open ? "1 OPEN" : undefined}
              badgeColor="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-mono font-bold"
              onClick={() => onSelectView("terminal")}
            />
            <SidebarButton
              icon={<Zap size={15} />}
              label="Signals Queue"
              badge={pendingCount > 0 ? pendingCount : undefined}
              badgeColor="bg-rose-500 text-white animate-pulse font-bold"
              active={activeView === "signals"}
              onClick={() => onSelectView("signals")}
            />
          </div>
        </div>

        {/* STRATEGIES & MATRIX */}
        <div>
          <div className="px-3 pb-1 text-[9px] font-extrabold text-slate-500 uppercase tracking-widest font-mono">
            QUANT LAB & MATRIX
          </div>
          <div className="space-y-0.5">
            <SidebarButton
              icon={<Brain size={15} />}
              label="Strategy Lab & EA"
              active={activeView === "strategies"}
              onClick={() => onSelectView("strategies")}
            />
            <SidebarButton
              icon={<BarChart3 size={15} />}
              label="Analysis Matrix"
              active={activeView === "analysis"}
              onClick={() => onSelectView("analysis")}
            />
          </div>
        </div>

        {/* DOCS & AUDIT */}
        <div>
          <div className="px-3 pb-1 text-[9px] font-extrabold text-slate-500 uppercase tracking-widest font-mono">
            KNOWLEDGE & AUDIT
          </div>
          <div className="space-y-0.5">
            <SidebarButton
              icon={<BookOpen size={15} />}
              label="Visual Academy"
              active={activeView === "academy"}
              onClick={() => onSelectView("academy")}
            />
            <SidebarButton
              icon={<FileText size={15} />}
              label="System Audit Report"
              active={activeView === "reports"}
              onClick={() => onSelectView("reports")}
            />
          </div>
        </div>
      </div>

      {/* 3. Bottom Utility & Account Status Bar */}
      <div className="p-3 border-t border-white/5 bg-[#090909] space-y-2">
        <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-[#111] border border-white/5 font-mono text-[11px]">
          <div>
            <span className="text-[8.5px] text-slate-500 block uppercase">BALANCE</span>
            <span className="font-bold text-white text-xs">{fmtUSD(st.balance, false, 2)}</span>
          </div>
          <div className="text-right">
            <span className="text-[8.5px] text-slate-500 block uppercase">DAILY SL</span>
            <span className="font-bold text-amber-300">
              {st.dailySL}/{cfg.maxDailySL}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={onOpenBrokerModal}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-[#141414] hover:bg-[#222] border border-white/5 text-xs font-semibold text-slate-300 transition-colors cursor-pointer"
          >
            <Settings size={13} />
            <span>Broker Settings</span>
          </button>
          <button
            onClick={onToggleSound}
            className="p-1.5 rounded-lg bg-[#141414] hover:bg-[#222] border border-white/5 text-slate-300 transition-colors cursor-pointer"
            title={soundEnabled ? "Mute Audio" : "Unmute Audio"}
          >
            {soundEnabled ? <Volume2 size={14} className="text-[#10b981]" /> : <VolumeX size={14} className="text-slate-500" />}
          </button>
        </div>
      </div>
    </aside>
  );
}

function SidebarButton({
  icon,
  label,
  active,
  onClick,
  badge,
  badgeColor,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: string | number;
  badgeColor?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 cursor-pointer ${
        active
          ? "bg-[#141414] text-white border-l-2 border-l-[#f59e0b] shadow-sm font-semibold"
          : "text-slate-400 hover:text-slate-100 hover:bg-[#0f0f0f]"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span className={active ? "text-[#f59e0b]" : "text-slate-500"}>{icon}</span>
        <span>{label}</span>
      </div>
      {badge !== undefined && (
        <span
          className={`text-[9px] px-1.5 py-0.5 rounded-md ${
            badgeColor || "bg-[#222] text-slate-300"
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}
