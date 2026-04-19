import { useState } from "react";
import { motion } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { save as saveDialog, open as openDialog } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import {
  AlertTriangle,
  RefreshCw,
  ChevronRight,
  FileCode2,
  Wrench,
  Layers,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import type {
  ConflictReport,
  ConflictPair,
  DeepConflictReport,
  FileConflict,
  ConflictKind,
  PatchGenReport,
} from "@/types";

type Mode = "file" | "deep";

// file -> ident -> mod_id
type Resolutions = Record<string, Record<string, string>>;

const COLLECTION_NAME = "Current";

export function ConflictsView() {
  const [mode, setMode] = useState<Mode>("file");
  const [report, setReport] = useState<ConflictReport | null>(null);
  const [deep, setDeep] = useState<DeepConflictReport | null>(null);
  const [patch, setPatch] = useState<PatchGenReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [genLoading, setGenLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [resolutions, setResolutions] = useState<Resolutions>({});

  async function refreshResolutions() {
    try {
      const r = await invoke<Resolutions>("get_resolutions", {
        collectionName: COLLECTION_NAME,
      });
      setResolutions(r || {});
    } catch {
      /* ignore */
    }
  }

  async function bulkPick(file: string, idents: string[], modId: string | null) {
    try {
      const picks: Record<string, string | null> = {};
      for (const i of idents) picks[i] = modId;
      await invoke("set_resolutions_bulk", {
        collectionName: COLLECTION_NAME,
        file,
        picks,
      });
      await refreshResolutions();
      toast.success(modId ? `Picked ${idents.length} keys` : `Cleared ${idents.length} keys`);
    } catch (e) {
      toast.error(`${e}`);
    }
  }

  async function pickResolution(file: string, ident: string, modId: string | null) {
    try {
      await invoke("set_resolution", {
        collectionName: COLLECTION_NAME,
        file,
        ident,
        modId,
      });
      setResolutions((prev) => {
        const next = { ...prev };
        const f = { ...(next[file] || {}) };
        if (modId) f[ident] = modId;
        else delete f[ident];
        if (Object.keys(f).length === 0) delete next[file];
        else next[file] = f;
        return next;
      });
    } catch (e) {
      toast.error(`${e}`);
    }
  }

  async function analyze() {
    setLoading(true);
    setPatch(null);
    try {
      if (mode === "file") {
        const r = await invoke<ConflictReport>("analyze_conflicts");
        setReport(r);
        setDeep(null);
        if (r.pairs.length === 0) toast.success("No conflicts 🎉");
      } else {
        const r = await invoke<DeepConflictReport>("analyze_conflicts_deep");
        setDeep(r);
        setReport(null);
        await refreshResolutions();
        if (r.total_files === 0) toast.success("No script-level conflicts 🎉");
      }
    } catch (e) {
      toast.error(`${e}`);
    } finally {
      setLoading(false);
    }
  }

  async function exportResolutions() {
    try {
      const path = await saveDialog({
        defaultPath: `stellar_resolutions_${COLLECTION_NAME}.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path) return;
      await invoke("export_resolutions", { collectionName: COLLECTION_NAME, path });
      toast.success(`Exported to ${path}`);
    } catch (e) {
      toast.error(`${e}`);
    }
  }

  async function importResolutions() {
    try {
      const path = await openDialog({
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path || typeof path !== "string") return;
      const count = await invoke<number>("import_resolutions", {
        collectionName: COLLECTION_NAME,
        path,
      });
      await refreshResolutions();
      toast.success(`Imported ${count} picks`);
    } catch (e) {
      toast.error(`${e}`);
    }
  }

  async function generatePatch() {
    setGenLoading(true);
    try {
      const r = await invoke<PatchGenReport>("generate_patch_mod", {
        collectionName: COLLECTION_NAME,
      });
      setPatch(r);
      toast.success(
        `Patch "${r.patch_id}" wrote ${r.files_written.length} file(s).`,
      );
    } catch (e) {
      toast.error(`${e}`);
    } finally {
      setGenLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-6 py-5 max-w-4xl w-full mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-[var(--radius-md)] bg-gradient-to-br from-[var(--color-warning)] to-[var(--color-danger)] grid place-items-center shadow-lg">
            <AlertTriangle className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold tracking-tight font-display">Conflict detector</h1>
            <p className="text-xs text-[var(--color-text-muted)]">
              Scans enabled mods for files that override the same vanilla path. Later-loaded mod wins.
            </p>
          </div>
          <Button variant="primary" onClick={analyze} disabled={loading}>
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            {loading ? "Scanning..." : "Scan now"}
          </Button>
        </div>

        <div className="mb-4 flex items-center gap-2">
          <button
            onClick={() => setMode("file")}
            className={
              "px-3 py-1.5 text-xs rounded-[var(--radius-md)] border transition-colors " +
              (mode === "file"
                ? "bg-[var(--color-accent)]/15 border-[var(--color-accent)] text-[var(--color-text)]"
                : "bg-[var(--color-bg-card)] border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)]")
            }
          >
            <Layers className="inline h-3 w-3 mr-1" />
            File-level (fast)
          </button>
          <button
            onClick={() => setMode("deep")}
            className={
              "px-3 py-1.5 text-xs rounded-[var(--radius-md)] border transition-colors " +
              (mode === "deep"
                ? "bg-[var(--color-accent)]/15 border-[var(--color-accent)] text-[var(--color-text)]"
                : "bg-[var(--color-bg-card)] border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)]")
            }
          >
            <Sparkles className="inline h-3 w-3 mr-1" />
            Deep (parse script)
          </button>
          <div className="flex-1" />
          {deep && (
            <>
              <button
                onClick={importResolutions}
                className="text-[11px] px-2 py-1 rounded border border-[var(--color-border)] hover:bg-[var(--color-bg-hover)] text-[var(--color-text-muted)]"
              >
                Import picks
              </button>
              <button
                onClick={exportResolutions}
                className="text-[11px] px-2 py-1 rounded border border-[var(--color-border)] hover:bg-[var(--color-bg-hover)] text-[var(--color-text-muted)]"
              >
                Export picks
              </button>
            </>
          )}
          {deep && deep.total_files > 0 && (
            <Button variant="primary" onClick={generatePatch} disabled={genLoading}>
              <Wrench className={genLoading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              {genLoading ? "Generating..." : "Generate patch mod"}
            </Button>
          )}
        </div>

        {!report && !deep && !loading && (
          <div className="text-center py-16 text-[var(--color-text-dim)]">
            <AlertTriangle className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <div className="text-xs">Click "Scan now" to analyze your enabled mod set.</div>
          </div>
        )}

        {patch && <PatchSummary report={patch} />}

        {deep && (
          <DeepReportView
            report={deep}
            resolutions={resolutions}
            onPick={pickResolution}
            onBulkPick={bulkPick}
          />
        )}

        {report && (
          <>
            <div className="mb-4 flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
              <span>
                <span className="text-[var(--color-text)] font-semibold">{report.pairs.length}</span> conflicting pairs
              </span>
              <span>•</span>
              <span>
                <span className="text-[var(--color-text)] font-semibold">{report.total_conflicts}</span> overridden files
              </span>
            </div>

            <div className="flex flex-col gap-2">
              {report.pairs.map((p) => (
                <ConflictRow
                  key={`${p.mod_a}-${p.mod_b}`}
                  pair={p}
                  expanded={expanded === `${p.mod_a}-${p.mod_b}`}
                  onToggle={() =>
                    setExpanded(expanded === `${p.mod_a}-${p.mod_b}` ? null : `${p.mod_a}-${p.mod_b}`)
                  }
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ConflictRow({
  pair,
  expanded,
  onToggle,
}: {
  pair: ConflictPair;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <motion.div
      layout
      className="rounded-[var(--radius-lg)] bg-[var(--color-bg-card)] border border-[var(--color-border)] overflow-hidden"
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-[var(--color-bg-hover)] transition-colors"
      >
        <ChevronRight
          className={
            "h-4 w-4 text-[var(--color-text-dim)] transition-transform " +
            (expanded ? "rotate-90" : "")
          }
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-[13px] font-semibold">
            <span className="truncate">{pair.mod_a_name}</span>
            <span className="text-[var(--color-text-dim)]">⇆</span>
            <span className="truncate">{pair.mod_b_name}</span>
          </div>
        </div>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--color-warning)]/15 text-[var(--color-warning)]">
          {pair.file_count} {pair.file_count === 1 ? "file" : "files"}
        </span>
      </button>

      {expanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          className="border-t border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 font-mono text-[11px]"
        >
          {pair.files.slice(0, 50).map((f) => (
            <div key={f} className="flex items-center gap-2 py-0.5 text-[var(--color-text-muted)]">
              <FileCode2 className="h-3 w-3 text-[var(--color-text-dim)]" />
              <span className="truncate">{f}</span>
            </div>
          ))}
          {pair.files.length > 50 && (
            <div className="text-[var(--color-text-dim)] mt-1">
              +{pair.files.length - 50} more files...
            </div>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}

const KIND_COLOR: Record<ConflictKind, string> = {
  FullOverride: "text-[var(--color-danger)] bg-[var(--color-danger)]/15",
  Mixed: "text-[var(--color-warning)] bg-[var(--color-warning)]/15",
  Partial: "text-[var(--color-success)] bg-[var(--color-success)]/15",
  Unknown: "text-[var(--color-text-dim)] bg-[var(--color-bg-hover)]",
};

const KIND_LABEL: Record<ConflictKind, string> = {
  FullOverride: "full override",
  Mixed: "mixed",
  Partial: "mergeable",
  Unknown: "parse failed",
};

function DeepReportView({
  report,
  resolutions,
  onPick,
  onBulkPick,
}: {
  report: DeepConflictReport;
  resolutions: Resolutions;
  onPick: (file: string, ident: string, modId: string | null) => void;
  onBulkPick: (file: string, idents: string[], modId: string | null) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
        <span className="text-[var(--color-text-muted)]">
          <span className="text-[var(--color-text)] font-semibold">{report.total_files}</span> files
        </span>
        <Badge color="danger">{report.full_override_count} full</Badge>
        <Badge color="warning">{report.mixed_count} mixed</Badge>
        <Badge color="success">{report.partial_count} mergeable</Badge>
        {report.unknown_count > 0 && (
          <Badge color="muted">{report.unknown_count} unparsed</Badge>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {report.files.map((fc) => (
          <DeepRow
            key={fc.file}
            fc={fc}
            expanded={open === fc.file}
            onToggle={() => setOpen(open === fc.file ? null : fc.file)}
            fileResolutions={resolutions[fc.file] || {}}
            onPick={(ident, modId) => onPick(fc.file, ident, modId)}
            onBulkPick={(idents, modId) => onBulkPick(fc.file, idents, modId)}
          />
        ))}
      </div>
    </>
  );
}

function Badge({
  color,
  children,
}: {
  color: "danger" | "warning" | "success" | "muted";
  children: React.ReactNode;
}) {
  const cls =
    color === "danger"
      ? "text-[var(--color-danger)] bg-[var(--color-danger)]/15"
      : color === "warning"
        ? "text-[var(--color-warning)] bg-[var(--color-warning)]/15"
        : color === "success"
          ? "text-[var(--color-success)] bg-[var(--color-success)]/15"
          : "text-[var(--color-text-dim)] bg-[var(--color-bg-hover)]";
  return (
    <span className={"px-2 py-0.5 rounded-full text-[11px] " + cls}>{children}</span>
  );
}

function DeepRow({
  fc,
  expanded,
  onToggle,
  fileResolutions,
  onPick,
  onBulkPick,
}: {
  fc: FileConflict;
  expanded: boolean;
  onToggle: () => void;
  fileResolutions: Record<string, string>;
  onPick: (ident: string, modId: string | null) => void;
  onBulkPick: (idents: string[], modId: string | null) => void;
}) {
  const defaultWinner = fc.mods[fc.mods.length - 1];
  const overrideCount = fc.shared_keys.filter(
    (k) => fileResolutions[k.split("::").pop() || k],
  ).length;
  // mod_id -> ident -> body
  const [previews, setPreviews] = useState<Record<string, Record<string, string>>>({});
  const [previewOpen, setPreviewOpen] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  async function togglePreview(ident: string) {
    if (previewOpen === ident) {
      setPreviewOpen(null);
      return;
    }
    setPreviewOpen(ident);
    if (Object.keys(previews).length > 0) return;
    setPreviewLoading(true);
    try {
      const results = await Promise.all(
        fc.mods.map(async (m) => {
          const entries = await invoke<Record<string, string>>("get_file_entries", {
            file: fc.file,
            modId: m.mod_id,
          });
          return [m.mod_id, entries] as const;
        }),
      );
      setPreviews(Object.fromEntries(results));
    } catch (e) {
      toast.error(`${e}`);
    } finally {
      setPreviewLoading(false);
    }
  }

  return (
    <motion.div
      layout
      className="rounded-[var(--radius-lg)] bg-[var(--color-bg-card)] border border-[var(--color-border)] overflow-hidden"
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-[var(--color-bg-hover)] transition-colors"
      >
        <ChevronRight
          className={
            "h-4 w-4 text-[var(--color-text-dim)] transition-transform " +
            (expanded ? "rotate-90" : "")
          }
        />
        <div className="flex-1 min-w-0">
          <div className="font-mono text-[12px] truncate">{fc.file}</div>
          <div className="text-[11px] text-[var(--color-text-dim)] mt-0.5">
            {fc.mods.length} mods · {fc.shared_keys.length} shared keys · {fc.unique_keys_total} unique
            {overrideCount > 0 && (
              <span className="text-[var(--color-accent)]"> · {overrideCount} picked</span>
            )}
          </div>
        </div>
        <span className={"text-[11px] px-2 py-0.5 rounded-full " + KIND_COLOR[fc.kind]}>
          {KIND_LABEL[fc.kind]}
        </span>
      </button>

      {expanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          className="border-t border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 text-[11px]"
        >
          {fc.shared_keys.length > 0 && defaultWinner && (
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-[var(--color-warning)] font-semibold">
                  Shared keys ({fc.shared_keys.length}) — pick winner per key:
                </span>
                <span className="text-[var(--color-text-dim)]">bulk:</span>
                {fc.mods.map((m) => (
                  <button
                    key={m.mod_id}
                    onClick={() =>
                      onBulkPick(
                        fc.shared_keys.map((k) => k.split("::").pop() || k),
                        m.mod_id,
                      )
                    }
                    className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--color-border)] hover:bg-[var(--color-bg-hover)] text-[var(--color-text-muted)]"
                  >
                    all: {m.mod_name}
                  </button>
                ))}
                <button
                  onClick={() =>
                    onBulkPick(
                      fc.shared_keys.map((k) => k.split("::").pop() || k),
                      null,
                    )
                  }
                  className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--color-border)] hover:bg-[var(--color-bg-hover)] text-[var(--color-text-dim)]"
                >
                  clear
                </button>
              </div>
              <div className="grid gap-1">
                {fc.shared_keys.slice(0, 60).map((k) => {
                  const lookup = k.split("::").pop() || k;
                  const current = fileResolutions[lookup] || defaultWinner.mod_id;
                  const isOverride = !!fileResolutions[lookup];
                  const showPreview = previewOpen === lookup;
                  return (
                    <div key={k}>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => togglePreview(lookup)}
                          className="font-mono text-[var(--color-text-muted)] truncate flex-1 min-w-0 text-left hover:text-[var(--color-accent)]"
                          title="Click to preview entry body from each mod"
                        >
                          {showPreview ? "▼ " : "▶ "}
                          {k}
                        </button>
                        <select
                          value={current}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === defaultWinner.mod_id && !isOverride) return;
                            if (val === "__auto__") onPick(lookup, null);
                            else onPick(lookup, val);
                          }}
                          className={
                            "text-[11px] px-2 py-0.5 rounded border bg-[var(--color-bg-card)] " +
                            (isOverride
                              ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                              : "border-[var(--color-border)] text-[var(--color-text-muted)]")
                          }
                        >
                          {isOverride && <option value="__auto__">(auto: {defaultWinner.mod_name})</option>}
                          {fc.mods.map((m) => (
                            <option key={m.mod_id} value={m.mod_id}>
                              {m.mod_name}
                              {m.mod_id === defaultWinner.mod_id ? " (default)" : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                      {showPreview && (
                        <div className="mt-1 mb-2 ml-4 grid gap-1">
                          {previewLoading && <div className="text-[var(--color-text-dim)]">Loading…</div>}
                          {!previewLoading &&
                            fc.mods.map((m) => {
                              const body = previews[m.mod_id]?.[lookup] || "(missing)";
                              const chosen = current === m.mod_id;
                              return (
                                <div
                                  key={m.mod_id}
                                  className={
                                    "rounded border px-2 py-1 " +
                                    (chosen
                                      ? "border-[var(--color-accent)] bg-[var(--color-accent)]/5"
                                      : "border-[var(--color-border)] bg-[var(--color-bg-card)]")
                                  }
                                >
                                  <div className="text-[10px] text-[var(--color-text-dim)] mb-0.5">
                                    {m.mod_name}
                                    {chosen && " · chosen"}
                                  </div>
                                  <pre className="font-mono text-[10px] whitespace-pre-wrap text-[var(--color-text-muted)] max-h-40 overflow-auto">
                                    {body}
                                  </pre>
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  );
                })}
                {fc.shared_keys.length > 60 && (
                  <span className="text-[var(--color-text-dim)]">+{fc.shared_keys.length - 60} more</span>
                )}
              </div>
            </div>
          )}
          <div className="grid gap-2">
            {fc.mods.map((m) => (
              <div key={m.mod_id} className="border-l-2 border-[var(--color-border)] pl-2">
                <div className="font-semibold text-[var(--color-text)]">{m.mod_name}</div>
                <div className="font-mono text-[var(--color-text-muted)] flex flex-wrap gap-x-3 gap-y-0.5">
                  {m.keys.slice(0, 30).map((k) => (
                    <span key={k}>{k}</span>
                  ))}
                  {m.keys.length > 30 && (
                    <span className="text-[var(--color-text-dim)]">+{m.keys.length - 30}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

function PatchSummary({ report }: { report: PatchGenReport }) {
  return (
    <div className="mb-4 rounded-[var(--radius-lg)] border border-[var(--color-success)]/40 bg-[var(--color-success)]/5 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Wrench className="h-4 w-4 text-[var(--color-success)]" />
        <div className="font-semibold text-[13px]">{report.patch_id}</div>
      </div>
      <div className="text-[11px] text-[var(--color-text-muted)] mb-2">
        {report.patch_folder}
      </div>
      <div className="flex flex-wrap gap-2 text-[11px] mb-2">
        <Badge color="success">{report.files_written.length} written</Badge>
        <Badge color="warning">{report.mixed_count} mixed merged</Badge>
        <Badge color="success">{report.partial_count} partial merged</Badge>
        <Badge color="muted">{report.full_override_count} full (skipped)</Badge>
        {report.files_skipped.length > 0 && (
          <Badge color="danger">{report.files_skipped.length} skipped</Badge>
        )}
      </div>
      {report.files_skipped.length > 0 && (
        <details className="text-[11px]">
          <summary className="cursor-pointer text-[var(--color-text-dim)]">
            Show skipped ({report.files_skipped.length})
          </summary>
          <div className="mt-2 font-mono text-[var(--color-text-muted)]">
            {report.files_skipped.slice(0, 50).map((s) => (
              <div key={s.file}>
                <span>{s.file}</span>{" "}
                <span className="text-[var(--color-text-dim)]">— {s.reason}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
