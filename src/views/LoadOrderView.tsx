import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import {
  ListOrdered,
  RefreshCw,
  AlertTriangle,
  GitBranch,
  ArrowRight,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { LoadOrderAnalysis, ModPlan, LoadOrderIssue } from "@/types";

export function LoadOrderView({ onApplied }: { onApplied?: () => void }) {
  const [analysis, setAnalysis] = useState<LoadOrderAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);

  async function analyze() {
    setLoading(true);
    try {
      const a = await invoke<LoadOrderAnalysis>("analyze_load_order");
      setAnalysis(a);
    } catch (e) {
      toast.error(`${e}`);
    } finally {
      setLoading(false);
    }
  }

  async function apply() {
    setApplying(true);
    try {
      await invoke<string[]>("apply_auto_sort");
      toast.success("Load order applied");
      onApplied?.();
      await analyze();
    } catch (e) {
      toast.error(`${e}`);
    } finally {
      setApplying(false);
    }
  }

  useEffect(() => {
    analyze();
  }, []);

  const cycles = (analysis?.issues || []).filter((i) => i.kind === "Cycle");
  const missing = (analysis?.issues || []).filter((i) => i.kind === "MissingDependency");
  const outOfOrder = (analysis?.plan || []).filter(
    (p) => p.current_index !== null && p.current_index !== p.suggested_index,
  );

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-6 py-5 max-w-5xl w-full mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-[var(--radius-md)] bg-gradient-to-br from-[var(--color-accent)] to-[#7c5cff] grid place-items-center shadow-lg">
            <ListOrdered className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold tracking-tight font-display">Load order</h1>
            <p className="text-xs text-[var(--color-text-muted)]">
              Analyzes enabled mods by bucket + dependencies. Suggests a topological order.
            </p>
          </div>
          <Button variant="secondary" onClick={analyze} disabled={loading}>
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            Re-analyze
          </Button>
          {analysis && outOfOrder.length > 0 && (
            <Button variant="primary" onClick={apply} disabled={applying}>
              <Check className="h-4 w-4" />
              Apply suggested
            </Button>
          )}
        </div>

        {!analysis && loading && (
          <div className="text-center py-16 text-[var(--color-text-dim)]">Analyzing…</div>
        )}

        {analysis && (
          <>
            <div className="flex flex-wrap gap-2 mb-4 text-[11px]">
              <Pill color="muted">{analysis.plan.length} mods</Pill>
              <Pill color={outOfOrder.length > 0 ? "warning" : "success"}>
                {outOfOrder.length} out of order
              </Pill>
              {cycles.length > 0 && <Pill color="danger">{cycles.length} cycles</Pill>}
              {missing.length > 0 && (
                <Pill color="warning">{missing.length} missing deps</Pill>
              )}
            </div>

            {cycles.length > 0 && <CyclesBlock issues={cycles} />}
            {missing.length > 0 && <MissingBlock issues={missing} />}

            <div className="text-[12px] font-semibold mb-2 text-[var(--color-text-muted)]">
              Suggested order ({analysis.plan.length})
            </div>
            <div className="flex flex-col gap-1">
              {analysis.plan.map((p) => (
                <PlanRow key={p.mod_id} plan={p} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PlanRow({ plan }: { plan: ModPlan }) {
  const moved =
    plan.current_index !== null && plan.current_index !== plan.suggested_index;
  const delta =
    plan.current_index !== null ? plan.suggested_index - plan.current_index : 0;
  return (
    <div
      className={
        "flex items-center gap-3 px-3 py-2 rounded-[var(--radius-md)] border text-[12px] " +
        (moved
          ? "border-[var(--color-warning)]/40 bg-[var(--color-warning)]/5"
          : "border-[var(--color-border)] bg-[var(--color-bg-card)]")
      }
    >
      <span className="w-8 text-right font-mono text-[var(--color-text-dim)]">
        {plan.suggested_index + 1}
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-semibold truncate">{plan.mod_name}</div>
        <div className="text-[10px] text-[var(--color-text-dim)] truncate">
          {plan.bucket} · {plan.reason}
        </div>
      </div>
      {moved && (
        <span
          className={
            "text-[10px] font-mono px-1.5 py-0.5 rounded " +
            (delta < 0
              ? "bg-[var(--color-success)]/15 text-[var(--color-success)]"
              : "bg-[var(--color-warning)]/15 text-[var(--color-warning)]")
          }
        >
          {delta < 0 ? "▲" : "▼"} {Math.abs(delta)}
        </span>
      )}
    </div>
  );
}

function CyclesBlock({ issues }: { issues: LoadOrderIssue[] }) {
  return (
    <div className="mb-4 rounded-[var(--radius-lg)] border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/5 p-3">
      <div className="flex items-center gap-2 mb-2 text-[var(--color-danger)] font-semibold text-[12px]">
        <GitBranch className="h-4 w-4" />
        Dependency cycles ({issues.length})
      </div>
      <div className="flex flex-col gap-1 text-[11px]">
        {issues.map(
          (i, idx) =>
            i.kind === "Cycle" && (
              <div key={idx} className="font-mono text-[var(--color-text-muted)]">
                {i.mod_names.map((n, k) => (
                  <span key={k}>
                    {n}
                    {k < i.mod_names.length - 1 && (
                      <ArrowRight className="inline h-3 w-3 mx-1 text-[var(--color-text-dim)]" />
                    )}
                  </span>
                ))}
              </div>
            ),
        )}
      </div>
    </div>
  );
}

function MissingBlock({ issues }: { issues: LoadOrderIssue[] }) {
  return (
    <div className="mb-4 rounded-[var(--radius-lg)] border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/5 p-3">
      <div className="flex items-center gap-2 mb-2 text-[var(--color-warning)] font-semibold text-[12px]">
        <AlertTriangle className="h-4 w-4" />
        Missing dependencies ({issues.length})
      </div>
      <div className="flex flex-col gap-1 text-[11px]">
        {issues.map(
          (i, idx) =>
            i.kind === "MissingDependency" && (
              <div key={idx} className="font-mono text-[var(--color-text-muted)]">
                <span className="text-[var(--color-text)]">{i.mod_name}</span>
                <span className="text-[var(--color-text-dim)]"> needs </span>
                <span className="text-[var(--color-warning)]">"{i.missing}"</span>
              </div>
            ),
        )}
      </div>
    </div>
  );
}

function Pill({
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
  return <span className={"px-2 py-0.5 rounded-full " + cls}>{children}</span>;
}
