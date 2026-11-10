import { useState } from "react";

import { ChangeRequestStatus, ERICSSON_CR_DECIDE_ROLES, ERICSSON_EDIT_ROLES } from "@erp/types";
import { AsyncButton } from "../ui/async-button.js";
import { Input } from "../ui/input.js";
import { api, errMsg } from "../../lib/api.js";
import type { ChangeRequest } from "../../lib/ericsson.js";
import { useMe } from "../../context/MeContext.js";
import { useToast } from "../../context/ToastContext.js";

/** The status moves this viewer can make on a CR. Mirrors change-requests.logic.ts on the API. */
export function CrActions({ cr, onChanged }: { cr: ChangeRequest; onChanged: () => Promise<void> }) {
  const me = useMe();
  const toast = useToast();
  const [note, setNote] = useState("");
  const decide = ERICSSON_CR_DECIDE_ROLES.has(me.role);
  const isRaiser = cr.raisedById === me.id;

  async function move(to: ChangeRequestStatus, label: string) {
    try {
      await api.post(`/ericsson/change-requests/${cr.id}/transition`, { to, ...(note.trim() ? { note: note.trim() } : {}) });
      toast(label);
      setNote("");
      await onChanged();
    } catch (e) {
      toast(errMsg(e), "error");
      throw e;
    }
  }

  const buttons: { to: ChangeRequestStatus; label: string; variant: "default" | "success" | "destructive" | "secondary" }[] = [];
  if (cr.status === ChangeRequestStatus.PM_REVIEW && decide) buttons.push({ to: ChangeRequestStatus.SUBMITTED, label: "Send to Ericsson", variant: "default" });
  if (cr.status === ChangeRequestStatus.SUBMITTED && decide) {
    buttons.push({ to: ChangeRequestStatus.APPROVED, label: "Ericsson approved", variant: "success" });
    buttons.push({ to: ChangeRequestStatus.REJECTED, label: "Ericsson rejected", variant: "destructive" });
  }
  if (cr.status === ChangeRequestStatus.REJECTED && ERICSSON_EDIT_ROLES.has(me.role)) {
    buttons.push({ to: ChangeRequestStatus.PM_REVIEW, label: "Revise & resubmit", variant: "secondary" });
  }
  const open = [ChangeRequestStatus.PM_REVIEW, ChangeRequestStatus.SUBMITTED, ChangeRequestStatus.REJECTED].includes(cr.status);
  if (open && (decide || isRaiser)) buttons.push({ to: ChangeRequestStatus.WITHDRAWN, label: "Withdraw", variant: "secondary" });

  if (!buttons.length) return null;
  const decisionPending = cr.status === ChangeRequestStatus.SUBMITTED && decide;

  return (
    <div className="flex flex-col gap-2">
      {decisionPending && (
        <Input aria-label="Decision note" className="h-8 text-[13px]" placeholder="Decision note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      )}
      <div className="flex flex-wrap gap-2">
        {buttons.map((b) => (
          <AsyncButton key={b.to} size="sm" variant={b.variant} onClick={() => move(b.to, b.label)}>{b.label}</AsyncButton>
        ))}
      </div>
    </div>
  );
}
