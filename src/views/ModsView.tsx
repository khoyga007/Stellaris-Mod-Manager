import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import {
  Search,
  Wand2,
  ArrowUp,
  ArrowDown,
  X,
  RefreshCw,
  PackageX,
  PackageCheck,
  ArrowLeftRight,
  Bug,
  DownloadCloud,
  Filter,
} from "lucide-react";
import type { ModInfo, UpdateStatus, LoadOrderAnalysis } from "@/types";
import { computeMissing } from "@/lib/deps";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ModCard } from "@/components/ModCard";
import { BisectBar } from "@/components/BisectBar";
import {
  type BisectState,
  effectiveEnabled,
  loadBisect,
  markResult,
  saveBisect,
  startBisect,
} from "@/lib/bisect";
import { isCompatible } from "@/lib/version";
import { useLang } from "@/lib/i18n";

interface ModsViewProps {
  mods: ModInfo[];
  onToggle: (id: string, enabled: boolean) => void;
  onToggleAll: (enabled: boolean) => void;
  onReorder: (ids: string[]) => void;
  onOpenFolder: (path: string) => void;
  onOpenWorkshop: (remoteId: string) => void;
  onDelete: (id: string) => void;
  updates: Record<string, UpdateStatus>;
  onCheckUpdates: () => void;
  checkingUpdates: boolean;
  onRefresh: () => void;
  onUpdate: (remoteFileId: string) => Promise<void>;
  gameVersion: string | null;
}

type Pane = "available" | "active";
type StatusFilter = "all" | "outdated" | "updates" | "missing-deps";

interface DragPayload {
  id: string;
  from: Pane;
}

export function ModsView({
  mods,
  onToggle,
  onToggleAll,
  onReorder,
  onOpenFolder,
  onOpenWorkshop,
  onDelete,
  updates,
  onCheckUpdates,
  checkingUpdates,
  onRefresh,
  onUpdate,
  gameVersion,
}: ModsViewProps) {
  const { t } = useLang();
  const [updatingAll, setUpdatingAll] = useState(false);
  const [query, setQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [drag, setDrag] = useState<DragPayload | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [overPane, setOverPane] = useState<Pane | null>(null);
  const [preview, setPreview] = useState<{ current: string[]; suggested: string[] } | null>(null);
  const [sorting, setSorting] = useState(false);
  const [bisect, setBisect] = useState<BisectState | null>(() => loadBisect());

  useEffect(() => {
    saveBisect(bisect);
  }, [bisect]);

  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of mods) for (const t of m.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [mods]);

  const missingDepsSet = useMemo(() => {
    return new Set(computeMissing(mods).map((d) => d.mod.id));
  }, [mods]);

  const { available, active } = useMemo(() => {
    const q = query.toLowerCase().trim();
    const matchQuery = (m: ModInfo) =>
      !q || m.name.toLowerCase().includes(q) || m.tags.some((t) => t.toLowerCase().includes(q));
    const matchTags = (m: ModInfo) => {
      if (activeTags.size === 0) return true;
      const set = new Set(m.tags);
      for (const t of activeTags) if (!set.has(t)) return false;
      return true;
    };
    const matchStatus = (m: ModInfo) => {
      if (statusFilter === "all") return true;
      if (statusFilter === "outdated") return !isCompatible(m.supported_version, gameVersion ?? undefined);
      if (statusFilter === "updates") return !!updates[m.id]?.has_update;
      if (statusFilter === "missing-deps") return missingDepsSet.has(m.id);
      return true;
    };
    const match = (m: ModInfo) => matchQuery(m) && matchTags(m) && matchStatus(m);
    const available = mods
      .filter((m) => !m.enabled && match(m))
      .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    const active = mods
      .filter((m) => m.enabled && match(m))
      .sort((a, b) => a.load_order - b.load_order);
    return { available, active };
  }, [mods, query, activeTags, statusFilter, gameVersion, updates, missingDepsSet]);

  const filterCount = activeTags.size + (statusFilter !== "all" ? 1 : 0);

  function toggleTag(tag: string) {
    setActiveTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  function clearFilters() {
    setActiveTags(new Set());
    setStatusFilter("all");
  }

  const enabledCount = mods.filter((m) => m.enabled).length;
  const updateCount = Object.values(updates).filter((u) => u.has_update).length;
  const allOn = mods.length > 0 && enabledCount === mods.length;

  function startDrag(e: React.DragEvent, id: string, from: Pane) {
    const payload: DragPayload = { id, from };
    setDrag(payload);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("application/json", JSON.stringify(payload));
    e.dataTransfer.setData("text/plain", id);
  }

  function endDrag() {
    setDrag(null);
    setOverId(null);
    setOverPane(null);
  }

  function readPayload(e: React.DragEvent): DragPayload | null {
    if (drag) return drag;
    const raw = e.dataTransfer.getData("application/json");
    if (!raw) return null;
    try {
      return JSON.parse(raw) as DragPayload;
    } catch {
      return null;
    }
  }

  function onCardDragOver(e: React.DragEvent, targetId: string, pane: Pane) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (overId !== targetId) setOverId(targetId);
    if (overPane !== pane) setOverPane(pane);
  }

  function onPaneDragOver(e: React.DragEvent, pane: Pane) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (overPane !== pane) setOverPane(pane);
  }

  async function applyEnabledSet(ids: string[]) {
    try {
      await invoke("set_enabled_set", { ids });
      onRefresh();
    } catch (e) {
      toast.error(`${e}`);
    }
  }

  function dropOnActiveCard(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    e.stopPropagation();
    const p = readPayload(e);
    endDrag();
    if (!p || p.id === targetId) return;

    if (p.from === "active") {
      const ids = active.map((m) => m.id);
      const from = ids.indexOf(p.id);
      const to = ids.indexOf(targetId);
      if (from < 0 || to < 0) return;
      const next = ids.slice();
      next.splice(to, 0, ...next.splice(from, 1));
      onReorder(next);
    } else {
      // Dropped from available onto a specific active card → enable + insert at that position.
      // Atomic: set_enabled_set writes both membership and order in one shot.
      const ids = active.map((m) => m.id);
      const to = ids.indexOf(targetId);
      if (to < 0) return;
      const next = [...ids.slice(0, to), p.id, ...ids.slice(to)];
      applyEnabledSet(next);
    }
  }

  function dropOnActivePane(e: React.DragEvent) {
    e.preventDefault();
    const p = readPayload(e);
    endDrag();
    if (!p) return;
    if (p.from === "active") return; // no target card → no-op
    const next = [...active.map((m) => m.id), p.id];
    applyEnabledSet(next);
  }

  function dropOnAvailablePane(e: React.DragEvent) {
    e.preventDefault();
    const p = readPayload(e);
    endDrag();
    if (!p || p.from === "available") return;
    onToggle(p.id, false);
  }

  async function autoSort() {
    setSorting(true);
    try {
      const analysis = await invoke<LoadOrderAnalysis>("analyze_load_order");
      const current = mods.filter((m) => m.enabled).map((m) => m.id);
      setPreview({ current, suggested: analysis.suggested });

      const cycles = analysis.issues.filter((i) => i.kind === "Cycle");
      const missing = analysis.issues.filter((i) => i.kind === "MissingDependency");
      if (cycles.length > 0) {
        toast.warning(
          `${cycles.length} dependency cycle(s) detected — check logs`,
        );
        cycles.slice(0, 3).forEach((c) => {
          if (c.kind === "Cycle") console.warn("Cycle:", c.mod_names.join(" → "));
        });
      }
      if (missing.length > 0) {
        toast.warning(`${missing.length} missing dependency reference(s)`);
        missing.slice(0, 3).forEach((m) => {
          if (m.kind === "MissingDependency")
            console.warn(`${m.mod_name} needs "${m.missing}" (not installed)`);
        });
      }
    } catch (e) {
      toast.error(`${e}`);
    } finally {
      setSorting(false);
    }
  }

  async function applySort() {
    if (!preview) return;
    try {
      const applied = await invoke<string[]>("apply_auto_sort");
      toast.success("Load order updated");
      onReorder(applied);
      setPreview(null);
    } catch (e) {
      toast.error(`${e}`);
    }
  }

  async function applyBisect(next: BisectState) {
    const ids = effectiveEnabled(next);
    try {
      await invoke("set_enabled_set", { ids });
      setBisect(next);
      onRefresh();
    } catch (e) {
      toast.error(`Failed to apply bisect: ${e}`);
    }
  }

  async function handleStartBisect() {
    const enabledIds = mods.filter((m) => m.enabled).sort((a, b) => a.load_order - b.load_order).map((m) => m.id);
    if (enabledIds.length < 2) {
      toast.error("Need at least 2 enabled mods to bisect.");
      return;
    }
    const next = startBisect(enabledIds);
    await applyBisect(next);
    toast.success(`Bisect started — ${next.testActive.length} of ${next.candidates.length} enabled. Launch Stellaris.`);
  }

  async function handleMark(result: "bad" | "good") {
    if (!bisect) return;
    const next = markResult(bisect, result);
    await applyBisect(next);
    if (next.finished) {
      toast.success("Culprit found!");
    } else {
      toast.success(`Round ${next.round} — ${next.testActive.length} of ${next.candidates.length} enabled. Re-launch Stellaris.`);
    }
  }

  async function handleCancelBisect() {
    if (!bisect) return;
    try {
      await invoke("set_enabled_set", { ids: bisect.originalEnabled });
      setBisect(null);
      onRefresh();
      toast.success("Bisect cancelled — original playset restored.");
    } catch (e) {
      toast.error(`${e}`);
    }
  }

  async function handleUpdateAll() {
    const targets = Object.values(updates).filter((u) => u.has_update && u.remote_file_id);
    if (targets.length === 0) {
      toast.info("No updates to apply.");
      return;
    }
    setUpdatingAll(true);
    try {
      toast.success(`Updating ${targets.length} mod${targets.length > 1 ? "s" : ""}...`);
      for (const u of targets) await onUpdate(u.remote_file_id);
    } catch (e) {
      toast.error(`${e}`);
    } finally {
      setUpdatingAll(false);
    }
  }

  async function handleFinishBisect() {
    if (!bisect) return;
    try {
      await invoke("set_enabled_set", { ids: bisect.originalEnabled });
      setBisect(null);
      onRefresh();
      toast.success("Original playset restored.");
    } catch (e) {
      toast.error(`${e}`);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 flex items-center gap-3 border-b border-[var(--color-border)] flex-wrap">
        <div className="relative flex-1 max-w-md min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-dim)] pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("mods.searchPlaceholder")}
            className="pl-9"
          />
        </div>

        {updateCount > 0 && (
          <span className="text-[11px] px-2 py-1 rounded-full bg-[var(--color-accent)]/15 text-[var(--color-accent-hover)] border border-[var(--color-accent)]/30">
            {t("mods.updatesAvailable", { count: updateCount })}
          </span>
        )}

        <Button
          variant={filterCount > 0 ? "primary" : "secondary"}
          size="sm"
          onClick={() => setShowFilters((s) => !s)}
          title={t("mods.filterByTooltip")}
        >
          <Filter className="h-3.5 w-3.5" />
          {filterCount > 0 ? t("mods.filtersWithCount", { count: filterCount }) : t("mods.filters")}
        </Button>

        <Button variant="secondary" size="sm" onClick={onCheckUpdates} disabled={checkingUpdates}>
          <RefreshCw className={checkingUpdates ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
          {t("mods.checkUpdates")}
        </Button>

        {updateCount > 0 && (
          <Button variant="primary" size="sm" onClick={handleUpdateAll} disabled={updatingAll}>
            <DownloadCloud className={updatingAll ? "h-3.5 w-3.5 animate-pulse" : "h-3.5 w-3.5"} />
            {updatingAll ? t("mods.updating") : t("mods.updateAll", { count: updateCount })}
          </Button>
        )}

        <Button variant="secondary" size="sm" onClick={autoSort} disabled={sorting}>
          <Wand2 className="h-3.5 w-3.5" />
          {t("mods.autoSort")}
        </Button>

        <Button
          variant="secondary"
          size="sm"
          onClick={handleStartBisect}
          disabled={!!bisect}
          title={t("mods.bisectTip")}
        >
          <Bug className="h-3.5 w-3.5" />
          {t("mods.bisect")}
        </Button>

        <Button variant="secondary" size="sm" onClick={() => onToggleAll(!allOn)} disabled={!!bisect}>
          <ArrowLeftRight className="h-3.5 w-3.5" />
          {allOn ? t("mods.disableAll") : t("mods.enableAll")}
        </Button>
      </div>

      <AnimatePresence initial={false}>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-[var(--color-border)]"
          >
            <div className="px-6 py-3 flex flex-col gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] uppercase tracking-wide text-[var(--color-text-dim)] w-14">
                  {t("mods.statusLabel")}
                </span>
                {(
                  [
                    ["all", t("mods.statusAll")],
                    ["updates", t("mods.statusUpdates")],
                    ["outdated", t("mods.statusOutdated")],
                    ["missing-deps", t("mods.statusMissingDeps")],
                  ] as [StatusFilter, string][]
                ).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setStatusFilter(key)}
                    className={
                      "text-[11px] px-2.5 py-1 rounded-full border transition-colors " +
                      (statusFilter === key
                        ? "bg-[var(--color-accent)]/20 border-[var(--color-accent)] text-[var(--color-accent-hover)]"
                        : "border-[var(--color-border)] text-[var(--color-text-dim)] hover:bg-[var(--color-bg-hover)]")
                    }
                  >
                    {label}
                  </button>
                ))}
                {filterCount > 0 && (
                  <button
                    onClick={clearFilters}
                    className="ml-auto text-[11px] px-2 py-1 text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
                  >
                    {t("common.clearAll")}
                  </button>
                )}
              </div>
              {allTags.length > 0 && (
                <div className="flex items-start gap-2 flex-wrap">
                  <span className="text-[11px] uppercase tracking-wide text-[var(--color-text-dim)] w-14 pt-1">
                    {t("mods.tagsLabel")}
                  </span>
                  <div className="flex-1 flex flex-wrap gap-1.5">
                    {allTags.map(([tag, count]) => {
                      const on = activeTags.has(tag);
                      return (
                        <button
                          key={tag}
                          onClick={() => toggleTag(tag)}
                          className={
                            "text-[11px] px-2 py-0.5 rounded-full border transition-colors " +
                            (on
                              ? "bg-[var(--color-accent)]/20 border-[var(--color-accent)] text-[var(--color-accent-hover)]"
                              : "border-[var(--color-border)] text-[var(--color-text-dim)] hover:bg-[var(--color-bg-hover)]")
                          }
                        >
                          {tag}
                          <span className="ml-1 opacity-60">{count}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {bisect && (
        <BisectBar
          state={bisect}
          mods={mods}
          onMark={handleMark}
          onCancel={handleCancelBisect}
          onFinish={handleFinishBisect}
        />
      )}

      {mods.length === 0 ? (
        <div className="flex-1">
          <EmptyState title={t("mods.emptyTitle")} body={t("mods.emptyBody")} downloadLabel={t("nav.download")} />
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-2 gap-4 p-4 min-h-0">
          <Pane
            title={t("mods.paneAvailable")}
            subtitle={t("mods.paneAvailableSubtitle", { count: available.length })}
            icon={<PackageX className="h-4 w-4 text-[var(--color-text-dim)]" />}
            highlight={overPane === "available" && drag?.from === "active"}
            onDragOver={(e) => onPaneDragOver(e, "available")}
            onDrop={dropOnAvailablePane}
            dropHint={t("mods.dropToDisable")}
            showDropHint={overPane === "available" && drag?.from === "active"}
          >
            <AnimatePresence initial={false}>
              {available.map((mod) => (
                <DraggableRow
                  key={mod.id}
                  mod={mod}
                  pane="available"
                  isDragging={drag?.id === mod.id}
                  isOver={overId === mod.id && drag?.id !== mod.id}
                  hasUpdate={!!updates[mod.id]?.has_update}
                  isOutdated={!isCompatible(mod.supported_version, gameVersion ?? undefined)}
                  onUpdate={onUpdate}
                  onDragStart={(e) => startDrag(e, mod.id, "available")}
                  onDragEnd={endDrag}
                  onDragOver={(e) => onCardDragOver(e, mod.id, "available")}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const p = readPayload(e);
                    endDrag();
                    if (!p || p.from === "available") return;
                    onToggle(p.id, false);
                  }}
                  onToggle={onToggle}
                  onOpenFolder={onOpenFolder}
                  onOpenWorkshop={onOpenWorkshop}
                  onDelete={onDelete}
                />
              ))}
            </AnimatePresence>
            {available.length === 0 && (
              <div className="text-center text-[11px] text-[var(--color-text-dim)] py-8">
                {t("mods.noDisabled")}
              </div>
            )}
          </Pane>

          <Pane
            title={t("mods.paneActive")}
            subtitle={t("mods.paneActiveSubtitle", { count: active.length })}
            icon={<PackageCheck className="h-4 w-4 text-[var(--color-accent-hover)]" />}
            highlight={overPane === "active" && drag?.from === "available"}
            onDragOver={(e) => onPaneDragOver(e, "active")}
            onDrop={dropOnActivePane}
            dropHint={t("mods.dropToEnable")}
            showDropHint={overPane === "active" && drag?.from === "available" && !overId}
            numbered
          >
            <AnimatePresence initial={false}>
              {active.map((mod, i) => (
                <DraggableRow
                  key={mod.id}
                  mod={mod}
                  pane="active"
                  index={i + 1}
                  isDragging={drag?.id === mod.id}
                  isOver={overId === mod.id && drag?.id !== mod.id}
                  hasUpdate={!!updates[mod.id]?.has_update}
                  isOutdated={!isCompatible(mod.supported_version, gameVersion ?? undefined)}
                  onUpdate={onUpdate}
                  onDragStart={(e) => startDrag(e, mod.id, "active")}
                  onDragEnd={endDrag}
                  onDragOver={(e) => onCardDragOver(e, mod.id, "active")}
                  onDrop={(e) => dropOnActiveCard(e, mod.id)}
                  onToggle={onToggle}
                  onOpenFolder={onOpenFolder}
                  onOpenWorkshop={onOpenWorkshop}
                  onDelete={onDelete}
                />
              ))}
            </AnimatePresence>
            {active.length === 0 && (
              <div className="text-center text-[11px] text-[var(--color-text-dim)] py-8">
                {t("mods.dragHereToEnable")}
              </div>
            )}
          </Pane>
        </div>
      )}

      <AnimatePresence>
        {preview && (
          <SortPreviewDialog
            mods={mods}
            current={preview.current}
            suggested={preview.suggested}
            onApply={applySort}
            onCancel={() => setPreview(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function Pane({
  title,
  subtitle,
  icon,
  children,
  highlight,
  onDragOver,
  onDrop,
  showDropHint,
  dropHint,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  highlight?: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  showDropHint?: boolean;
  dropHint?: string;
  numbered?: boolean;
}) {
  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={
        "flex flex-col min-h-0 rounded-[var(--radius-lg)] border transition-colors " +
        (highlight
          ? "border-[var(--color-accent)] bg-[var(--color-accent)]/5"
          : "border-[var(--color-border)] bg-[var(--color-bg-card)]/40")
      }
    >
      <div className="px-4 py-3 flex items-center gap-2 border-b border-[var(--color-border)]">
        {icon}
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-[11px] text-[var(--color-text-dim)] ml-auto">{subtitle}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5 relative">
        {children}
        {showDropHint && (
          <div className="absolute inset-2 pointer-events-none rounded-[var(--radius-md)] border-2 border-dashed border-[var(--color-accent)] bg-[var(--color-accent)]/5 grid place-items-center">
            <span className="text-xs font-medium text-[var(--color-accent-hover)]">{dropHint}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function DraggableRow({
  mod,
  index,
  isDragging,
  isOver,
  hasUpdate,
  isOutdated,
  onUpdate,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onToggle,
  onOpenFolder,
  onOpenWorkshop,
  onDelete,
}: {
  mod: ModInfo;
  pane: Pane;
  index?: number;
  isDragging: boolean;
  isOver: boolean;
  hasUpdate: boolean;
  isOutdated: boolean;
  onUpdate: (remoteFileId: string) => Promise<void>;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onOpenFolder: (path: string) => void;
  onOpenWorkshop: (remoteId: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={
        "relative flex items-stretch " +
        (isDragging ? "opacity-40 " : "") +
        (isOver ? "ring-2 ring-[var(--color-accent)] rounded-[var(--radius-lg)] " : "")
      }
    >
      {index !== undefined && (
        <div className="w-8 shrink-0 grid place-items-center text-[10px] font-mono text-[var(--color-text-dim)]">
          {index}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <ModCard
          mod={mod}
          onToggle={onToggle}
          onOpenFolder={onOpenFolder}
          onOpenWorkshop={onOpenWorkshop}
          onDelete={onDelete}
        />
        {isOutdated && (
          <OutdatedBadge version={mod.supported_version} />
        )}
        {hasUpdate && mod.remote_file_id && (
          <UpdateBadge
            onClick={(e) => {
              e.stopPropagation();
              onUpdate(mod.remote_file_id!);
            }}
          />
        )}
      </div>
    </div>
  );
}

function SortPreviewDialog({
  mods,
  current,
  suggested,
  onApply,
  onCancel,
}: {
  mods: ModInfo[];
  current: string[];
  suggested: string[];
  onApply: () => void;
  onCancel: () => void;
}) {
  const modMap = new Map(mods.map((m) => [m.id, m]));
  const curPos = new Map(current.map((id, i) => [id, i]));
  let movers = 0;
  const deltaMap = new Map<string, number>();
  suggested.forEach((id, i) => {
    const old = curPos.get(id);
    const d = old === undefined ? 2147483647 : old - i;
    deltaMap.set(id, d);
    if (d !== 0) movers++;
  });
  const ids = suggested;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-6"
      onClick={onCancel}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[80vh] flex flex-col rounded-[var(--radius-xl)] bg-[var(--color-bg-elevated)] border border-[var(--color-border)] shadow-2xl"
      >
        <div className="px-6 py-4 flex items-center gap-3 border-b border-[var(--color-border)]">
          <div className="h-9 w-9 rounded-[var(--radius-md)] bg-gradient-to-br from-[#7c5cff] to-[#ec4899] grid place-items-center">
            <Wand2 className="h-4 w-4 text-white" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold">Auto-sort preview</div>
            <div className="text-[11px] text-[var(--color-text-dim)]">
              {movers} of {ids.length} mods will move
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onCancel}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-1">
          {ids.map((id, i) => {
            const m = modMap.get(id);
            if (!m) return null;
            const delta = deltaMap.get(id) ?? 0;
            return (
              <div
                key={id}
                className="flex items-center gap-3 px-3 py-2 rounded-[var(--radius-sm)] hover:bg-[var(--color-bg-hover)]"
              >
                <span className="w-6 text-[11px] text-[var(--color-text-dim)] font-mono">{i + 1}</span>
                <span className="flex-1 text-[12px] truncate">{m.name}</span>
                {delta !== 0 && delta !== 2147483647 && (
                  <span
                    className={
                      "text-[10px] font-mono flex items-center gap-0.5 " +
                      (delta > 0 ? "text-[var(--color-success)]" : "text-[var(--color-warning)]")
                    }
                  >
                    {delta > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                    {Math.abs(delta)}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className="px-6 py-4 border-t border-[var(--color-border)] flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onApply}>
            Apply sort
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function OutdatedBadge({ version }: { version?: string }) {
  const { t } = useLang();
  return (
    <span
      title={t("mods.outdatedTooltip", { version: version ?? "?" })}
      className="absolute top-2 right-28 text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-warning)]/15 text-[var(--color-warning)] border border-[var(--color-warning)]/30"
    >
      {t("mods.outdatedBadge")}
    </span>
  );
}

function UpdateBadge({ onClick }: { onClick: (e: React.MouseEvent) => void }) {
  const { t } = useLang();
  return (
    <button
      onClick={onClick}
      title={t("mods.updateTooltip")}
      className="absolute top-2 right-16 flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-accent)]/15 text-[var(--color-accent-hover)] border border-[var(--color-accent)]/30 hover:bg-[var(--color-accent)]/25 transition-colors"
    >
      <DownloadCloud className="h-2.5 w-2.5" />
      {t("mods.updateBadge")}
    </button>
  );
}

function EmptyState({ title, body, downloadLabel }: { title: string; body: string; downloadLabel: string }) {
  // Highlight the tab name (English or Vietnamese) wherever it appears in the body.
  const parts = body.split(downloadLabel);
  return (
    <div className="h-full grid place-items-center">
      <div className="text-center max-w-sm">
        <div className="text-[13px] font-medium text-[var(--color-text)] mb-1">{title}</div>
        <div className="text-xs text-[var(--color-text-muted)] leading-relaxed">
          {parts.map((p, i) => (
            <span key={i}>
              {p}
              {i < parts.length - 1 && (
                <span className="text-[var(--color-accent-hover)]">{downloadLabel}</span>
              )}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
