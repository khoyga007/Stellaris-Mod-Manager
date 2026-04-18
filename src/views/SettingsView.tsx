import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useConfirm } from "@/lib/confirm";
import { Settings, FolderSearch, HardDrive, Info, Database, MoveRight, Loader2, X, Palette, Check, Gamepad2, Zap, History, Undo2 } from "lucide-react";
import type { DlcBackup, MigrateReport, StellarisPaths } from "@/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { toast } from "sonner";
import { applyTheme, loadTheme, THEMES, type ThemeId } from "@/lib/theme";
import { useLang, type Lang } from "@/lib/i18n";
import { Languages } from "lucide-react";

interface SettingsViewProps {
  paths: StellarisPaths | null;
  onPathsChanged: (p: StellarisPaths) => void;
  onRefreshMods?: () => void;
}

export function SettingsView({ paths, onPathsChanged, onRefreshMods }: SettingsViewProps) {
  const { lang, setLang, t } = useLang();
  const confirm = useConfirm();
  const [exePath, setExePath] = useState("");
  const [migrating, setMigrating] = useState(false);
  const [theme, setTheme] = useState<ThemeId>(loadTheme());
  const [gameVersion, setGameVersionLocal] = useState("");
  const [backups, setBackups] = useState<DlcBackup[]>([]);

  async function loadBackups() {
    try {
      const list = await invoke<DlcBackup[]>("list_dlc_backups");
      setBackups(list);
    } catch (e) {
      console.warn("list_dlc_backups failed:", e);
    }
  }

  useEffect(() => {
    loadBackups();
  }, []);

  async function restoreBackup(name: string) {
    const ok = await confirm({
      title: "Restore backup",
      message:
        "Restore this backup? Your current mod load order will be overwritten (a snapshot of it is saved first).",
      kind: "warning",
      confirmText: "Restore",
    });
    if (!ok) return;
    try {
      await invoke("restore_dlc_backup", { name });
      toast.success("Backup restored");
      await loadBackups();
      onRefreshMods?.();
    } catch (e) {
      toast.error(`${e}`);
    }
  }

  useEffect(() => {
    invoke<string | null>("get_game_version").then((v) => setGameVersionLocal(v ?? ""));
  }, []);

  async function saveGameVersion(v: string) {
    setGameVersionLocal(v);
    await invoke("set_game_version", { version: v.trim() || null });
  }

  async function autoDetectVersion() {
    try {
      const v = await invoke<string | null>("detect_game_version_cmd");
      if (v) {
        await saveGameVersion(v);
        toast.success(`Detected Stellaris ${v}`);
      } else {
        toast.error("Could not auto-detect — enter manually.");
      }
    } catch (e) {
      toast.error(`${e}`);
    }
  }

  function pickTheme(id: ThemeId) {
    applyTheme(id);
    setTheme(id);
  }

  useEffect(() => {
    invoke<string | null>("get_stored_exe_path").then((v) => setExePath(v ?? ""));
  }, []);

  async function pickExe() {
    const selected = await openDialog({
      multiple: false,
      filters: [{ name: "Stellaris executable", extensions: ["exe"] }],
    });
    if (typeof selected === "string") {
      setExePath(selected);
      await invoke("set_stored_exe_path", { path: selected });
      toast.success("Stellaris executable saved");
    }
  }

  async function pickUserDir() {
    const selected = await openDialog({ directory: true, multiple: false });
    if (typeof selected === "string") {
      const updated = await invoke<StellarisPaths>("set_user_dir", { path: selected });
      onPathsChanged(updated);
      toast.success("User directory updated");
    }
  }

  async function pickContentDir() {
    const selected = await openDialog({ directory: true, multiple: false });
    if (typeof selected !== "string") return;
    try {
      const updated = await invoke<StellarisPaths>("set_content_dir", { path: selected });
      onPathsChanged(updated);
      toast.success("Mod storage directory updated");
    } catch (e) {
      toast.error(`${e}`);
    }
  }

  async function clearContentDir() {
    try {
      const updated = await invoke<StellarisPaths>("set_content_dir", { path: null });
      onPathsChanged(updated);
      toast.success("Reverted to default (alongside descriptors)");
    } catch (e) {
      toast.error(`${e}`);
    }
  }

  async function migrate() {
    if (!paths?.content_dir) {
      toast.error("Set a mod storage directory first.");
      return;
    }
    const ok = await confirm({
      title: "Migrate mods",
      message: `Move all existing mod content into:\n${paths.content_dir}\n\nDescriptors stay in the user dir. This can take a while for large mods.`,
      kind: "warning",
      confirmText: "Migrate",
    });
    if (!ok) return;
    setMigrating(true);
    try {
      const r = await invoke<MigrateReport>("migrate_content_dir");
      const failedMsg = r.failed.length > 0 ? ` — ${r.failed.length} failed` : "";
      toast.success(`Moved ${r.moved}, skipped ${r.skipped}${failedMsg}`);
      console.group("Migration report");
      r.details.forEach((d) => console.log(d));
      if (r.failed.length > 0) console.warn("Failures:", r.failed);
      console.groupEnd();
      if (r.moved === 0 && r.skipped > 0) {
        toast.info("Open DevTools console (F12 / Ctrl+Shift+I) to see why each mod was skipped.");
      }
    } catch (e) {
      toast.error(`${e}`);
    } finally {
      setMigrating(false);
    }
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-8 py-8 max-w-3xl w-full mx-auto space-y-5">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-[var(--radius-md)] bg-[var(--color-bg-hover)] grid place-items-center">
            <Settings className="h-5 w-5 text-[var(--color-text-muted)]" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight font-display">Settings</h1>
            <p className="text-xs text-[var(--color-text-muted)]">
              Paths, launch options, and preferences.
            </p>
          </div>
        </div>

        <Card title="Stellaris executable" icon={HardDrive}>
          <div className="flex gap-2">
            <Input value={exePath} readOnly placeholder="Not set — click Browse..." className="font-mono text-xs" />
            <Button variant="secondary" onClick={pickExe}>
              <FolderSearch className="h-4 w-4" />
              Browse
            </Button>
          </div>
          <Hint>
            Point this at <span className="font-mono">stellaris.exe</span> (cracked build works fine — the launcher is bypassed).
          </Hint>
        </Card>

        <Card title="User directory" icon={FolderSearch}>
          <div className="flex gap-2">
            <Input
              value={paths?.user_dir ?? ""}
              readOnly
              placeholder="Detecting..."
              className="font-mono text-xs"
            />
            <Button variant="secondary" onClick={pickUserDir}>
              <FolderSearch className="h-4 w-4" />
              Change
            </Button>
          </div>
          <Hint>
            Usually <span className="font-mono">Documents\Paradox Interactive\Stellaris</span>. This is where mods, saves, and <span className="font-mono">dlc_load.json</span> live.
          </Hint>
        </Card>

        <Card title="Mod storage directory" icon={Database}>
          <div className="flex gap-2">
            <Input
              value={paths?.content_dir ?? ""}
              readOnly
              placeholder="Default — next to descriptors in user dir"
              className="font-mono text-xs"
            />
            <Button variant="secondary" onClick={pickContentDir}>
              <FolderSearch className="h-4 w-4" />
              Change
            </Button>
            {paths?.content_dir && (
              <Button variant="ghost" onClick={clearContentDir} title="Revert to default">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          <Hint>
            Pick a folder on another drive (e.g. <span className="font-mono">E:\StellarisMods</span>) if your
            C: drive is full. Tiny <span className="font-mono">.mod</span> descriptors stay in the user dir —
            only the heavy content folders move here.
          </Hint>
          {paths?.content_dir && (
            <div className="mt-3 flex items-center justify-between gap-3 p-3 rounded-[var(--radius-md)] bg-[var(--color-bg-elevated)] border border-[var(--color-border)]">
              <div className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">
                Move existing mods here to free up the user drive. New downloads always go to this folder.
              </div>
              <Button variant="primary" size="sm" onClick={migrate} disabled={migrating}>
                {migrating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MoveRight className="h-3.5 w-3.5" />}
                Migrate now
              </Button>
            </div>
          )}
        </Card>

        <Card title="Game version" icon={Gamepad2}>
          <div className="flex gap-2">
            <Input
              value={gameVersion}
              onChange={(e) => setGameVersionLocal(e.target.value)}
              onBlur={(e) => saveGameVersion(e.target.value)}
              placeholder="e.g. 4.0.5"
              className="font-mono text-xs"
            />
            <Button variant="secondary" onClick={autoDetectVersion}>
              <Zap className="h-4 w-4" />
              Auto-detect
            </Button>
          </div>
          <Hint>
            Used to flag mods built for a different Stellaris version. Auto-detect reads{" "}
            <span className="font-mono">launcher-settings.json</span> next to{" "}
            <span className="font-mono">stellaris.exe</span>. Enter manually (e.g. <span className="font-mono">4.0.5</span>) if detection fails.
          </Hint>
        </Card>

        <Card title={t("settings.language")} icon={Languages}>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ["en", t("settings.langEn"), "EN"],
                ["vi", t("settings.langVi"), "VI"],
              ] as [Lang, string, string][]
            ).map(([code, label, badge]) => {
              const active = lang === code;
              return (
                <button
                  key={code}
                  onClick={() => setLang(code)}
                  className={
                    "relative flex items-center gap-3 p-3 rounded-[var(--radius-md)] border transition-colors text-left " +
                    (active
                      ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10"
                      : "border-[var(--color-border)] bg-[var(--color-bg-elevated)] hover:border-[var(--color-border-strong)]")
                  }
                >
                  <div className="h-9 w-9 rounded-[var(--radius-sm)] bg-gradient-to-br from-[#7c5cff]/30 to-[#ec4899]/20 grid place-items-center text-[11px] font-bold tracking-wider">
                    {badge}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold flex items-center gap-1.5">
                      {label}
                      {active && <Check className="h-3 w-3 text-[var(--color-accent-hover)]" />}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <Hint>{t("settings.languageBody")}</Hint>
        </Card>

        <Card title={t("settings.theme")} icon={Palette}>
          <div className="grid grid-cols-2 gap-3">
            {THEMES.map((t) => {
              const active = t.id === theme;
              return (
                <button
                  key={t.id}
                  onClick={() => pickTheme(t.id)}
                  className={
                    "relative flex items-center gap-3 p-3 rounded-[var(--radius-md)] border transition-colors text-left " +
                    (active
                      ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10"
                      : "border-[var(--color-border)] bg-[var(--color-bg-elevated)] hover:border-[var(--color-border-strong)]")
                  }
                >
                  <div className="flex gap-1 shrink-0">
                    {t.swatches.map((c, i) => (
                      <span
                        key={i}
                        className="h-8 w-4 rounded-sm border border-black/40"
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold flex items-center gap-1.5">
                      {t.name}
                      {active && <Check className="h-3 w-3 text-[var(--color-accent-hover)]" />}
                    </div>
                    <div className="text-[10px] text-[var(--color-text-dim)] leading-tight mt-0.5">
                      {t.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <Hint>Theme changes apply instantly and persist across launches.</Hint>
        </Card>

        <Card title="Mod list backups" icon={History}>
          {backups.length === 0 ? (
            <div className="text-[11px] text-[var(--color-text-dim)]">
              No backups yet. Every time the mod list changes, a snapshot of{" "}
              <span className="font-mono">dlc_load.json</span> is saved here (last 5 kept).
            </div>
          ) : (
            <div className="space-y-1.5">
              {backups.map((b) => (
                <div
                  key={b.name}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-[var(--radius-md)] bg-[var(--color-bg-elevated)] border border-[var(--color-border)]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium truncate">
                      {new Date(b.timestamp_ms).toLocaleString()}
                    </div>
                    <div className="text-[10px] text-[var(--color-text-dim)]">
                      {b.enabled_count} enabled · {(b.size_bytes / 1024).toFixed(1)} KB
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => restoreBackup(b.name)}>
                    <Undo2 className="h-3.5 w-3.5" />
                    Restore
                  </Button>
                </div>
              ))}
            </div>
          )}
          <Hint>
            Snapshots are deduped (no change = no new snapshot) and pruned to the 5 most recent. Restoring also snapshots your current state first, so you can undo the undo.
          </Hint>
        </Card>

        <Card title="About" icon={Info}>
          <div className="text-xs text-[var(--color-text-muted)] space-y-1">
            <div>Stellar Mod Manager · v0.1.0</div>
            <div>Built with Tauri + React · Crafted for Stellaris 4.x</div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Card({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-lg)] bg-[var(--color-bg-card)] border border-[var(--color-border)] p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4 text-[var(--color-text-muted)]" />
        <div className="text-sm font-semibold">{title}</div>
      </div>
      {children}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2 text-[11px] text-[var(--color-text-dim)] leading-relaxed">{children}</div>
  );
}
