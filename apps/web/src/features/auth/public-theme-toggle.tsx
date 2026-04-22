"use client";

import { Moon, SunMedium } from "lucide-react";
import { useEffect, useState } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "opensocial-public-theme";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function applyTheme(theme: Theme, rootId: string) {
  const el = document.getElementById(rootId);
  if (el) el.dataset.theme = theme;
}

function persist(theme: Theme) {
  document.cookie = `${STORAGE_KEY}=${theme};path=/;max-age=${COOKIE_MAX_AGE};samesite=lax`;
  window.localStorage.setItem(STORAGE_KEY, theme);
}

export function PublicThemeToggle({
  rootId,
  className,
}: {
  rootId: string;
  className: string;
}) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const el = document.getElementById(rootId);
    const current = el?.dataset.theme as Theme | undefined;
    if (current === "light" || current === "dark") setTheme(current);
  }, [rootId]);

  const toggle = () => {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    applyTheme(next, rootId);
    persist(next);
  };

  return (
    <button
      aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
      aria-pressed={theme === "dark"}
      className={className}
      onClick={toggle}
      type="button"
    >
      {theme === "light" ? (
        <Moon
          aria-hidden="true"
          className="manifesto-theme-icon"
          strokeWidth={1.8}
        />
      ) : (
        <SunMedium
          aria-hidden="true"
          className="manifesto-theme-icon"
          strokeWidth={1.8}
        />
      )}
    </button>
  );
}
