import { useState } from "react";
import { Link } from "react-router-dom";

import { CR_STATUS_LABELS, CR_TYPE_LABELS, ChangeRequestStatus, ChangeRequestType } from "@erp/types";
import { Page, PageHeader } from "../../components/PageHeader.js";
import { CrActions } from "../../components/ericsson/CrActions.js";
import { Badge } from "../../components/ui/badge.js";
import { Card } from "../../components/ui/card.js";
import { FormError } from "../../components/ui/field.js";
import { Chips } from "../../components/ui/tabs.js";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow, TableScroll } from "../../components/ui/table.js";
import { useApi } from "../../hooks/useApi.js";
import { date, fullName, money } from "../../lib/format.js";
import { crLabel, crTone, type ChangeRequest } from "../../lib/ericsson.js";

type Filter = "OPEN" | "ALL" | ChangeRequestStatus;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "OPEN", label: "Open" },
  { value: ChangeRequestStatus.PM_REVIEW, label: "PM review" },
  { value: ChangeRequestStatus.SUBMITTED, label: "Awaiting Ericsson" },
  { value: ChangeRequestStatus.APPROVED, label: "Approved" },
  { value: ChangeRequestStatus.REJECTED, label: "Rejected" },
  { value: "ALL", label: "All" },
];

export default function ChangeRequestsPage() {
  const [filter, setFilter] = useState<Filter>("OPEN");
  const { data, error, loading, reload } = useApi<ChangeRequest[]>("/ericsson/change-requests");

  const rows = (data ?? []).filter((c) =>
    filter === "ALL" ? true
      : filter === "OPEN" ? c.status === ChangeRequestStatus.PM_REVIEW || c.status === ChangeRequestStatus.SUBMITTED
      : c.status === filter,
  );
  const openValue = (data ?? [])
    .filter((c) => c.status === ChangeRequestStatus.PM_REVIEW || c.status === ChangeRequestStatus.SUBMITTED)
    .reduce((s, c) => s + Number(c.total), 0);

  return (
    <Page>
      <PageHeader
        kicker="Ericsson IBS · SOP steps 6 & 8"
        title="Change requests"
        description={`Every CR across all sites. Open value: ${money(openValue, true)}. Raise new CRs from the site's page.`}
      />
      <Chips options={FILTERS} value={filter} onChange={setFilter} />
      <FormError message={error} />
      <Card className="overflow-hidden">
        <TableScroll>
          <Table stack>
            <TableHeader>
              <TableRow>
                <TableHead>CR</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Title</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Raised</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && !data && <TableEmpty colSpan={8}>Loading…</TableEmpty>}
              {data && rows.length === 0 && <TableEmpty colSpan={8}>No change requests here.</TableEmpty>}
              {rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="whitespace-nowrap font-semibold">{crLabel(c.number)}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {c.site && <Link className="font-semibold text-brand-600 hover:underline" to={`/ericsson/sites/${c.site.id}?tab=crs`}>{c.site.siteCode}</Link>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{CR_TYPE_LABELS[c.type as ChangeRequestType]}</TableCell>
                  <TableCell className="min-w-48">{c.title}</TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">{money(c.total, true)}</TableCell>
                  <TableCell><Badge tone={crTone(c.status)}>{CR_STATUS_LABELS[c.status]}</Badge></TableCell>
                  <TableCell className="whitespace-nowrap">{date(c.createdAt)}<div className="text-xs text-surface-500">{fullName(c.raisedBy)}</div></TableCell>
                  <TableCell className="min-w-64"><CrActions cr={c} onChanged={reload} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableScroll>
      </Card>
    </Page>
  );
}
