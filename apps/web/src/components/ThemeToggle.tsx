import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

import { currentTheme, followSystemTheme, setTheme, type Theme } from "../lib/theme.js";

/** Top-bar button that switches between light and dark mode and remembers the choice. */
export function ThemeToggle() {
  const [theme, setState] = useState<Theme>(currentTheme);

  useEffect(() => followSystemTheme(setState), []);

  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => {
        setTheme(next);
        setState(next);
      }}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className="flex size-10 cursor-pointer items-center justify-center rounded-md text-surface-600 hover:bg-surface-100 hover:text-surface-900"
    >
      {theme === "dark" ? <Sun size={19} aria-hidden="true" /> : <Moon size={19} aria-hidden="true" />}
    </button>
  );
}
