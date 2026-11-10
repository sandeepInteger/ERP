import { useState } from "react";
import { Lock, CircleAlert } from "lucide-react";

import { ERICSSON_STEPS, EricssonAction, EricssonStep, VSS_OUTCOME_LABELS, VssOutcome } from "@erp/types";
import { AsyncButton } from "../ui/async-button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card.js";
import { Field, FormError } from "../ui/field.js";
import { Input, SelectField } from "../ui/input.js";
import { api, errBlockers, errMsg } from "../../lib/api.js";
import { todayIso } from "../../lib/format.js";
import type { AvailableAction, SiteDetail } from "../../lib/ericsson.js";
import { useToast } from "../../context/ToastContext.js";

/** Extra inputs some actions need; keyed by action. */
type Inputs = Record<string, string>;

const DEFAULTS: Partial<Record<EricssonAction, Inputs>> = {
  [EricssonAction.ACCEPT_SOV]: { sovValue: "", sovVersion: "1" },
  [EricssonAction.RECORD_RFX]: { rfxNumber: "", receivedOn: todayIso() },
  [EricssonAction.RECORD_VSS]: { vssDate: todayIso(), outcome: VssOutcome.PASSED },
  [EricssonAction.UPLOAD_INVOICE]: { srmInvoiceNumber: "" },
};

function bodyFor(action: EricssonAction, i: Inputs): Record<string, unknown> | string {
  switch (action) {
    case EricssonAction.ACCEPT_SOV: {
      const sovValue = Number(i["sovValue"]);
      const sovVersion = Number(i["sovVersion"]);
      if (!(sovValue > 0)) return "Enter the SOV value.";
      if (!(sovVersion >= 1)) return "Enter the SOV version.";
      return { action, sovValue, sovVersion };
    }
    case EricssonAction.RECORD_RFX:
      if (!i["rfxNumber"]?.trim()) return "Enter the RFX number.";
      return { action, rfxNumber: i["rfxNumber"].trim(), receivedOn: i["receivedOn"] };
    case EricssonAction.RECORD_VSS:
      return { action, vssDate: i["vssDate"], outcome: i["outcome"] };
    case EricssonAction.UPLOAD_INVOICE:
      if (!i["srmInvoiceNumber"]?.trim()) return "Enter the SRM invoice number.";
      return { action, srmInvoiceNumber: i["srmInvoiceNumber"].trim() };
    default:
      return { action };
  }
}

function ActionInputs({ action, inputs, set }: { action: EricssonAction; inputs: Inputs; set: (k: string, v: string) => void }) {
  switch (action) {
    case EricssonAction.ACCEPT_SOV:
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="SOV value (USD)">
            <Input inputMode="decimal" value={inputs["sovValue"] ?? ""} onChange={(e) => set("sovValue", e.target.value.replace(/[^\d.]/g, ""))} />
          </Field>
          <Field label="SOV version">
            <Input inputMode="numeric" value={inputs["sovVersion"] ?? ""} onChange={(e) => set("sovVersion", e.target.value.replace(/[^\d]/g, ""))} />
          </Field>
        </div>
      );
    case EricssonAction.RECORD_RFX:
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="RFX number">
            <Input value={inputs["rfxNumber"] ?? ""} onChange={(e) => set("rfxNumber", e.target.value)} placeholder="e.g. RFX-77150" />
          </Field>
          <Field label="Received on">
            <Input type="date" value={inputs["receivedOn"] ?? ""} onChange={(e) => set("receivedOn", e.target.value)} />
          </Field>
        </div>
      );
    case EricssonAction.RECORD_VSS:
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="VSS date">
            <Input type="date" value={inputs["vssDate"] ?? ""} onChange={(e) => set("vssDate", e.target.value)} />
          </Field>
          <Field label="Outcome">
            <SelectField value={inputs["outcome"] ?? ""} onChange={(e) => set("outcome", e.target.value)}>
              {Object.values(VssOutcome).map((o) => <option key={o} value={o}>{VSS_OUTCOME_LABELS[o]}</option>)}
            </SelectField>
          </Field>
        </div>
      );
    case EricssonAction.UPLOAD_INVOICE:
      return (
        <Field label="SRM invoice number">
          <Input value={inputs["srmInvoiceNumber"] ?? ""} onChange={(e) => set("srmInvoiceNumber", e.target.value)} />
        </Field>
      );
    default:
      return null;
  }
}

function ActionRow({ a, siteId, onDone }: { a: AvailableAction; siteId: string; onDone: (s: SiteDetail) => void }) {
  const toast = useToast();
  const [inputs, setInputs] = useState<Inputs>(DEFAULTS[a.action] ?? {});
  const [error, setError] = useState<string | null>(null);
  const [serverBlockers, setServerBlockers] = useState<string[]>([]);
  const blockers = serverBlockers.length ? serverBlockers : a.blockers;
  const ready = a.allowed && blockers.length === 0;

  async function run() {
    const body = bodyFor(a.action, inputs);
    if (typeof body === "string") {
      setError(body);
      throw new Error("validation");
    }
    setError(null);
    try {
      const { data } = await api.post<SiteDetail>(`/ericsson/sites/${siteId}/actions`, body);
      setServerBlockers([]);
      toast(`${a.label}: done`);
      onDone(data);
    } catch (e) {
      setError(errMsg(e));
      setServerBlockers(errBlockers(e));
      throw e;
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-surface-200 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">{a.label}</span>
        {!a.allowed && (
          <span className="flex items-center gap-1 text-xs text-surface-500"><Lock size={12} aria-hidden="true" /> Not your role</span>
        )}
      </div>
      {a.allowed && <ActionInputs action={a.action} inputs={inputs} set={(k, v) => setInputs((p) => ({ ...p, [k]: v }))} />}
      {blockers.length > 0 && (
        <ul className="flex flex-col gap-1 text-[13px] text-[var(--color-warning-fg)]">
          {blockers.map((b) => (
            <li key={b} className="flex items-start gap-1.5"><CircleAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" /> {b}</li>
          ))}
        </ul>
      )}
      <FormError message={error && !serverBlockers.length ? error : null} />
      {a.allowed && (
        <div>
          <AsyncButton disabled={!ready} onClick={() => run()}>{a.label}</AsyncButton>
        </div>
      )}
    </div>
  );
}

/** What can be done at the site's current step, by whom, and what is still in the way. */
export function ActionPanel({ site, onUpdated }: { site: SiteDetail; onUpdated: (s: SiteDetail) => void }) {
  if (site.step === EricssonStep.CLOSED) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Site closed</CardTitle>
          <CardDescription>Invoice approved and every change request settled.</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  const info = ERICSSON_STEPS[site.step];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Next: step {info.sop} · {info.label}</CardTitle>
        <CardDescription>Actions follow the RACI matrix; blockers come from the SOP.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {site.actions.map((a) => (
          // Keyed by step too, so inputs reset when the site moves on.
          <ActionRow key={`${site.step}-${a.action}`} a={a} siteId={site.id} onDone={onUpdated} />
        ))}
      </CardContent>
    </Card>
  );
}
