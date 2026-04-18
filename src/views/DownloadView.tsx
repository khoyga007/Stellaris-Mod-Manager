import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download,
  Link2,
  Loader2,
  CheckCircle2,
  XCircle,
  ExternalLink,
  FileArchive,
  ChevronDown,
  ClipboardCheck,
  X,
  RotateCw,
  Trash2,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { extractWorkshopId, extractWorkshopIds } from "@/lib/utils";
import type { DownloadProgress } from "@/types";
import { useLang } from "@/lib/i18n";

interface WorkshopMeta {
  title: string;
  description?: string;
  preview_url?: string;
  time_updated?: number;
  tags: string[];
  file_size?: number;
}

interface DownloadViewProps {
  downloads: DownloadProgress[];
  onDownload: (workshopId: string) => Promise<void>;
  onDownloadBatch?: (ids: string[]) => Promise<void>;
  onRefreshMods: () => void;
  installedRemoteIds: Set<string>;
  onClearDownloads?: (ids: string[]) => void;
}

export function DownloadView({ downloads, onDownload, onDownloadBatch, onRefreshMods, installedRemoteIds, onClearDownloads }: DownloadViewProps) {
  const { t } = useLang();
  const [input, setInput] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [asCollection, setAsCollection] = useState(false);
  const [suggestion, setSuggestion] = useState<string[] | null>(null);
  const dismissedRef = useRef<Set<string>>(new Set());
  const [metas, setMetas] = useState<Record<string, WorkshopMeta>>({});
  const inflightRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const need = Array.from(new Set(downloads.map((d) => d.workshop_id))).filter(
      (id) => !metas[id] && !inflightRef.current.has(id)
    );
    if (need.length === 0) return;
    need.forEach((id) => inflightRef.current.add(id));
    invoke<Array<[string, WorkshopMeta]>>("fetch_workshop_metas", { ids: need })
      .then((rows) => {
        setMetas((prev) => {
          const next = { ...prev };
          for (const [id, m] of rows) next[id] = m;
          return next;
        });
      })
      .catch(() => {
        // network down or rate-limited — just leave raw IDs
      })
      .finally(() => {
        need.forEach((id) => inflightRef.current.delete(id));
      });
  }, [downloads, metas]);

  const ids = extractWorkshopIds(input);
  const singleId = ids.length === 1 ? ids[0] : extractWorkshopId(input);
  const collectionId = asCollection ? singleId : null;

  useEffect(() => {
    async function scanClipboard() {
      try {
        const text = await navigator.clipboard.readText();
        if (!text) return;
        const found = extractWorkshopIds(text);
        if (found.length === 0) return;
        const existing = new Set(extractWorkshopIds(input));
        const fresh = found.filter((id) => !existing.has(id) && !dismissedRef.current.has(id));
        if (fresh.length > 0) setSuggestion(fresh);
      } catch {
        // clipboard permission denied or empty — ignore
      }
    }
    scanClipboard();
    window.addEventListener("focus", scanClipboard);
    return () => window.removeEventListener("focus", scanClipboard);
  }, [input]);

  function acceptSuggestion() {
    if (!suggestion) return;
    setInput((prev) => {
      const existing = new Set(extractWorkshopIds(prev));
      const toAdd = suggestion.filter((id) => !existing.has(id));
      if (toAdd.length === 0) return prev;
      const sep = prev.trim().length > 0 ? "\n" : "";
      return prev + sep + toAdd.join("\n");
    });
    setSuggestion(null);
  }

  function dismissSuggestion() {
    if (suggestion) suggestion.forEach((id) => dismissedRef.current.add(id));
    setSuggestion(null);
  }

  function planQueue(raw: string[]): { fresh: string[]; skipped: number; dup: number } {
    const seen = new Set<string>();
    const unique: string[] = [];
    let dup = 0;
    for (const id of raw) {
      if (seen.has(id)) {
        dup++;
        continue;
      }
      seen.add(id);
      unique.push(id);
    }
    const fresh = unique.filter((id) => !installedRemoteIds.has(id));
    return { fresh, skipped: unique.length - fresh.length, dup };
  }

  async function runQueue(list: string[], sourceLabel: string) {
    const { fresh, skipped, dup } = planQueue(list);
    const parts: string[] = [];
    if (dup > 0) parts.push(t("download.skipDuplicates", { count: dup, plural: dup > 1 ? "s" : "" }));
    if (skipped > 0) parts.push(t("download.skipInstalled", { count: skipped }));
    const suffix = parts.length > 0 ? ` (${parts.join(", ")})` : "";
    if (fresh.length === 0) {
      toast.info(t("download.nothingToDo", { count: list.length, label: sourceLabel }));
      return;
    }
    if (fresh.length >= 2 && onDownloadBatch) {
      toast.success(t("download.queueBatch", { count: fresh.length, label: sourceLabel, suffix }));
      await onDownloadBatch(fresh);
    } else {
      toast.success(t("download.queueNormal", { count: fresh.length, label: sourceLabel, suffix }));
      for (const id of fresh) await onDownload(id);
    }
  }

  async function submit() {
    setErr(null);
    if (collectionId) {
      setBusy(true);
      try {
        const list = await invoke<string[]>("fetch_collection", { collectionId });
        if (list.length === 0) {
          setErr("Collection is empty or could not be fetched.");
          return;
        }
        await runQueue(list, "mods from collection");
        setInput("");
      } catch (e) {
        setErr(String(e));
      } finally {
        setBusy(false);
      }
      return;
    }
    if (ids.length === 0) {
      setErr("Paste one or more Workshop URLs / IDs (one per line).");
      return;
    }
    setBusy(true);
    try {
      await runQueue(ids, ids.length === 1 ? "mod" : "mods");
      setInput("");
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function openInBrowser() {
    const id = singleId;
    if (!id) {
      setErr("Paste a Workshop URL or ID first.");
      return;
    }
    try {
      await invoke("open_workshop_downloader", { workshopId: id });
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function importZip() {
    const selected = await openDialog({
      multiple: false,
      filters: [{ name: "Zip archive", extensions: ["zip"] }],
    });
    if (typeof selected !== "string") return;
    const id = singleId ?? undefined;
    try {
      toast.loading("Importing...", { id: "import" });
      await invoke("install_from_zip", { zipPath: selected, workshopId: id });
      toast.success("Mod imported", { id: "import" });
      onRefreshMods();
      setInput("");
    } catch (e) {
      toast.error(`Import failed: ${e}`, { id: "import" });
    }
  }

  const buttonLabel = collectionId
    ? t("download.installCollection")
    : ids.length > 1
    ? t("download.installN", { count: ids.length })
    : t("download.autoInstall");

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-8 py-8 max-w-3xl w-full mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-gradient-to-br from-[var(--color-bg-card)] to-[var(--color-bg-elevated)] p-8"
        >
          <div className="h-12 w-12 rounded-[var(--radius-lg)] bg-gradient-to-br from-[#7c5cff] to-[#ec4899] grid place-items-center mb-4 shadow-lg shadow-[var(--color-accent-glow)]">
            <Download className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-1 gradient-text font-display">
            {t("download.heroTitle")}
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mb-6 leading-relaxed">
            {t("download.heroBody")}
          </p>

          <AnimatePresence>
            {suggestion && suggestion.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="mb-3 flex items-center gap-3 p-3 rounded-[var(--radius-md)] border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10"
              >
                <ClipboardCheck className="h-4 w-4 text-[var(--color-accent-hover)] shrink-0" />
                <div className="flex-1 text-[12px] text-[var(--color-text)]">
                  {t("download.clipboardDetected", {
                    count: suggestion.length,
                    plural: suggestion.length === 1 ? t("download.clipboardLinkOne") : t("download.clipboardLinkMany"),
                  })}
                  <span className="ml-2 text-[var(--color-text-dim)] font-mono text-[11px]">
                    {suggestion.slice(0, 3).join(", ")}
                    {suggestion.length > 3 ? ` +${suggestion.length - 3}` : ""}
                  </span>
                </div>
                <Button variant="primary" size="sm" onClick={acceptSuggestion}>
                  {t("download.add")}
                </Button>
                <Button variant="ghost" size="icon" onClick={dismissSuggestion}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex flex-col gap-2">
            <div className="relative">
              <Link2 className="absolute left-3.5 top-3 h-4 w-4 text-[var(--color-text-dim)]" />
              <textarea
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  setErr(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !busy) submit();
                }}
                placeholder={"https://steamcommunity.com/sharedfiles/filedetails/?id=...\n2345678901\nhttps://steamcommunity.com/sharedfiles/filedetails/?id=..."}
                rows={Math.min(6, Math.max(3, input.split("\n").length))}
                className="w-full rounded-[var(--radius-md)] bg-[var(--color-bg-card)] border border-[var(--color-border)] pl-10 pr-3 py-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] font-mono resize-y transition-all focus:outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20"
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="text-[11px] text-[var(--color-text-dim)]">
                {ids.length > 0 ? (
                  <>
                    {t("download.detected", {
                      count: ids.length,
                      plural: ids.length === 1 ? t("download.modOne") : t("download.modMany"),
                    })}
                    <span className="ml-2 opacity-60">{t("download.ctrlEnter")}</span>
                  </>
                ) : (
                  <span className="opacity-60">{t("download.ctrlEnter")}</span>
                )}
              </div>
              <Button variant="primary" size="lg" onClick={submit} disabled={busy || ids.length === 0}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {buttonLabel}
              </Button>
            </div>
          </div>

          <label className="mt-3 inline-flex items-center gap-2 text-[11px] text-[var(--color-text-muted)] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={asCollection}
              onChange={(e) => setAsCollection(e.target.checked)}
              disabled={ids.length > 1}
              className="accent-[var(--color-accent)] disabled:opacity-40"
            />
            {t("download.treatAsCollection")}
            {ids.length > 1 && (
              <span className="text-[var(--color-text-dim)]">{t("download.disabledForBulk")}</span>
            )}
          </label>

          <AnimatePresence>
            {err && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-3 text-xs text-[var(--color-danger)]"
              >
                {err}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="my-6 flex items-center gap-3">
            <div className="flex-1 h-px bg-[var(--color-border)]" />
            <div className="text-[10px] uppercase tracking-widest text-[var(--color-text-dim)]">
              {t("download.orManual")}
            </div>
            <div className="flex-1 h-px bg-[var(--color-border)]" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={openInBrowser}
              disabled={!singleId}
              className="group flex items-start gap-3 p-4 rounded-[var(--radius-lg)] bg-[var(--color-bg-elevated)] border border-[var(--color-border)] hover:border-[var(--color-accent)] transition-colors duration-200 disabled:opacity-40 disabled:pointer-events-none text-left"
            >
              <div className="h-9 w-9 shrink-0 rounded-[var(--radius-md)] bg-[var(--color-bg-hover)] grid place-items-center group-hover:bg-[var(--color-accent)]/15 transition-colors">
                <ExternalLink className="h-4 w-4 text-[var(--color-accent-hover)]" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold mb-0.5">{t("download.step1Title")}</div>
                <div className="text-[11px] text-[var(--color-text-dim)] leading-relaxed">
                  {t("download.step1Body")}
                </div>
              </div>
            </button>

            <button
              onClick={importZip}
              className="group flex items-start gap-3 p-4 rounded-[var(--radius-lg)] bg-[var(--color-bg-elevated)] border border-[var(--color-border)] hover:border-[var(--color-accent)] transition-colors duration-200 text-left"
            >
              <div className="h-9 w-9 shrink-0 rounded-[var(--radius-md)] bg-[var(--color-bg-hover)] grid place-items-center group-hover:bg-[var(--color-accent)]/15 transition-colors">
                <FileArchive className="h-4 w-4 text-[var(--color-accent-hover)]" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold mb-0.5">{t("download.step2Title")}</div>
                <div className="text-[11px] text-[var(--color-text-dim)] leading-relaxed">
                  {t("download.step2Body")}
                </div>
              </div>
            </button>
          </div>
        </motion.div>

        {downloads.length > 0 && (
          <div className="mt-8">
            <div className="flex items-center gap-2 mb-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
                {t("download.activity")}
              </div>
              <div className="ml-auto flex items-center gap-2">
                {downloads.some((d) => d.status === "error") && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={async () => {
                      const failed = downloads.filter((d) => d.status === "error");
                      toast.success(`Retrying ${failed.length} failed download${failed.length > 1 ? "s" : ""}`);
                      for (const d of failed) await onDownload(d.workshop_id);
                    }}
                  >
                    <RotateCw className="h-3.5 w-3.5" />
                    {t("download.retryFailed")}
                  </Button>
                )}
                {downloads.some((d) => d.status === "done" || d.status === "error") && onClearDownloads && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const done = downloads
                        .filter((d) => d.status === "done" || d.status === "error")
                        .map((d) => d.workshop_id);
                      onClearDownloads(done);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t("common.clear")}
                  </Button>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <AnimatePresence initial={false}>
                {downloads
                  .slice()
                  .reverse()
                  .map((d) => (
                    <DownloadItem
                      key={d.workshop_id + d.status}
                      d={d}
                      meta={metas[d.workshop_id]}
                      onRetry={d.status === "error" ? () => onDownload(d.workshop_id) : undefined}
                    />
                  ))}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DownloadItem({
  d,
  meta,
  onRetry,
}: {
  d: DownloadProgress;
  meta?: WorkshopMeta;
  onRetry?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [imgOk, setImgOk] = useState(true);
  const isActive = d.status !== "done" && d.status !== "error";
  const isError = d.status === "error";
  const longMsg = d.message.length > 90;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="rounded-[var(--radius-lg)] bg-[var(--color-bg-card)] border border-[var(--color-border)] p-4"
    >
      <div className="flex items-center gap-3">
        {meta?.preview_url && imgOk ? (
          <img
            src={meta.preview_url}
            alt=""
            onError={() => setImgOk(false)}
            className="h-10 w-10 shrink-0 rounded-[var(--radius-sm)] object-cover bg-[var(--color-bg-hover)]"
          />
        ) : (
          <div className="h-10 w-10 shrink-0 rounded-[var(--radius-sm)] bg-[var(--color-bg-hover)] grid place-items-center">
            {isActive ? (
              <Loader2 className="h-4 w-4 text-[var(--color-accent-hover)] animate-spin" />
            ) : isError ? (
              <XCircle className="h-4 w-4 text-[var(--color-danger)]" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-[var(--color-success)]" />
            )}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            {meta?.title ? (
              <span className="text-xs font-semibold text-[var(--color-text)] truncate">{meta.title}</span>
            ) : (
              <span className="text-xs font-mono text-[var(--color-text)]">#{d.workshop_id}</span>
            )}
            <span
              className={
                "text-[10px] uppercase tracking-wider shrink-0 " +
                (isError
                  ? "text-[var(--color-danger)]"
                  : isActive
                  ? "text-[var(--color-accent-hover)]"
                  : "text-[var(--color-success)]")
              }
            >
              {d.status}
            </span>
            {meta?.title && (
              <span className="text-[10px] font-mono text-[var(--color-text-dim)] shrink-0">#{d.workshop_id}</span>
            )}
          </div>
          <div className={"text-[11px] text-[var(--color-text-muted)] " + (expanded ? "whitespace-pre-wrap break-words" : "truncate")}>
            {d.message}
          </div>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="shrink-0 text-[var(--color-text-dim)] hover:text-[var(--color-accent-hover)] transition-colors"
            title="Retry download"
          >
            <RotateCw className="h-3.5 w-3.5" />
          </button>
        )}
        {longMsg && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 text-[var(--color-text-dim)] hover:text-[var(--color-text)] transition-colors"
            title={expanded ? "Collapse" : "Show details"}
          >
            <ChevronDown className={"h-3.5 w-3.5 transition-transform " + (expanded ? "rotate-180" : "")} />
          </button>
        )}
      </div>
      {isActive && (
        <div className="mt-3 h-1 rounded-full bg-[var(--color-bg-hover)] overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-[#7c5cff] to-[#ec4899]"
            animate={{ width: `${d.progress}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>
      )}
    </motion.div>
  );
}
