import { CR_STATUS_LABELS, CR_TYPE_LABELS, type ChangeRequestType } from "@erp/types";
import { Badge } from "../ui/badge.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card.js";
import { date, fullName, money } from "../../lib/format.js";
import { crLabel, crTone, type ChangeRequest } from "../../lib/ericsson.js";
import { CrActions } from "./CrActions.js";
import { RaiseCrForm } from "./RaiseCrForm.js";

/** SOP steps 6 and 8, for one site: raise CRs and move them through approval. */
export function ChangeRequestsSection({
  siteId, crs, canEdit, closed, onChanged,
}: { siteId: string; crs: ChangeRequest[]; canEdit: boolean; closed: boolean; onChanged: () => Promise<void> }) {
  return (
    <div className="flex flex-col gap-5">
      {crs.length === 0 && <p className="text-sm text-surface-500">No change requests on this site.</p>}
      {crs.map((cr) => (
        <Card key={cr.id}>
          <CardContent className="flex flex-col gap-3 pt-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-surface-500">{crLabel(cr.number)} · {CR_TYPE_LABELS[cr.type as ChangeRequestType]}</div>
                <div className="text-base font-bold">{cr.title}</div>
                <div className="text-xs text-surface-500">Raised by {fullName(cr.raisedBy)} on {date(cr.createdAt)}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-base font-bold tabular-nums">{money(cr.total, true)}</span>
                <Badge tone={crTone(cr.status)}>{CR_STATUS_LABELS[cr.status]}</Badge>
              </div>
            </div>
            <p className="whitespace-pre-line text-sm">{cr.reason}</p>
            {Number(cr.vendorQuote) > 0 && (
              <p className="text-xs text-surface-500">
                Vendor quote {money(cr.vendorQuote, true)} + {Number(cr.passThroughPct)}% pass-through
                {Number(cr.amount) > 0 && ` + ${money(cr.amount, true)} Integer labor`}
              </p>
            )}
            {cr.decisionNote && <p className="text-xs text-surface-500">Decision note: {cr.decisionNote}</p>}
            <CrActions cr={cr} onChanged={onChanged} />
          </CardContent>
        </Card>
      ))}

      {canEdit && !closed && (
        <Card>
          <CardHeader>
            <CardTitle>Raise a change request</CardTitle>
            <CardDescription>For work beyond the SOV: extra visits or days, scope changes, sub-vendor work or extra materials.</CardDescription>
          </CardHeader>
          <CardContent>
            <RaiseCrForm siteId={siteId} onRaised={onChanged} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
