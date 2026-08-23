import type { DashboardView } from "../engine/types";

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
  const tabs: { id: DashboardView; label: string; icon: string; badge?: number; badgeColor?: string }[] = [
    {
      id: "terminal",
      label: "TRADING TERMINAL",
      icon: "📊",
      badge: openPositionsCount > 0 ? openPositionsCount : undefined,
      badgeColor: "bg-[var(--long)] text-black",
    },
    {
      id: "signals",
      label: "SIGNALS & EXECUTION",
      icon: "⚡",
      badge: pendingSignalsCount > 0 ? pendingSignalsCount : undefined,
      badgeColor: "bg-[var(--short)] text-white animate-bounce",
    },
    {
      id: "strategies",
      label: "STRATEGIES & EA",
      icon: "🧠",
    },
    {
      id: "academy",
      label: "VISUAL ACADEMY",
      icon: "📖",
    },
    {
      id: "analysis",
      label: "ANALYSIS MATRIX",
      icon: "📈",
    },
  ];

  return (
    <nav
      className="flex items-center justify-between border-b px-3 py-1.5 lg:px-4 font-mono text-[11px] select-none bg-[#090d16]"
      style={{ borderColor: "var(--line)" }}
    >
      <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 no-scrollbar">
        {tabs.map((t) => {
          const isActive = activeView === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onSelectView(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-bold tracking-wide transition-all relative ${
                isActive
                  ? "bg-[#18253d] text-[var(--gold-hi)] border border-[var(--gold)]/40 shadow-sm"
                  : "text-[var(--muted)] hover:text-white hover:bg-[#111a2c]"
              }`}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
              {t.badge !== undefined && (
                <span
                  className={`ml-1 px-1.5 py-px rounded-full text-[9px] font-extrabold ${t.badgeColor || "bg-[var(--gold)] text-black"}`}
                >
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="hidden md:flex items-center gap-2 text-[10px] text-[var(--dim)]">
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--long)]" />
          <span className="text-[var(--muted)]">MODULAR DASHBOARD ACTIVE</span>
        </span>
      </div>
    </nav>
  );
}
