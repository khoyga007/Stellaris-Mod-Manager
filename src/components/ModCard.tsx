import { motion } from "framer-motion";
import { Folder, ExternalLink, Trash2, GripVertical, Package } from "lucide-react";
import type { ModInfo } from "@/types";
import { Badge } from "./ui/Badge";
import { Switch } from "./ui/Switch";
import { Button } from "./ui/Button";
import { formatBytes } from "@/lib/utils";

interface ModCardProps {
  mod: ModInfo;
  onToggle: (id: string, enabled: boolean) => void;
  onOpenFolder: (path: string) => void;
  onOpenWorkshop: (remoteId: string) => void;
  onDelete: (id: string) => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}

export function ModCard({
  mod,
  onToggle,
  onOpenFolder,
  onOpenWorkshop,
  onDelete,
  dragHandleProps,
}: ModCardProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 350, damping: 28 }}
      className="group relative flex items-center gap-4 p-3 pr-4 rounded-[var(--radius-lg)] bg-[var(--color-bg-card)] border border-[var(--color-border)] hover:border-[var(--color-border-strong)] transition-colors duration-200"
    >
      <div
        {...dragHandleProps}
        className="cursor-grab active:cursor-grabbing text-[var(--color-text-dim)] hover:text-[var(--color-text-muted)] transition-colors touch-none"
      >
        <GripVertical className="h-4 w-4" />
      </div>

      <div className="h-14 w-14 shrink-0 rounded-[var(--radius-md)] overflow-hidden bg-gradient-to-br from-[var(--color-bg-hover)] to-[var(--color-bg)] border border-[var(--color-border)] grid place-items-center">
        {mod.picture ? (
          <img src={mod.picture} alt="" className="h-full w-full object-cover" />
        ) : (
          <Package className="h-6 w-6 text-[var(--color-text-dim)]" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[13px] font-semibold truncate">{mod.name}</span>
          {mod.version && (
            <Badge tone="neutral" className="shrink-0">
              v{mod.version}
            </Badge>
          )}
          {mod.remote_file_id && (
            <Badge tone="accent" className="shrink-0">
              Workshop
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-[var(--color-text-dim)]">
          {mod.supported_version && <span>Stellaris {mod.supported_version}</span>}
          <span>•</span>
          <span>{formatBytes(mod.size_bytes)}</span>
          {mod.tags.length > 0 && (
            <>
              <span>•</span>
              <span className="truncate">{mod.tags.slice(0, 3).join(", ")}</span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button variant="ghost" size="icon" onClick={() => onOpenFolder(mod.path)} title="Open folder">
          <Folder className="h-3.5 w-3.5" />
        </Button>
        {mod.remote_file_id && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenWorkshop(mod.remote_file_id!)}
            title="Open Workshop page"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button variant="ghost" size="icon" onClick={() => onDelete(mod.id)} title="Delete mod">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <Switch
        checked={mod.enabled}
        onCheckedChange={(v) => onToggle(mod.id, v)}
      />
    </motion.div>
  );
}
