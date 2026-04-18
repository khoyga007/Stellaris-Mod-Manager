import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import { useConfirm } from "@/lib/confirm";

import { Sidebar, type View } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { ModsView } from "@/views/ModsView";
import { DownloadView } from "@/views/DownloadView";
import { LogsView } from "@/views/LogsView";
import { SettingsView } from "@/views/SettingsView";
import { CollectionsView } from "@/views/CollectionsView";
import { ConflictsView } from "@/views/ConflictsView";
import type { DownloadProgress, ModInfo, StellarisPaths, UpdateStatus } from "@/types";
import { applyTheme, loadTheme } from "@/lib/theme";
import { computeMissing } from "@/lib/deps";
import { openTarget } from "@/lib/open";
import { isCompatible } from "@/lib/version";

export default function App() {
  const [view, setView] = useState<View>("mods");
  const [paths, setPaths] = useState<StellarisPaths | null>(null);
  const [mods, setMods] = useState<ModInfo[]>([]);
  const [downloads, setDownloads] = useState<DownloadProgress[]>([]);
  const [launching, setLaunching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [updates, setUpdates] = useState<Record<string, UpdateStatus>>({});
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [gameVersion, setGameVersion] = useState<string | null>(null);
  const confirm = useConfirm();

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const m = await invoke<ModInfo[]>("list_mods");
      setMods(m);
    } catch (e) {
      toast.error(`Failed to load mods: ${e}`);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const checkUpdates = useCallback(async () => {
    setCheckingUpdates(true);
    try {
      const list = await invoke<UpdateStatus[]>("check_mod_updates");
      const map: Record<string, UpdateStatus> = {};
      for (const u of list) map[u.mod_id] = u;
      setUpdates(map);
      const count = list.filter((u) => u.has_update).length;
      toast.success(count > 0 ? `${count} updates available` : "All mods up to date");
    } catch (e) {
      toast.error(`${e}`);
    } finally {
      setCheckingUpdates(false);
    }
  }, []);

  useEffect(() => {
    applyTheme(loadTheme());
    invoke<string | null>("get_game_version").then(setGameVersion).catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const p = await invoke<StellarisPaths>("detect_paths");
        setPaths(p);
        await refresh();
      } catch (e) {
        toast.error(`Setup failed: ${e}`);
      }
    })();

    const unlisten = listen<DownloadProgress>("download-progress", (ev) => {
      setDownloads((prev) => {
        const existing = prev.findIndex((d) => d.workshop_id === ev.payload.workshop_id);
        if (existing === -1) return [...prev, ev.payload];
        const next = prev.slice();
        next[existing] = ev.payload;
        return next;
      });
      if (ev.payload.status === "done") {
        refresh();
        toast.success(`Installed mod #${ev.payload.workshop_id}`);
      }
      if (ev.payload.status === "error") {
        toast.error(`Download failed: ${ev.payload.message}`);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [refresh]);

  async function toggleMod(id: string, enabled: boolean) {
    setMods((prev) => prev.map((m) => (m.id === id ? { ...m, enabled } : m)));
    try {
      await invoke("set_mod_enabled", { id, enabled });
    } catch (e) {
      toast.error(`${e}`);
      refresh();
    }
  }

  async function toggleAll(enabled: boolean) {
    setMods((prev) => prev.map((m) => ({ ...m, enabled })));
    try {
      await invoke("set_all_mods_enabled", { enabled });
    } catch (e) {
      toast.error(`${e}`);
      refresh();
    }
  }

  async function reorder(ids: string[]) {
    setMods((prev) => {
      const map = new Map(prev.map((m) => [m.id, m]));
      return ids
        .map((id, i) => {
          const m = map.get(id);
          return m ? { ...m, load_order: i } : null;
        })
        .filter((m): m is ModInfo => m !== null)
        .concat(prev.filter((m) => !ids.includes(m.id)));
    });
    try {
      await invoke("set_load_order", { ids });
    } catch (e) {
      toast.error(`${e}`);
    }
  }

  async function download(id: string) {
    await invoke("download_workshop_mod", { workshopId: id });
  }

  async function launch() {
    const incompatible = gameVersion
      ? mods.filter((m) => m.enabled && !isCompatible(m.supported_version, gameVersion))
      : [];
    const problems = computeMissing(mods);
    const sections: string[] = [];
    if (incompatible.length > 0) {
      const lines = incompatible
        .slice(0, 6)
        .map((m) => `• ${m.name} — supports ${m.supported_version ?? "?"}`);
      const more = incompatible.length > 6 ? `\n...and ${incompatible.length - 6} more` : "";
      sections.push(`${incompatible.length} mod${incompatible.length > 1 ? "s are" : " is"} built for a different Stellaris version (game: ${gameVersion}):\n${lines.join("\n")}${more}`);
    }
    if (problems.length > 0) {
      const lines = problems.slice(0, 6).map((p) => {
        const parts: string[] = [];
        if (p.disabled.length > 0) parts.push(`disabled: ${p.disabled.join(", ")}`);
        if (p.missing.length > 0) parts.push(`missing: ${p.missing.join(", ")}`);
        return `• ${p.mod.name} — ${parts.join(" | ")}`;
      });
      const more = problems.length > 6 ? `\n...and ${problems.length - 6} more` : "";
      sections.push(`${problems.length} mod${problems.length > 1 ? "s have" : " has"} unmet dependencies:\n${lines.join("\n")}${more}`);
    }
    if (sections.length > 0) {
      const ok = await confirm({
        title: "Pre-launch check",
        message: sections.join("\n\n") + "\n\nLaunch anyway?",
        kind: "warning",
        confirmText: "Launch anyway",
      });
      if (!ok) return;
    }
    setLaunching(true);
    try {
      await invoke("launch_stellaris");
    } catch (e) {
      toast.error(`${e}`);
    } finally {
      setTimeout(() => setLaunching(false), 1500);
    }
  }

  async function deleteMod(id: string) {
    const ok = await confirm({
      title: "Delete mod",
      message: "Delete this mod permanently?",
      kind: "danger",
      confirmText: "Delete",
    });
    if (!ok) return;
    try {
      await invoke("delete_mod", { id });
      toast.success("Mod deleted");
      refresh();
    } catch (e) {
      toast.error(`${e}`);
    }
  }

  const activeCount = mods.filter((m) => m.enabled).length;
  const updateCount = Object.values(updates).filter((u) => u.has_update).length;

  return (
    <div className="h-full flex bg-[var(--color-bg)] noise">
      <Sidebar
        view={view}
        onChange={setView}
        modCount={mods.length}
        activeCount={activeCount}
        updateCount={updateCount}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          onLaunch={launch}
          onRefresh={refresh}
          onOpenFolder={() => paths && openTarget(paths.mod_dir)}
          userDir={paths?.user_dir ?? null}
          launching={launching}
          refreshing={refreshing}
        />

        <main className="flex-1 min-h-0 animate-fade-in" key={view}>
          {view === "mods" && (
            <ModsView
              mods={mods}
              onToggle={toggleMod}
              onToggleAll={toggleAll}
              onReorder={reorder}
              onOpenFolder={(p) => openTarget(p)}
              onOpenWorkshop={(id) =>
                openTarget(`https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`)
              }
              onDelete={deleteMod}
              updates={updates}
              onCheckUpdates={checkUpdates}
              checkingUpdates={checkingUpdates}
              onRefresh={refresh}
              onUpdate={download}
              gameVersion={gameVersion}
            />
          )}
          {view === "download" && (
            <DownloadView
              downloads={downloads}
              onDownload={download}
              onDownloadBatch={async (ids) => {
                await invoke("download_workshop_mods_batch", { ids });
              }}
              onRefreshMods={refresh}
              installedRemoteIds={
                new Set(mods.map((m) => m.remote_file_id).filter((x): x is string => !!x))
              }
              onClearDownloads={(ids) => {
                const toClear = new Set(ids);
                setDownloads((prev) => prev.filter((d) => !toClear.has(d.workshop_id)));
              }}
            />
          )}
          {view === "collections" && <CollectionsView mods={mods} onApplied={refresh} />}
          {view === "conflicts" && <ConflictsView />}
          {view === "logs" && <LogsView />}
          {view === "settings" && (
            <SettingsView paths={paths} onPathsChanged={setPaths} onRefreshMods={refresh} />
          )}
        </main>
      </div>
    </div>
  );
}
