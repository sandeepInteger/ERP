import { api } from "./api.js";

/** Opens an API file (e.g. a receipt) in a new tab, through the API client so the auth header goes with it. */
export async function viewFile(url: string): Promise<void> {
  // Open the tab first (inside the click), then point it at the file: popup blockers allow that.
  const tab = window.open("", "_blank");
  const r = await api.get<Blob>(url, { responseType: "blob" });
  const href = URL.createObjectURL(r.data);
  if (tab) tab.location.href = href;
  else window.location.href = href;
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
}

/** Downloads an API file (documents, Excel exports) through the API client so the auth header goes with it. */
export async function downloadFile(url: string, fallbackName: string): Promise<void> {
  const r = await api.get<Blob>(url, { responseType: "blob" });
  const disposition = String(r.headers["content-disposition"] ?? "");
  const match = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(disposition);
  const name = match ? decodeURIComponent(match[1] ?? match[2] ?? fallbackName) : fallbackName;
  const href = URL.createObjectURL(r.data);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}
