import { useState } from "react";

import { ADMIN_ROLES, ALL_ROLES, ROLE_LABELS, Role } from "@erp/types";
import { Page, PageHeader } from "../../components/PageHeader.js";
import { AsyncButton } from "../../components/ui/async-button.js";
import { Badge } from "../../components/ui/badge.js";
import { Button } from "../../components/ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card.js";
import { Field, FormError } from "../../components/ui/field.js";
import { Input, SelectField } from "../../components/ui/input.js";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow, TableScroll } from "../../components/ui/table.js";
import { useApi } from "../../hooks/useApi.js";
import { useMe } from "../../context/MeContext.js";
import { useToast } from "../../context/ToastContext.js";
import { api, errMsg } from "../../lib/api.js";
import { dateTime } from "../../lib/format.js";

interface UserRow {
  id: string; email: string; firstName: string; lastName: string; designation: string | null;
  role: Role; isActive: boolean; lastLoginAt: string | null;
}

const EMPTY = { email: "", firstName: "", lastName: "", designation: "", role: Role.COORDINATOR as Role };

export default function UsersPage() {
  const me = useMe();
  const toast = useToast();
  const { data, error, reload } = useApi<UserRow[]>("/users?all=true");
  const [form, setForm] = useState(EMPTY);
  const [formError, setFormError] = useState<string | null>(null);

  if (!ADMIN_ROLES.has(me.role)) {
    return <Page><PageHeader title="Users & roles" description="Only admins can manage users." /></Page>;
  }

  async function add() {
    if (!form.email.trim() || !form.firstName.trim() || !form.lastName.trim()) {
      setFormError("Email, first name and last name are required.");
      throw new Error("validation");
    }
    setFormError(null);
    try {
      await api.post("/users", {
        email: form.email.trim(), firstName: form.firstName.trim(), lastName: form.lastName.trim(), role: form.role,
        ...(form.designation.trim() ? { designation: form.designation.trim() } : {}),
      });
      toast(`${form.firstName} can now sign in with Microsoft`);
      setForm(EMPTY);
      await reload();
    } catch (e) { setFormError(errMsg(e)); throw e; }
  }

  async function update(u: UserRow, patch: Partial<Pick<UserRow, "role" | "isActive">>) {
    try {
      await api.patch(`/users/${u.id}`, patch);
      toast(`${u.firstName} ${u.lastName} updated`);
      await reload();
    } catch (e) { toast(errMsg(e), "error"); }
  }

  return (
    <Page>
      <PageHeader
        kicker="Admin"
        title="Users & roles"
        description="People sign in with their Microsoft work account. Add them here first; their role decides what they can do."
      />

      <Card>
        <CardHeader>
          <CardTitle>Add a user</CardTitle>
          <CardDescription>Use the email they sign in to Microsoft with.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Work email" className="lg:col-span-2"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="First name"><Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></Field>
            <Field label="Last name"><Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></Field>
            <Field label="Role">
              <SelectField value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                {ALL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </SelectField>
            </Field>
            <Field label="Designation (optional)" className="lg:col-span-2"><Input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} /></Field>
          </div>
          <FormError message={formError} />
          <div><AsyncButton onClick={() => add()}>Add user</AsyncButton></div>
        </CardContent>
      </Card>

      <FormError message={error} />
      <Card className="overflow-hidden">
        <TableScroll>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead>
                <TableHead>Last sign-in</TableHead><TableHead>Status</TableHead><TableHead><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!data && <TableEmpty colSpan={6}>Loading…</TableEmpty>}
              {data?.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-semibold">{u.firstName} {u.lastName}{u.designation && <div className="text-xs font-normal text-surface-500">{u.designation}</div>}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
                    <SelectField aria-label={`Role of ${u.firstName}`} className="h-8 w-48" value={u.role} disabled={u.id === me.id} onChange={(e) => void update(u, { role: e.target.value as Role })}>
                      {ALL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </SelectField>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{u.lastLoginAt ? dateTime(u.lastLoginAt) : "Never"}</TableCell>
                  <TableCell>{u.isActive ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}</TableCell>
                  <TableCell className="text-right">
                    {u.id !== me.id && (
                      <Button size="sm" variant="secondary" onClick={() => void update(u, { isActive: !u.isActive })}>
                        {u.isActive ? "Deactivate" : "Reactivate"}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableScroll>
      </Card>
    </Page>
  );
}
