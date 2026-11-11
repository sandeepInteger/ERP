/** Light / dark theme. The choice is stored per browser; with no choice the OS setting is used.
 *  index.html applies the same rule before first paint, so keep the storage key in sync. */
export type Theme = "light" | "dark";

const KEY = "erp-theme";
const media = () => window.matchMedia("(prefers-color-scheme: dark)");

function saved(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

export function setTheme(theme: Theme) {
  applyTheme(theme);
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* private mode: the choice lasts for this page only */
  }
}

/** Follow OS changes until the user picks a theme. Returns an unsubscribe function. */
export function followSystemTheme(onChange: (t: Theme) => void) {
  const m = media();
  const handler = () => {
    if (saved()) return;
    const t: Theme = m.matches ? "dark" : "light";
    applyTheme(t);
    onChange(t);
  };
  m.addEventListener("change", handler);
  return () => m.removeEventListener("change", handler);
}
