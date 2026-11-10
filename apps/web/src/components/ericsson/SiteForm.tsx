import { useState } from "react";

import { ERICSSON_SCOPE_LABELS, EricssonScope, ROLE_LABELS, Role } from "@erp/types";
import { AsyncButton } from "../ui/async-button.js";
import { Button } from "../ui/button.js";
import { Field, FieldGrid, FormError } from "../ui/field.js";
import { Input, SelectField, Textarea } from "../ui/input.js";
import { useApi } from "../../hooks/useApi.js";
import type { UserOption } from "../../lib/ericsson.js";

export interface SiteFormValues {
  siteCode: string;
  ericssonRef: string;
  venueName: string;
  address: string;
  scope: EricssonScope;
  venueSqft: string;
  clientPmName: string;
  clientPmEmail: string;
  targetDate: string;
  notes: string;
  pmId: string;
  apmId: string;
  deliveryLeadId: string;
  coordinatorId: string;
}

export const EMPTY_SITE: SiteFormValues = {
  siteCode: "", ericssonRef: "", venueName: "", address: "", scope: EricssonScope.IBS_ICI, venueSqft: "",
  clientPmName: "", clientPmEmail: "", targetDate: "", notes: "", pmId: "", apmId: "", deliveryLeadId: "", coordinatorId: "",
};

const TEAM: { key: "pmId" | "apmId" | "deliveryLeadId" | "coordinatorId"; label: string; role: Role }[] = [
  { key: "pmId", label: "Project manager", role: Role.PROJECT_MANAGER },
  { key: "apmId", label: "Associate PM", role: Role.ASSOCIATE_PM },
  { key: "deliveryLeadId", label: "Delivery lead", role: Role.DELIVERY_LEAD },
  { key: "coordinatorId", label: "Coordinator", role: Role.COORDINATOR },
];

/**
 * Converts form strings to the API body. `forUpdate` sends cleared optional fields as
 * null (so they are cleared); on create they are simply left out.
 */
export function toSiteBody(v: SiteFormValues, forUpdate: boolean): Record<string, unknown> {
  const opt = (s: string) => (s.trim() ? s.trim() : forUpdate ? null : undefined);
  const body: Record<string, unknown> = {
    venueName: v.venueName.trim(),
    scope: v.scope,
    ericssonRef: opt(v.ericssonRef),
    address: opt(v.address),
    venueSqft: v.venueSqft.trim() ? Number(v.venueSqft) : forUpdate ? null : undefined,
    clientPmName: opt(v.clientPmName),
    clientPmEmail: opt(v.clientPmEmail),
    targetDate: opt(v.targetDate),
    notes: opt(v.notes),
    pmId: v.pmId || null,
    apmId: v.apmId || null,
    deliveryLeadId: v.deliveryLeadId || null,
    coordinatorId: v.coordinatorId || null,
  };
  if (!forUpdate) body["siteCode"] = v.siteCode.trim();
  return Object.fromEntries(Object.entries(body).filter(([, x]) => x !== undefined));
}

export function SiteForm({
  initial, mode, onSubmit, onCancel, error,
}: {
  initial: SiteFormValues;
  mode: "create" | "edit";
  onSubmit: (v: SiteFormValues) => Promise<unknown>;
  onCancel?: () => void;
  error: string | null;
}) {
  const [v, setV] = useState<SiteFormValues>(initial);
  const { data: users } = useApi<UserOption[]>("/users");
  const set = <K extends keyof SiteFormValues>(k: K, value: SiteFormValues[K]) => setV((p) => ({ ...p, [k]: value }));

  // People of the matching role first, everyone else after, so any user can be assigned.
  function options(role: Role) {
    const list = users ?? [];
    return [...list.filter((u) => u.role === role), ...list.filter((u) => u.role !== role)];
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4">
        <h2 className="text-[15px] font-bold">Site</h2>
        <FieldGrid>
          <Field label="Site ID">
            <Input value={v.siteCode} onChange={(e) => set("siteCode", e.target.value)} disabled={mode === "edit"} placeholder="e.g. E-IBS-1055" />
          </Field>
          <Field label="Ericsson reference">
            <Input value={v.ericssonRef} onChange={(e) => set("ericssonRef", e.target.value)} placeholder="Ericsson site / project number" />
          </Field>
          <Field label="Venue name">
            <Input value={v.venueName} onChange={(e) => set("venueName", e.target.value)} />
          </Field>
          <Field label="Address">
            <Input value={v.address} onChange={(e) => set("address", e.target.value)} placeholder="Street, city, state" />
          </Field>
          <Field label="Scope">
            <SelectField value={v.scope} onChange={(e) => set("scope", e.target.value as EricssonScope)}>
              {Object.values(EricssonScope).map((s) => <option key={s} value={s}>{ERICSSON_SCOPE_LABELS[s]}</option>)}
            </SelectField>
          </Field>
          <Field label="Venue size (sq ft)" hint="Walk and drive tests are quoted per square foot">
            <Input inputMode="numeric" value={v.venueSqft} onChange={(e) => set("venueSqft", e.target.value.replace(/[^\d]/g, ""))} />
          </Field>
          <Field label="Ericsson PM">
            <Input value={v.clientPmName} onChange={(e) => set("clientPmName", e.target.value)} />
          </Field>
          <Field label="Ericsson PM email">
            <Input type="email" value={v.clientPmEmail} onChange={(e) => set("clientPmEmail", e.target.value)} />
          </Field>
          <Field label="Target completion">
            <Input type="date" value={v.targetDate} onChange={(e) => set("targetDate", e.target.value)} />
          </Field>
        </FieldGrid>
        <Field label="Notes">
          <Textarea value={v.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Anything from the Ericsson assignment that matters for review" />
        </Field>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-[15px] font-bold">Team</h2>
        <FieldGrid>
          {TEAM.map((t) => (
            <Field key={t.key} label={t.label}>
              <SelectField value={v[t.key]} onChange={(e) => set(t.key, e.target.value)}>
                <option value="">Not assigned</option>
                {options(t.role).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.firstName} {u.lastName}{u.role !== t.role ? ` (${ROLE_LABELS[u.role as Role] ?? u.role})` : ""}
                  </option>
                ))}
              </SelectField>
            </Field>
          ))}
        </FieldGrid>
      </section>

      <FormError message={error} />

      <div className="flex flex-wrap gap-2">
        <AsyncButton onClick={() => onSubmit(v)}>{mode === "create" ? "Create site" : "Save changes"}</AsyncButton>
        {onCancel && <Button variant="secondary" onClick={onCancel}>Cancel</Button>}
      </div>
    </div>
  );
}
