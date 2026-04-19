import { motion } from "framer-motion";
import {
  Boxes,
  Download,
  Terminal,
  Settings,
  Sparkles,
  Library,
  AlertTriangle,
  ListOrdered,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";

export type View = "mods" | "download" | "collections" | "conflicts" | "load_order" | "logs" | "settings";

interface SidebarProps {
  view: View;
  onChange: (v: View) => void;
  modCount: number;
  activeCount: number;
  conflictCount?: number;
  updateCount?: number;
}

const nav: { id: View; key: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "mods", key: "nav.mods", icon: Boxes },
  { id: "download", key: "nav.download", icon: Download },
  { id: "collections", key: "nav.collections", icon: Library },
  { id: "conflicts", key: "nav.conflicts", icon: AlertTriangle },
  { id: "load_order", key: "nav.loadOrder", icon: ListOrdered },
  { id: "logs", key: "nav.logs", icon: Terminal },
  { id: "settings", key: "nav.settings", icon: Settings },
];

export function Sidebar({ view, onChange, modCount, activeCount, conflictCount, updateCount }: SidebarProps) {
  const { t } = useLang();
  return (
    <aside className="w-60 shrink-0 flex flex-col bg-[var(--color-bg-elevated)] border-r border-[var(--color-border)]">
      <div className="p-5 flex items-center gap-2.5">
        <div className="h-9 w-9 rounded-[var(--radius-md)] bg-gradient-to-br from-[#7c5cff] to-[#ec4899] grid place-items-center shadow-lg shadow-[var(--color-accent-glow)]">
          <Sparkles className="h-5 w-5 text-white" strokeWidth={2.5} />
        </div>
        <div>
          <div className="text-[13px] font-semibold tracking-tight leading-tight font-display">Stellar</div>
          <div className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider leading-tight">
            {t("sidebar.brandSubtitle")}
          </div>
        </div>
      </div>

      <nav className="px-3 flex-1 flex flex-col gap-0.5">
        {nav.map((item) => {
          const active = view === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onChange(item.id)}
              className={cn(
                "relative flex items-center gap-3 h-10 px-3 rounded-[var(--radius-md)] text-[13px] font-medium transition-colors duration-200",
                active
                  ? "text-[var(--color-text)]"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-hover)]"
              )}
            >
              {active && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute inset-0 bg-[var(--color-bg-hover)] rounded-[var(--radius-md)] border border-[var(--color-border)]"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <Icon className="relative h-4 w-4" />
              <span className="relative">{t(item.key)}</span>
              {item.id === "mods" && modCount > 0 && (
                <span className="relative ml-auto text-[10px] text-[var(--color-text-dim)]">
                  {activeCount}/{modCount}
                  {updateCount && updateCount > 0 ? (
                    <span className="ml-1 text-[var(--color-accent-hover)]">•{updateCount}</span>
                  ) : null}
                </span>
              )}
              {item.id === "conflicts" && conflictCount && conflictCount > 0 ? (
                <span className="relative ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-warning)]/15 text-[var(--color-warning)]">
                  {conflictCount}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="p-3 m-3 rounded-[var(--radius-lg)] bg-gradient-to-br from-[#7c5cff]/10 to-[#ec4899]/5 border border-[var(--color-accent)]/20">
        <div className="text-[11px] font-semibold text-[var(--color-accent-hover)] mb-1">
          {t("sidebar.tipTitle")}
        </div>
        <div className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">
          {t("sidebar.tipBody")}
        </div>
      </div>
    </aside>
  );
}
