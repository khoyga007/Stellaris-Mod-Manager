import type { ModInfo } from "@/types";

export interface MissingDep {
  mod: ModInfo;
  missing: string[];
  disabled: string[];
}

function normalize(s: string): string {
  return s.trim().replace(/^[~!]+/, "").trim().toLowerCase();
}

export function computeMissing(mods: ModInfo[]): MissingDep[] {
  const enabled = mods.filter((m) => m.enabled);
  const byName = new Map<string, ModInfo>();
  for (const m of mods) byName.set(normalize(m.name), m);

  const out: MissingDep[] = [];
  for (const m of enabled) {
    if (!m.dependencies || m.dependencies.length === 0) continue;
    const missing: string[] = [];
    const disabled: string[] = [];
    for (const raw of m.dependencies) {
      const found = byName.get(normalize(raw));
      if (!found) missing.push(raw);
      else if (!found.enabled) disabled.push(found.name);
    }
    if (missing.length > 0 || disabled.length > 0) {
      out.push({ mod: m, missing, disabled });
    }
  }
  return out;
}
