import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { ADMIN_ROLES, Role } from "@erp/types";
import { AsyncButton } from "../ui/async-button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card.js";
import { Checkbox } from "../ui/checkbox.js";
import { FormError } from "../ui/field.js";
import { useApi } from "../../hooks/useApi.js";
import { useMe } from "../../context/MeContext.js";
import { useToast } from "../../context/ToastContext.js";
import { api, errMsg } from "../../lib/api.js";
import { fullName } from "../../lib/format.js";
import type { Person, UserOption } from "../../lib/ericsson.js";

/** Who is on the site's field crew. Crew sign in with an email code and only see the sites they're on. */
export function SiteCrewCard({ siteId, crew, canEdit, onSaved }: { siteId: string; crew: Person[]; canEdit: boolean; onSaved: () => Promise<void> }) {
  const me = useMe();
  const toast = useToast();
  const { data: users } = useApi<UserOption[]>(canEdit ? "/users" : null);
  const crewUsers = (users ?? []).filter((u) => u.role === Role.FIELD_CREW);
  const [ids, setIds] = useState<string[]>(crew.map((c) => c.id));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setIds(crew.map((c) => c.id)), [crew]);
  const dirty = ids.slice().sort().join() !== crew.map((c) => c.id).sort().join();

  async function save() {
    setError(null);
    try {
      await api.put(`/ericsson/sites/${siteId}/crew`, { userIds: ids });
      toast("Field engineers saved");
      await onSaved();
    } catch (e) { setError(errMsg(e)); throw e; }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Field engineers (FE)</CardTitle>
        <CardDescription>Field engineers sign in with a code emailed to their work address and see only this site's work and their own expenses.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {!canEdit && <p className="text-sm">{crew.length ? crew.map(fullName).join(", ") : "Nobody assigned."}</p>}
        {canEdit && users && crewUsers.length === 0 && (
          <p className="text-sm text-surface-500">
            No field engineer users yet.{" "}
            {ADMIN_ROLES.has(me.role) ? <Link className="font-semibold text-brand-600 hover:underline" to="/admin/users">Add them under Users & roles</Link> : "Ask an admin to add them under Users & roles"}
            {" "}with the role "Field engineer (FE)".
          </p>
        )}
        {canEdit && crewUsers.map((u) => (
          <Checkbox
            key={u.id}
            label={<span>{u.firstName} {u.lastName} <span className="text-surface-500">· {u.email}</span></span>}
            checked={ids.includes(u.id)}
            onChange={(e) => setIds((cur) => (e.target.checked ? [...cur, u.id] : cur.filter((x) => x !== u.id)))}
          />
        ))}
        <FormError message={error} />
        {canEdit && crewUsers.length > 0 && <div><AsyncButton size="sm" disabled={!dirty} onClick={() => save()}>Save crew</AsyncButton></div>}
      </CardContent>
    </Card>
  );
}
