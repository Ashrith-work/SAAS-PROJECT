"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
} from "react";

// Theme state for the app. Dark is the default (the product's identity). The
// no-flash script in the root layout (THEME_INIT_SCRIPT) applies the correct
// class to <html> BEFORE paint; this provider reads the saved preference via
// useSyncExternalStore (so there's no setState-in-effect and no hydration
// mismatch) and keeps the <html> class in sync as the user toggles or the OS
// preference changes (in "system" mode). Only the `.light` class signals light —
// its absence means dark (see globals.css, where the dark palette lives on :root).

export type Theme = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "theme";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (t: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

// ── External store: the saved preference in localStorage ──
let listeners: Array<() => void> = [];
function notify() {
  for (const l of listeners) l();
}
function subscribe(cb: () => void) {
  listeners.push(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
    window.removeEventListener("storage", cb);
  };
}
function readPreference(): Theme {
  return (localStorage.getItem(THEME_STORAGE_KEY) as Theme | null) ?? "dark";
}
function readServerPreference(): Theme {
  return "dark"; // SSR default — matches :root, so no flash / mismatch
}

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

// Apply the resolved theme to <html>. Mirrors THEME_INIT_SCRIPT.
function applyTheme(theme: Theme): void {
  const resolved = theme === "system" ? (systemPrefersDark() ? "dark" : "light") : theme;
  const cls = document.documentElement.classList;
  cls.toggle("light", resolved === "light");
  cls.toggle("dark", resolved === "dark");
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(
    subscribe,
    readPreference,
    readServerPreference,
  );

  // Keep <html> in sync with the active preference, and follow the OS setting
  // while in "system" mode. Pure DOM side effect — no React state involved.
  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    localStorage.setItem(THEME_STORAGE_KEY, t);
    notify(); // re-read the store → re-render → the effect re-applies the class
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}

// Runs synchronously in <head> before first paint to avoid a theme flash. Reads
// the saved preference and adds the matching class to <html>. Defaults to dark.
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");var r=t==="light"?"light":t==="dark"?"dark":t==="system"?(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):"dark";var c=document.documentElement.classList;if(r==="light"){c.add("light");c.remove("dark");}else{c.add("dark");c.remove("light");}}catch(e){}})();`;
