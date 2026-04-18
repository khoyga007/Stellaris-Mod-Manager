import { Play, RefreshCw, FolderOpen } from "lucide-react";
import { Button } from "./ui/Button";

interface TopBarProps {
  onLaunch: () => void;
  onRefresh: () => void;
  onOpenFolder: () => void;
  userDir: string | null;
  launching?: boolean;
  refreshing?: boolean;
}

export function TopBar({
  onLaunch,
  onRefresh,
  onOpenFolder,
  userDir,
  launching,
  refreshing,
}: TopBarProps) {
  return (
    <header className="h-14 shrink-0 flex items-center gap-3 px-6 border-b border-[var(--color-border)] glass">
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-dim)] font-medium">
          Stellaris User Directory
        </div>
        <div className="text-xs text-[var(--color-text-muted)] truncate font-mono">
          {userDir ?? "Detecting..."}
        </div>
      </div>

      <Button variant="ghost" size="icon" onClick={onOpenFolder} title="Open mod folder">
        <FolderOpen className="h-4 w-4" />
      </Button>

      <Button variant="ghost" size="icon" onClick={onRefresh} title="Rescan mods" disabled={refreshing}>
        <RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
      </Button>

      <Button variant="primary" size="md" onClick={onLaunch} disabled={launching}>
        <Play className="h-4 w-4" fill="currentColor" />
        {launching ? "Launching..." : "Launch Stellaris"}
      </Button>
    </header>
  );
}
