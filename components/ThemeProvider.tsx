"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export type Theme = "white" | "dark";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const syncTheme = (e?: MediaQueryListEvent | MediaQueryList) => {
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
    document.documentElement.setAttribute("data-theme", newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
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
