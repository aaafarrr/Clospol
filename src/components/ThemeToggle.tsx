"use client";

import React, { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    // Determine initial theme on mount
    const localTheme = localStorage.getItem("theme");
    const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    
    if (localTheme === "light") {
      setTheme("light");
      document.documentElement.classList.remove("dark");
    } else if (localTheme === "dark") {
      setTheme("dark");
      document.documentElement.classList.add("dark");
    } else {
      // Default to dark mode for Clospol
      setTheme("dark");
      document.documentElement.classList.add("dark");
    }
  }, []);

  const toggleTheme = () => {
    if (theme === "dark") {
      setTheme("light");
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
      window.dispatchEvent(new Event("theme-changed"));
    } else {
      setTheme("dark");
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
      window.dispatchEvent(new Event("theme-changed"));
    }
  };

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
      aria-label="Toggle dark mode"
      type="button"
    >
      {theme === "dark" ? <Sun size={14} className="text-amber-500" /> : <Moon size={14} className="text-slate-600" />}
    </button>
  );
}

