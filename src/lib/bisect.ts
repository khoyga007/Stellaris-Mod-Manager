export interface BisectState {
  originalEnabled: string[];
  candidates: string[];
  testActive: string[];
  round: number;
  history: Array<{ round: number; tested: number; result: "bad" | "good" }>;
  finished: boolean;
  culprit: string | null;
}

const STORAGE_KEY = "bisect.state.v1";

function splitHalf(ids: string[]): string[] {
  const mid = Math.ceil(ids.length / 2);
  return ids.slice(0, mid);
}

export function startBisect(enabledIds: string[]): BisectState {
  return {
    originalEnabled: [...enabledIds],
    candidates: [...enabledIds],
    testActive: splitHalf(enabledIds),
    round: 1,
    history: [],
    finished: enabledIds.length <= 1,
    culprit: enabledIds.length === 1 ? enabledIds[0] : null,
  };
}

export function markResult(state: BisectState, result: "bad" | "good"): BisectState {
  if (state.finished) return state;
  const testDisabled = state.candidates.filter((id) => !state.testActive.includes(id));
  const newCandidates = result === "bad" ? state.testActive : testDisabled;
  const history = [
    ...state.history,
    { round: state.round, tested: state.testActive.length, result },
  ];

  if (newCandidates.length <= 1) {
    return {
      ...state,
      candidates: newCandidates,
      testActive: newCandidates,
      history,
      finished: true,
      culprit: newCandidates[0] ?? null,
    };
  }

  return {
    ...state,
    candidates: newCandidates,
    testActive: splitHalf(newCandidates),
    round: state.round + 1,
    history,
  };
}

/** Mods that must be enabled during this test round. */
export function effectiveEnabled(state: BisectState): string[] {
  const candidateSet = new Set(state.candidates);
  const innocent = state.originalEnabled.filter((id) => !candidateSet.has(id));
  const orderedActive = state.originalEnabled.filter((id) => state.testActive.includes(id));
  return [...innocent, ...orderedActive];
}

export function saveBisect(state: BisectState | null): void {
  try {
    if (state === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function loadBisect(): BisectState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as BisectState;
  } catch {
    return null;
  }
}
