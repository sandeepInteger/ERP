import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";

import { Button } from "./ui/button.js";
import { api } from "../lib/api.js";
import { dateTime } from "../lib/format.js";
import { cn } from "../lib/utils.js";

interface Item { id: string; type: string; title: string; body: string | null; link: string | null; readAt: string | null; createdAt: string }

const POLL_MS = 60_000;

/** The bell: unread count, a panel of recent notifications, mark read on open. Polls every minute. */
export function NotificationBell() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<{ items: Item[]; unread: number }>("/notifications");
      setItems(data.items);
      setUnread(data.unread);
    } catch { /* keep the last list; the next poll retries */ }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => { if (document.visibilityState === "visible") void load(); }, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  async function openItem(n: Item) {
    setOpen(false);
    if (!n.readAt) {
      setItems((list) => list.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
      setUnread((u) => Math.max(0, u - 1));
      void api.post(`/notifications/${n.id}/read`).catch(() => {});
    }
    if (n.link) navigate(n.link);
  }

  async function readAll() {
    await api.post("/notifications/read-all").catch(() => {});
    await load();
  }

  return (
    <div ref={ref} className="relative ml-auto">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        className="relative flex size-10 cursor-pointer items-center justify-center rounded-md text-surface-600 hover:bg-surface-100 hover:text-surface-900"
      >
        <Bell size={19} aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-error px-1 text-[10px] font-bold leading-4 text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 flex max-h-[70vh] w-[360px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg border border-surface-200 bg-surface-0 shadow-lg">
          <div className="flex items-center justify-between border-b border-surface-100 px-4 py-3">
            <span className="font-bold">Notifications</span>
            {unread > 0 && <Button variant="ghost" size="sm" onClick={() => void readAll()}>Mark all read</Button>}
          </div>
          <ul className="overflow-y-auto">
            {items.length === 0 && <li className="px-4 py-8 text-center text-sm text-surface-500">Nothing yet.</li>}
            {items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => void openItem(n)}
                  className={cn("flex w-full cursor-pointer flex-col gap-0.5 border-b border-surface-100 px-4 py-3 text-left hover:bg-surface-50", !n.readAt && "bg-brand-50")}
                >
                  <span className="flex items-start gap-2">
                    {!n.readAt && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-600" aria-label="Unread" />}
                    <span className="text-[13px] font-semibold">{n.title}</span>
                  </span>
                  {n.body && <span className="line-clamp-3 whitespace-pre-line text-xs text-surface-500">{n.body}</span>}
                  <span className="text-[11px] text-surface-400">{dateTime(n.createdAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
