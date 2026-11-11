import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CheckCircle2, Minus, Plus, X } from "lucide-react";

import { AsyncButton } from "../../components/ui/async-button.js";
import { Button } from "../../components/ui/button.js";
import { Card } from "../../components/ui/card.js";
import { Checkbox } from "../../components/ui/checkbox.js";
import { Field, FormError } from "../../components/ui/field.js";
import { Input, Textarea } from "../../components/ui/input.js";
import { useApi } from "../../hooks/useApi.js";
import { usePageBack } from "../../context/PageBackContext.js";
import { api, errMsg } from "../../lib/api.js";
import { todayIso } from "../../lib/format.js";
import type { FieldSite } from "./FieldTodayPage.js";

/** Phone-first daily log: what got done, crew, hours, blockers, and site photos in one submit. */
export default function FieldLogPage() {
  usePageBack("/field", "Today");
  const { id } = useParams<{ id: string }>();
  const { data: site } = useApi<FieldSite>(`/field/sites/${id}`);
  const fileRef = useRef<HTMLInputElement>(null);
  const [summary, setSummary] = useState("");
  const [crew, setCrew] = useState(4);
  const [hours, setHours] = useState("8");
  const [blocked, setBlocked] = useState(false);
  const [blocker, setBlocker] = useState("");
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ photos: number; failed: number } | null>(null);

  // Revoke preview URLs when photos are removed or the page closes.
  const photosRef = useRef(photos);
  photosRef.current = photos;
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  // "Photos" on the Today screen links here with #photos.
  useEffect(() => {
    if (window.location.hash === "#photos") document.getElementById("photos")?.scrollIntoView();
  }, [site]);

  function addPhotos(files: FileList | null) {
    if (!files) return;
    // Copy the files out first: clearing the input below empties the live FileList, and the
    // state updater runs later.
    const added = Array.from(files).map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPhotos((p) => [...p, ...added]);
    if (fileRef.current) fileRef.current.value = "";
  }

  function removePhoto(i: number) {
    setPhotos((p) => {
      URL.revokeObjectURL(p[i]!.url);
      return p.filter((_, k) => k !== i);
    });
  }

  async function submit() {
    if (!summary.trim()) { setError("Say what got done today."); throw new Error("validation"); }
    const h = Number(hours);
    if (!(h > 0 && h <= 24)) { setError("Hours each must be between 0 and 24."); throw new Error("validation"); }
    setError(null);
    try {
      await api.post(`/ericsson/sites/${id}/daily-logs`, {
        workDate: todayIso(), summary: summary.trim(), crewCount: crew, hoursEach: h, blocked,
        ...(blocked && blocker.trim() ? { blockerNote: blocker.trim() } : {}),
      });
    } catch (e) { setError(errMsg(e)); throw e; }

    // The log is saved; photos go up one by one, and a failed photo doesn't lose the log.
    let failed = 0;
    for (const p of photos) {
      const form = new FormData();
      form.append("type", "PHOTO");
      form.append("file", p.file);
      try { await api.post(`/ericsson/sites/${id}/documents`, form); } catch { failed++; }
    }
    setDone({ photos: photos.length - failed, failed });
  }

  if (done) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 px-4 py-16 text-center">
        <CheckCircle2 size={56} className="text-success" aria-hidden="true" />
        <h1 className="text-xl font-bold">Log submitted</h1>
        <p className="text-sm text-surface-500">
          {done.photos} {done.photos === 1 ? "photo" : "photos"} uploaded.{done.failed ? ` ${done.failed} failed: add them from the site's Documents tab.` : ""} The PM and coordinator can see it on the site.
        </p>
        <Button asChild size="lg" className="w-full"><Link to="/field">Back to today</Link></Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 py-5">
      <div>
        <h1 className="text-xl font-bold">Daily log</h1>
        <p className="text-[13px] text-surface-500">{site ? `${site.siteCode} · ${site.venueName}` : "Loading…"} · {todayIso()}</p>
      </div>

      <Field label="What got done today">
        <Textarea className="min-h-28 text-base" value={summary} onChange={(e) => setSummary(e.target.value)} />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5 text-[13px] font-semibold text-surface-700">
          Crew on site
          <div className="flex items-center gap-2">
            <Button variant="secondary" className="size-11 p-0" aria-label="Fewer crew" onClick={() => setCrew((c) => Math.max(1, c - 1))}><Minus size={18} /></Button>
            <span className="flex-1 text-center text-xl font-bold text-surface-900" aria-live="polite">{crew}</span>
            <Button variant="secondary" className="size-11 p-0" aria-label="More crew" onClick={() => setCrew((c) => Math.min(200, c + 1))}><Plus size={18} /></Button>
          </div>
        </div>
        <Field label="Hours each">
          <Input className="h-11 text-base" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value.replace(/[^\d.]/g, ""))} />
        </Field>
      </div>
      <p className="-mt-3 text-[13px] text-surface-500">Labor today: <strong className="text-surface-900">{crew * (Number(hours) || 0)} hrs</strong></p>

      <section id="photos" className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold text-surface-700">Photos ({photos.length})</span>
        <div className="grid grid-cols-4 gap-2">
          {photos.map((p, i) => (
            <div key={p.url} className="relative aspect-square overflow-hidden rounded-lg bg-surface-100">
              <img src={p.url} alt={`Photo ${i + 1}`} className="size-full object-cover" />
              <button
                type="button"
                onClick={() => removePhoto(i)}
                aria-label={`Remove photo ${i + 1}`}
                className="absolute top-1 right-1 flex size-7 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
        <Input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          aria-label="Add photos"
          className="h-auto py-2"
          onChange={(e) => addPhotos(e.target.files)}
        />
        <span className="text-xs text-surface-500">Photos are kept on the site for the AE202 installation proof.</span>
      </section>

      <Card className="flex flex-col gap-2 p-3">
        <Checkbox label="Something blocked work today" checked={blocked} onChange={(e) => setBlocked(e.target.checked)} />
        {blocked && (
          <>
            <Input className="h-11 text-base" placeholder="What blocked it?" value={blocker} onChange={(e) => setBlocker(e.target.value)} />
            <p className="text-[13px] text-[var(--color-warning-fg)]">
              If this pushes work past the SOV estimate, <Link className="font-semibold underline" to={`/field/sites/${id}/cr`}>raise a change request</Link>.
            </p>
          </>
        )}
      </Card>

      <FormError message={error} />
      <AsyncButton size="lg" className="w-full" onClick={() => submit()}>Submit log</AsyncButton>
    </div>
  );
}
