export type ThemeId = "midnight" | "imperial" | "black-gold" | "dark-star";

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  description: string;
  swatches: [string, string, string];
}

export const THEMES: ThemeMeta[] = [
  {
    id: "midnight",
    name: "Midnight",
    description: "Default — violet neon on ink.",
    swatches: ["#0a0a0f", "#7c5cff", "#ec4899"],
  },
  {
    id: "imperial",
    name: "Imperial",
    description: "Aged parchment, crimson, imperial gold.",
    swatches: ["#0f0809", "#d4af37", "#8b1a1a"],
  },
  {
    id: "black-gold",
    name: "Black Gold",
    description: "Pure black with rich 24k gold accents.",
    swatches: ["#000000", "#ffd700", "#b8860b"],
  },
  {
    id: "dark-star",
    name: "Dark Star",
    description: "Deep space — cyan, violet, and nebula magenta.",
    swatches: ["#050714", "#22d3ee", "#e879f9"],
  },
];

const STORAGE_KEY = "theme.v1";

export function loadTheme(): ThemeId {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && THEMES.some((t) => t.id === stored)) return stored as ThemeId;
  return "midnight";
}

export function applyTheme(id: ThemeId) {
  if (id === "midnight") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", id);
  }
  localStorage.setItem(STORAGE_KEY, id);
}
