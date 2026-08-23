import React from "react";
import type { DashboardView } from "../engine/types";
import { LayoutDashboard, Terminal, Zap, Brain, BookOpen, BarChart3 } from "lucide-react";

interface Props {
  activeView: DashboardView;
  onSelectView: (v: DashboardView) => void;
  pendingSignalsCount: number;
  openPositionsCount: number;
}

export default function DashboardNav({
  activeView,
  onSelectView,
  pendingSignalsCount,
  openPositionsCount,
}: Props) {
  const tabs: { id: DashboardView; label: string; icon: React.ReactNode; badge?: string | number; badgeColor?: string }[] = [
    {
      id: "dashboard",
      label: "BENTO OVERVIEW",
      icon: <LayoutDashboard size={14} />,
    },
    {
      id: "terminal",
      label: "TRADING TERMINAL",
      icon: <Terminal size={14} />,
      badge: openPositionsCount > 0 ? `${openPositionsCount} OPEN` : undefined,
      badgeColor: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40",
    },
    {
      id: "signals",
      label: "SIGNALS & EXECUTION",
      icon: <Zap size={14} />,
      badge: pendingSignalsCount > 0 ? pendingSignalsCount : undefined,
      badgeColor: "bg-rose-500 text-white animate-pulse",
    },
    {
      id: "strategies",
      label: "STRATEGIES & EA",
      icon: <Brain size={14} />,
    },
    {
      id: "analysis",
      label: "ANALYSIS MATRIX",
      icon: <BarChart3 size={14} />,
    },
    {
      id: "academy",
      label: "VISUAL ACADEMY",
      icon: <BookOpen size={14} />,
    },
  ];

  return (
    <nav className="flex items-center justify-between border-b border-white/5 px-3 py-1.5 lg:px-4 font-mono text-[11px] select-none bg-[#0a0a0a]/95 backdrop-blur-md">
      <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 no-scrollbar">
        {tabs.map((t) => {
          const isActive = activeView === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onSelectView(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold tracking-wide transition-all cursor-pointer ${
                isActive
                  ? "bg-[#161616] text-[#fcd34d] border border-[#f59e0b]/40 shadow-sm"
                  : "text-slate-400 hover:text-white hover:bg-[#121212]"
              }`}
            >
              <span className={isActive ? "text-[#f59e0b]" : "text-slate-500"}>{t.icon}</span>
              <span>{t.label}</span>
              {t.badge !== undefined && (
                <span
                  className={`ml-1 px-1.5 py-0.2 rounded text-[9px] font-extrabold ${
                    t.badgeColor || "bg-[#f59e0b] text-black"
                  }`}
                >
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="hidden md:flex items-center gap-2 text-[10px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[#10b981] animate-pulse" />
          <span className="text-slate-400 font-semibold uppercase tracking-wider">INSTITUTIONAL SUITE ACTIVE</span>
        </span>
      </div>
    </nav>
  );
}
