import { Bug, Check, XCircle, RotateCcw, Rocket, Target } from "lucide-react";
import type { BisectState } from "@/lib/bisect";
import type { ModInfo } from "@/types";
import { Button } from "./ui/Button";

interface Props {
  state: BisectState;
  mods: ModInfo[];
  onMark: (result: "bad" | "good") => void;
  onCancel: () => void;
  onFinish: () => void;
}

export function BisectBar({ state, mods, onMark, onCancel, onFinish }: Props) {
  const modMap = new Map(mods.map((m) => [m.id, m]));
  const culpritMod = state.culprit ? modMap.get(state.culprit) : null;
  const total = state.originalEnabled.length;
  const remaining = state.candidates.length;
  const progress = total > 0 ? Math.round(((total - remaining) / total) * 100) : 0;

  if (state.finished) {
    return (
      <div className="border-b border-[var(--color-accent)]/40 bg-gradient-to-r from-[var(--color-success)]/10 to-[var(--color-accent)]/10 px-6 py-3 flex items-center gap-3">
        <div className="h-9 w-9 rounded-[var(--radius-md)] bg-[var(--color-success)]/20 grid place-items-center">
          <Target className="h-4 w-4 text-[var(--color-success)]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold">
            Bisect done — culprit:{" "}
            <span className="text-[var(--color-accent-hover)]">
              {culpritMod?.name ?? state.culprit ?? "(none)"}
            </span>
          </div>
          <div className="text-[11px] text-[var(--color-text-dim)]">
            {state.history.length} rounds. Click "Restore" to re-enable your original playset.
          </div>
        </div>
        <Button variant="primary" size="sm" onClick={onFinish}>
          <RotateCcw className="h-3.5 w-3.5" />
          Restore &amp; exit
        </Button>
      </div>
    );
  }

  return (
    <div className="border-b border-[var(--color-accent)]/40 bg-gradient-to-r from-[var(--color-accent)]/10 to-[#ec4899]/10 px-6 py-3 flex items-center gap-3 flex-wrap">
      <div className="h-9 w-9 rounded-[var(--radius-md)] bg-[var(--color-accent)]/20 grid place-items-center">
        <Bug className="h-4 w-4 text-[var(--color-accent-hover)]" />
      </div>
      <div className="flex-1 min-w-[260px]">
        <div className="text-xs font-semibold flex items-center gap-2">
          <span>Bisect — round {state.round}</span>
          <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
            {state.testActive.length}/{remaining} candidates enabled
          </span>
        </div>
        <div className="text-[11px] text-[var(--color-text-dim)] flex items-center gap-3">
          <span>Launch game, test, then tell em the outcome</span>
          <span className="flex-1 h-1 rounded-full bg-[var(--color-bg-hover)] max-w-[200px] overflow-hidden">
            <span
              className="block h-full bg-gradient-to-r from-[#7c5cff] to-[#ec4899]"
              style={{ width: `${progress}%` }}
            />
          </span>
          <span className="font-mono">{progress}%</span>
        </div>
      </div>
      <Button
        variant="danger"
        size="sm"
        onClick={() => onMark("bad")}
        title="Game crashed / bug reproduced — culprit is in the enabled half"
      >
        <XCircle className="h-3.5 w-3.5" />
        Crashed
      </Button>
      <Button
        variant="primary"
        size="sm"
        onClick={() => onMark("good")}
        title="Game ran fine — culprit is in the disabled half"
      >
        <Check className="h-3.5 w-3.5" />
        Clean run
      </Button>
      <Button variant="ghost" size="sm" onClick={onCancel} title="Cancel and restore original">
        <Rocket className="h-3.5 w-3.5 rotate-180" />
        Cancel
      </Button>
    </div>
  );
}
