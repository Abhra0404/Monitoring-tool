import { create } from "zustand";

export type ThemeName = "dark" | "light";

interface ThemeState {
  theme: ThemeName;
  toggle: () => void;
  setTheme: (t: ThemeName) => void;
}

const STORAGE_KEY = "theoria-theme";

function readInitial(): ThemeName {
  if (typeof window === "undefined") return "dark";
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === "dark" || v === "light") return v;
  } catch {
    // ignore
  }
  // Respect OS preference as a sensible default
  if (window.matchMedia?.("(prefers-color-scheme: light)").matches) return "light";
  return "dark";
}

function applyToDom(theme: ThemeName): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.style.colorScheme = theme;
}

const useThemeStore = create<ThemeState>((set, get) => ({
  theme: readInitial(),
  toggle: () => {
    const next: ThemeName = get().theme === "dark" ? "light" : "dark";
    applyToDom(next);
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
    set({ theme: next });
  },
  setTheme: (t) => {
    applyToDom(t);
    try { window.localStorage.setItem(STORAGE_KEY, t); } catch { /* ignore */ }
    set({ theme: t });
  },
}));

// Apply on import so the very first paint is correct
applyToDom(useThemeStore.getState().theme);

export default useThemeStore;
