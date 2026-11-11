import { useState } from "react";

import { ADMIN_ROLES, ALL_ROLES, ALWAYS_ACT, ERICSSON_ACTIONS, ERICSSON_STEPS, ROLE_LABELS, type EricssonAction, type Role } from "@erp/types";
import { Page, PageHeader } from "../../components/PageHeader.js";
import { AsyncButton } from "../../components/ui/async-button.js";
import { Badge } from "../../components/ui/badge.js";
import { Button } from "../../components/ui/button.js";
import { Card, CardDescription, CardHeader, CardTitle } from "../../components/ui/card.js";
import { Checkbox } from "../../components/ui/checkbox.js";
import { FormError } from "../../components/ui/field.js";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow, TableScroll } from "../../components/ui/table.js";
import { useApi } from "../../hooks/useApi.js";
import { useMe } from "../../context/MeContext.js";
import { useToast } from "../../context/ToastContext.js";
import { api, errMsg } from "../../lib/api.js";

interface RaciRule {
  id: string; taskKey: string; task: string; rank: number;
  responsible: Role[]; accountable: Role[]; consulted: Role[]; informed: Role[];
}
type Col = "responsible" | "accountable" | "consulted" | "informed";
const COLS: { key: Col; label: string; required?: boolean }[] = [
  { key: "responsible", label: "Responsible", required: true },
  { key: "accountable", label: "Accountable", required: true },
  { key: "consulted", label: "Consulted" },
  { key: "informed", label: "Informed" },
];

function Roles({ roles, required }: { roles: Role[]; required?: boolean | undefined }) {
  if (!roles.length) return required ? <Badge tone="error">Needs owner</Badge> : <span className="text-surface-400">—</span>;
  return <>{roles.map((r) => ROLE_LABELS[r] ?? r).join(", ")}</>;
}

function EditRow({ rule, onDone }: { rule: RaciRule; onDone: (saved: boolean) => Promise<void> }) {
  const toast = useToast();
  const [draft, setDraft] = useState<Record<Col, Role[]>>({
    responsible: rule.responsible, accountable: rule.accountable, consulted: rule.consulted, informed: rule.informed,
  });
  const [error, setError] = useState<string | null>(null);
  const toggle = (col: Col, role: Role, on: boolean) =>
    setDraft((d) => ({ ...d, [col]: on ? [...d[col], role] : d[col].filter((r) => r !== role) }));

  async function save() {
    setError(null);
    try {
      await api.put(`/raci/${rule.id}`, draft);
      toast(`${rule.task}: saved`);
      await onDone(true);
    } catch (e) { setError(errMsg(e)); throw e; }
  }

  return (
    <TableRow>
      <TableCell colSpan={6} className="bg-surface-50">
        <div className="mb-3 font-semibold">{rule.task}</div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {COLS.map((c) => (
            <fieldset key={c.key} className="flex flex-col">
              <legend className="mb-1 text-[11px] font-bold uppercase tracking-wider text-surface-500">{c.label}</legend>
              {ALL_ROLES.map((role) => (
                <Checkbox key={role} className="min-h-8" label={ROLE_LABELS[role]} checked={draft[c.key].includes(role)} onChange={(e) => toggle(c.key, role, e.target.checked)} />
              ))}
            </fieldset>
          ))}
        </div>
        <FormError message={error} />
        <div className="mt-3 flex gap-2">
          <AsyncButton size="sm" onClick={() => save()}>Save</AsyncButton>
          <Button size="sm" variant="secondary" onClick={() => void onDone(false)}>Cancel</Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export default function RaciPage() {
  const me = useMe();
  const isAdmin = ADMIN_ROLES.has(me.role);
  const { data, error, reload } = useApi<RaciRule[]>("/raci?client=ERICSSON");
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <Page>
      <PageHeader
        kicker="Ericsson IBS · SOP Appendix B"
        title="RACI matrix"
        description="Responsible does the task, Accountable signs it off, Consulted is asked, Informed is told. Consulted and Informed are notified automatically when the matching workflow step happens."
      />
      <FormError message={error} />
      <Card className="overflow-hidden">
        <TableScroll>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                {COLS.map((c) => <TableHead key={c.key}>{c.label}</TableHead>)}
                <TableHead><span className="sr-only">Edit</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!data && <TableEmpty colSpan={6}>Loading…</TableEmpty>}
              {data?.length === 0 && <TableEmpty colSpan={6}>No RACI rules yet. Run the database seed.</TableEmpty>}
              {data?.map((r) =>
                editing === r.id ? (
                  <EditRow key={r.id} rule={r} onDone={async (saved) => { setEditing(null); if (saved) await reload(); }} />
                ) : (
                  <TableRow key={r.id}>
                    <TableCell className="font-semibold">{r.task}</TableCell>
                    {COLS.map((c) => <TableCell key={c.key}><Roles roles={r[c.key]} required={c.required} /></TableCell>)}
                    <TableCell className="text-right">
                      {isAdmin && <Button size="sm" variant="secondary" disabled={editing !== null} onClick={() => setEditing(r.id)}>Edit</Button>}
                    </TableCell>
                  </TableRow>
                ),
              )}
            </TableBody>
          </Table>
        </TableScroll>
        <p className="border-t border-surface-100 px-4 py-3 text-xs text-[var(--color-warning-fg)]">
          The SOP leaves "Send any CR for approval" without a Responsible role and has no Consulted / Informed entries. Confirm these with the PM.
        </p>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Who can press each workflow button</CardTitle>
          <CardDescription>
            Set in code from the matrix above, because it also decides who gets each task in My work. To change it, ask a developer
            (packages/types/src/ericsson.ts, ERICSSON_ACTIONS). {[...ALWAYS_ACT].map((r) => ROLE_LABELS[r as Role]).join(" and ")} can always act.
          </CardDescription>
        </CardHeader>
        <TableScroll>
          <Table>
            <TableHeader>
              <TableRow><TableHead>Step</TableHead><TableHead>Button</TableHead><TableHead>Roles</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {(Object.keys(ERICSSON_ACTIONS) as EricssonAction[]).map((a) => {
                const def = ERICSSON_ACTIONS[a];
                return (
                  <TableRow key={a}>
                    <TableCell className="whitespace-nowrap">{ERICSSON_STEPS[def.step].sop} · {ERICSSON_STEPS[def.step].short}</TableCell>
                    <TableCell className="font-semibold">{def.label}</TableCell>
                    <TableCell>{def.roles.map((r) => ROLE_LABELS[r]).join(", ")}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableScroll>
      </Card>
    </Page>
  );
}
