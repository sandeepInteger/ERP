import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CheckCircle2, X } from "lucide-react";

import { CREW_WORK_STATUSES, WORK_STATUS_LABELS, WorkItemStatus } from "@erp/types";
import { AsyncButton } from "../../components/ui/async-button.js";
import { Badge } from "../../components/ui/badge.js";
import { Button } from "../../components/ui/button.js";
import { Card } from "../../components/ui/card.js";
import { Field, FormError } from "../../components/ui/field.js";
import { Input, Textarea } from "../../components/ui/input.js";
import { useApi } from "../../hooks/useApi.js";
import { usePageBack } from "../../context/PageBackContext.js";
import { api, errMsg } from "../../lib/api.js";
import { date, dateTime, fullName } from "../../lib/format.js";
import { workTone, type Person } from "../../lib/ericsson.js";
import { cn } from "../../lib/utils.js";

interface WorkItem {
  id: string; title: string; description: string | null; status: WorkItemStatus; dueDate: string | null;
  site: { id: string; siteCode: string; venueName: string; address: string | null };
  updates: { id: string; status: WorkItemStatus; hours: string; note: string | null; photoCount: number; createdAt: string; user: Person }[];
}

/** Phone-first: a crew member updates one of their work items (status, hours, note, photos). */
export default function FieldWorkUpdatePage() {
  usePageBack("/field", "My work");
  const { id } = useParams<{ id: string }>();
  const { data: item, error: loadError } = useApi<WorkItem>(`/field/work-items/${id}`);
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<WorkItemStatus | null>(null);
  const [hours, setHours] = useState("");
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ status: WorkItemStatus; failed: number } | null>(null);

  // Start from the item's current status (To do moves to In progress, the usual next step).
  useEffect(() => {
    if (item && status === null) setStatus(item.status === WorkItemStatus.TODO ? WorkItemStatus.IN_PROGRESS : item.status);
  }, [item, status]);

  const photosRef = useRef(photos);
  photosRef.current = photos;
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  function addPhotos(files: FileList | null) {
    if (!files) return;
    const added = Array.from(files).map((file) => ({ file, url: URL.createObjectURL(file) })); // copy before clearing the input
    setPhotos((p) => [...p, ...added]);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function submit() {
    if (!item || !status) throw new Error("not loaded");
    const h = Number(hours || 0);
    if (!(h >= 0 && h <= 24)) { setError("Hours must be between 0 and 24."); throw new Error("validation"); }
    if (status === WorkItemStatus.BLOCKED && !note.trim()) { setError("Say what is blocking the work."); throw new Error("validation"); }
    setError(null);

    // Photos first (they're kept on the site as installation proof), then the update with the count.
    let uploaded = 0;
    for (const p of photos) {
      const form = new FormData();
      form.append("type", "PHOTO");
      form.append("file", p.file);
      try { await api.post(`/ericsson/sites/${item.site.id}/documents`, form); uploaded++; } catch { /* counted below */ }
    }
    try {
      await api.post(`/field/work-items/${item.id}/updates`, {
        status, hours: h, photoCount: uploaded, ...(note.trim() ? { note: note.trim() } : {}),
      });
    } catch (e) { setError(errMsg(e)); throw e; }
    setDone({ status, failed: photos.length - uploaded });
  }

  if (loadError) return <div className="mx-auto max-w-xl px-4 py-6"><FormError message={loadError} /></div>;
  if (!item) return <div className="mx-auto max-w-xl px-4 py-6 text-surface-500">Loading…</div>;

  if (done) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 px-4 py-16 text-center">
        <CheckCircle2 size={56} className="text-success" aria-hidden="true" />
        <h1 className="text-xl font-bold">Update saved</h1>
        <p className="text-sm text-surface-500">
          "{item.title}" is now <strong>{WORK_STATUS_LABELS[done.status]}</strong>.
          {done.status === WorkItemStatus.BLOCKED && " Your PM and delivery lead have been told."}
          {done.failed > 0 && ` ${done.failed} photo(s) didn't upload; try again from this screen.`}
        </p>
        <Button asChild size="lg" className="w-full"><Link to="/field">Back to my work</Link></Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 py-5">
      <div>
        <div className="text-[13px] text-surface-500">{item.site.siteCode} · {item.site.venueName}</div>
        <h1 className="mt-1 text-xl font-bold">{item.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-surface-500">
          <Badge tone={workTone(item.status)}>{WORK_STATUS_LABELS[item.status]}</Badge>
          {item.dueDate && <span>Due {date(item.dueDate)}</span>}
        </div>
        {item.description && <p className="mt-2 whitespace-pre-line text-sm">{item.description}</p>}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-[13px] font-semibold text-surface-700">Status now</legend>
        <div className="grid grid-cols-2 gap-2">
          {CREW_WORK_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={status === s}
              onClick={() => setStatus(s)}
              className={cn(
                "flex min-h-12 cursor-pointer items-center justify-center rounded-lg border text-sm font-semibold transition-colors",
                status === s ? "border-brand-600 bg-brand-600 text-white" : "border-surface-300 bg-surface-0 text-surface-800 hover:bg-surface-100",
              )}
            >
              {WORK_STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </fieldset>

      <Field label="Hours you worked on this today">
        <Input className="h-11 text-base" inputMode="decimal" value={hours} placeholder="e.g. 4" onChange={(e) => setHours(e.target.value.replace(/[^\d.]/g, ""))} />
      </Field>

      <Field label={status === WorkItemStatus.BLOCKED ? "What is blocking it?" : "Note (optional)"}>
        <Textarea className="min-h-24 text-base" value={note} onChange={(e) => setNote(e.target.value)}
          placeholder={status === WorkItemStatus.BLOCKED ? "e.g. No ceiling access, waiting for venue security" : "What you did, anything the PM should know"} />
      </Field>

      <section className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold text-surface-700">Photos ({photos.length})</span>
        {photos.length > 0 && (
          <div className="grid grid-cols-4 gap-2">
            {photos.map((p, i) => (
              <div key={p.url} className="relative aspect-square overflow-hidden rounded-lg bg-surface-100">
                <img src={p.url} alt={`Photo ${i + 1}`} className="size-full object-cover" />
                <button type="button" aria-label={`Remove photo ${i + 1}`}
                  onClick={() => setPhotos((cur) => { URL.revokeObjectURL(cur[i]!.url); return cur.filter((_, k) => k !== i); })}
                  className="absolute top-1 right-1 flex size-7 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white">
                  <X size={14} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}
        <Input ref={fileRef} type="file" accept="image/*" capture="environment" multiple aria-label="Add photos" className="h-auto py-2" onChange={(e) => addPhotos(e.target.files)} />
      </section>

      <FormError message={error} />
      <AsyncButton size="lg" className="w-full" onClick={() => submit()}>Save update</AsyncButton>

      {item.updates.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-[15px] font-bold">Earlier updates</h2>
          <Card className="divide-y divide-surface-100">
            {item.updates.map((u) => (
              <div key={u.id} className="flex flex-col gap-0.5 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={workTone(u.status)}>{WORK_STATUS_LABELS[u.status]}</Badge>
                  <span className="text-xs text-surface-500">{dateTime(u.createdAt)} · {fullName(u.user)} · {Number(u.hours)} hrs{u.photoCount ? ` · ${u.photoCount} ${u.photoCount === 1 ? "photo" : "photos"}` : ""}</span>
                </div>
                {u.note && <p className="whitespace-pre-line">{u.note}</p>}
              </div>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}
