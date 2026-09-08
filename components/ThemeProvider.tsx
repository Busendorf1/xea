"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export type Theme = "white" | "dark";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function showGlobalToast(message: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("xea:toast", { detail: { message } }));
  }
}

function GlobalToastHUD() {
  const [toast, setToast] = useState<{ message: string; id: number } | null>(null);

  useEffect(() => {
    const handleToast = (e: Event) => {
      const customEvt = e as CustomEvent<{ message?: string }>;
      if (customEvt?.detail?.message) {
        setToast({ message: customEvt.detail.message, id: Date.now() });
      }
    };
    window.addEventListener("xea:toast", handleToast);
    return () => window.removeEventListener("xea:toast", handleToast);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      setToast(null);
    }, 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;

  return (
    <div role="status" aria-live="polite" className="globalToastHud">
      <span>{toast.message}</span>
    </div>
  );
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    // Check localStorage first
    const savedTheme = localStorage.getItem("paayh_theme") as Theme | null;
    if (savedTheme === "white" || savedTheme === "dark") {
      setThemeState(savedTheme);
      document.documentElement.setAttribute("data-theme", savedTheme);
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const syncTheme = (e?: MediaQueryListEvent | MediaQueryList) => {
      // If user has explicitly saved a preference, honor it over media query
      const existing = localStorage.getItem("paayh_theme") as Theme | null;
      if (existing === "white" || existing === "dark") {
        setThemeState(existing);
        document.documentElement.setAttribute("data-theme", existing);
        return;
      }
      const isDark = e ? e.matches : mediaQuery.matches;
      const currentTheme: Theme = isDark ? "dark" : "white";
      setThemeState(currentTheme);
      document.documentElement.setAttribute("data-theme", currentTheme);
    };

    // Immediately synchronize with device color mode
    syncTheme();

    mediaQuery.addEventListener("change", syncTheme);
    return () => mediaQuery.removeEventListener("change", syncTheme);
  }, []);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem("paayh_theme", newTheme);
    } catch {}
    document.documentElement.setAttribute("data-theme", newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
      <GlobalToastHUD />
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
