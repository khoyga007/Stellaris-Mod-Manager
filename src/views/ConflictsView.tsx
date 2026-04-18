import { useState } from "react";
import { motion } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { AlertTriangle, RefreshCw, ChevronRight, FileCode2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { ConflictReport, ConflictPair } from "@/types";

export function ConflictsView() {
  const [report, setReport] = useState<ConflictReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function analyze() {
    setLoading(true);
    try {
      const r = await invoke<ConflictReport>("analyze_conflicts");
      setReport(r);
      if (r.pairs.length === 0) {
        toast.success("No conflicts detected 🎉");
      }
    } catch (e) {
      toast.error(`${e}`);
    } finally {
      setLoading(false);
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

        {!report && !loading && (
          <div className="text-center py-16 text-[var(--color-text-dim)]">
            <AlertTriangle className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <div className="text-xs">Click "Scan now" to analyze your enabled mod set.</div>
          </div>
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
