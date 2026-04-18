function parseParts(v: string): number[] {
  return v
    .replace(/^v/i, "")
    .split(".")
    .map((p) => (p === "*" || p === "x" ? -1 : parseInt(p, 10)))
    .map((n) => (isNaN(n) ? -1 : n));
}

/**
 * Check if a mod's `supported_version` pattern is compatible with the installed
 * game version. `*` / `x` in the pattern is a wildcard matching any number.
 *
 * Examples: isCompatible("4.*.*", "4.0.5") → true
 *           isCompatible("3.14.*", "4.0.0") → false
 *           isCompatible("4.0.*", "4.1.0") → false
 */
export function isCompatible(supported: string | undefined, game: string | undefined): boolean {
  if (!supported || !game) return true; // no data → don't scare the user
  const sp = parseParts(supported);
  const gp = parseParts(game);
  const len = Math.max(sp.length, gp.length);
  for (let i = 0; i < len; i++) {
    const s = sp[i] ?? -1;
    const g = gp[i] ?? 0;
    if (s === -1) continue; // wildcard
    if (s !== g) return false;
  }
  return true;
}
