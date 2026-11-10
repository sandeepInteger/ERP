import { useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";

import {
  CR_OPEN_STATUSES, ERICSSON_EDIT_ROLES, ERICSSON_SCOPE_LABELS, EricssonScope, EricssonStep, VSS_OUTCOME_LABELS, type VssOutcome,
} from "@erp/types";
import { Page, PageHeader } from "../../components/PageHeader.js";
import { ActionPanel } from "../../components/ericsson/ActionPanel.js";
import { ChangeRequestsSection } from "../../components/ericsson/ChangeRequestsSection.js";
import { DailyLogSection } from "../../components/ericsson/DailyLogSection.js";
import { DocumentsSection } from "../../components/ericsson/DocumentsSection.js";
import { MaterialsSection } from "../../components/ericsson/MaterialsSection.js";
import { SiteForm, toSiteBody, type SiteFormValues } from "../../components/ericsson/SiteForm.js";
import { StepBadge } from "../../components/ericsson/StepBadge.js";
import { StepTracker } from "../../components/ericsson/StepTracker.js";
import { VerificationSection } from "../../components/ericsson/VerificationSection.js";
import { Badge } from "../../components/ui/badge.js";
import { Button } from "../../components/ui/button.js";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card.js";
import { FormError } from "../../components/ui/field.js";
import { Tabs } from "../../components/ui/tabs.js";
import { useApi } from "../../hooks/useApi.js";
import { useMe } from "../../context/MeContext.js";
import { usePageBack } from "../../context/PageBackContext.js";
import { useToast } from "../../context/ToastContext.js";
import { api, errMsg } from "../../lib/api.js";
import { date, dateTime, fullName, money } from "../../lib/format.js";
import type { Person, SiteDetail } from "../../lib/ericsson.js";

type Tab = "overview" | "documents" | "verification" | "materials" | "crs" | "log" | "activity";

function Facts({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(0,9rem)_1fr] gap-x-4 gap-y-2.5 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-surface-500">{k}</dt>
          <dd className="m-0 min-w-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const name = (p: Person | null) => (p ? fullName(p) : "Not assigned");

function toForm(s: SiteDetail): SiteFormValues {
  return {
    siteCode: s.siteCode, ericssonRef: s.ericssonRef ?? "", venueName: s.venueName, address: s.address ?? "",
    scope: s.scope as EricssonScope, venueSqft: s.venueSqft ? String(s.venueSqft) : "", clientPmName: s.clientPmName ?? "",
    clientPmEmail: s.clientPmEmail ?? "", targetDate: s.targetDate ? s.targetDate.slice(0, 10) : "", notes: s.notes ?? "",
    pmId: s.pm?.id ?? "", apmId: s.apm?.id ?? "", deliveryLeadId: s.deliveryLead?.id ?? "", coordinatorId: s.coordinator?.id ?? "",
  };
}

export default function SiteDetailPage() {
  usePageBack("/ericsson/sites", "Site tracker");
  const { id } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const me = useMe();
  const toast = useToast();
  const { data: site, setData, error, reload } = useApi<SiteDetail>(`/ericsson/sites/${id}`);
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const tab = (params.get("tab") as Tab | null) ?? "overview";
  const setTab = (t: Tab) => setParams(t === "overview" ? {} : { tab: t }, { replace: true });
  const canEdit = ERICSSON_EDIT_ROLES.has(me.role);

  if (error) return <Page><FormError message={error} /></Page>;
  if (!site) return <Page><p className="text-surface-500">Loading…</p></Page>;

  const openCrs = site.changeRequests.filter((c) => CR_OPEN_STATUSES.has(c.status));
  const openDisc = site.discrepancies.filter((d) => !d.isResolved).length;
  const approvedCrs = site.changeRequests.filter((c) => c.status === "APPROVED").reduce((s, c) => s + Number(c.total), 0);
  const pendingCrs = openCrs.reduce((s, c) => s + Number(c.total), 0);

  async function save(v: SiteFormValues) {
    setEditError(null);
    try {
      await api.patch(`/ericsson/sites/${site!.id}`, toSiteBody(v, true));
      toast("Site updated");
      setEditing(false);
      await reload();
    } catch (e) {
      setEditError(errMsg(e));
      throw e;
    }
  }

  return (
    <Page>
      <PageHeader
        kicker={`Ericsson IBS · ${ERICSSON_SCOPE_LABELS[site.scope as EricssonScope] ?? site.scope}`}
        title={<span className="flex flex-wrap items-center gap-3">{site.siteCode} · {site.venueName} <StepBadge step={site.step} /></span>}
        description={[
          site.rfxNumber && `RFX ${site.rfxNumber}`,
          site.sovValue && `SOV ${money(site.sovValue)}`,
          `${site.daysInStep} d in this step`,
          site.targetDate && `Target ${date(site.targetDate)}`,
        ].filter(Boolean).join(" · ")}
      />

      <Card>
        <CardContent className="flex flex-col gap-4 pt-5">
          <StepTracker step={site.step} />
          {openCrs.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--color-warning-bg)] bg-[var(--color-warning-bg)]/40 px-4 py-3 text-sm">
              <Badge tone="warning">Parallel track</Badge>
              <span className="flex-1">{openCrs.length} open change {openCrs.length === 1 ? "request" : "requests"} · {money(pendingCrs, true)} pending</span>
              <Button size="sm" variant="secondary" onClick={() => setTab("crs")}>View CRs</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "overview", label: "Overview" },
          { value: "documents", label: "Documents", count: site.documents.length },
          { value: "verification", label: "Verification", count: openDisc },
          { value: "materials", label: "Materials", count: site.materials.length },
          { value: "crs", label: "Change requests", count: openCrs.length },
          { value: "log", label: "Daily log", count: site.dailyLogs.length },
          { value: "activity", label: "Activity" },
        ]}
      />

      {tab === "overview" && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="flex flex-col gap-5">
            {editing ? (
              <Card className="p-6">
                <SiteForm initial={toForm(site)} mode="edit" onSubmit={save} onCancel={() => setEditing(false)} error={editError} />
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle>Site & team</CardTitle>
                    {canEdit && <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Edit</Button>}
                  </div>
                </CardHeader>
                <CardContent>
                  <Facts rows={[
                    ["Ericsson ref", site.ericssonRef ?? "—"],
                    ["Address", site.address ?? "—"],
                    ["Venue size", site.venueSqft ? `${site.venueSqft.toLocaleString("en-US")} sq ft` : "—"],
                    ["Ericsson PM", site.clientPmName ? `${site.clientPmName}${site.clientPmEmail ? ` · ${site.clientPmEmail}` : ""}` : "—"],
                    ["PM", name(site.pm)],
                    ["Associate PM", name(site.apm)],
                    ["Delivery lead", name(site.deliveryLead)],
                    ["Coordinator", name(site.coordinator)],
                    ["Notes", site.notes ? <span className="whitespace-pre-line">{site.notes}</span> : "—"],
                  ]} />
                </CardContent>
              </Card>
            )}
            <Card>
              <CardHeader><CardTitle>Milestones & money</CardTitle></CardHeader>
              <CardContent>
                <Facts rows={[
                  ["SOV", site.sovAcceptedAt ? `v${site.sovVersion} · ${money(site.sovValue)} · accepted ${date(site.sovAcceptedAt)}` : "Not accepted"],
                  ["RFX", site.rfxAcceptedAt ? `${site.rfxNumber} · accepted ${date(site.rfxAcceptedAt)}` : site.rfxRequestedAt ? `Requested ${date(site.rfxRequestedAt)}` : "—"],
                  ["Execution", site.executionStartedAt ? `Started ${date(site.executionStartedAt)}${site.sowCompletedAt ? ` · SOW complete ${date(site.sowCompletedAt)}` : ""}` : "—"],
                  ["VSS", site.vssOutcome ? `${date(site.vssDate)} · ${VSS_OUTCOME_LABELS[site.vssOutcome as VssOutcome]}` : "—"],
                  ["AE202", site.ae202StampedAt ? `Stamped ${date(site.ae202StampedAt)}` : site.ae202SubmittedAt ? `Submitted ${date(site.ae202SubmittedAt)}` : "—"],
                  ["Invoice", site.invoiceApprovedAt ? `${site.srmInvoiceNumber} · approved ${date(site.invoiceApprovedAt)}` : site.invoiceUploadedAt ? `${site.srmInvoiceNumber} · uploaded ${date(site.invoiceUploadedAt)}` : "—"],
                  ["Approved CRs", money(approvedCrs, true)],
                  ["Pending CRs", money(pendingCrs, true)],
                  ["Verification loops", String(site.verificationLoops)],
                ]} />
              </CardContent>
            </Card>
          </div>
          <ActionPanel site={site} onUpdated={setData} />
        </div>
      )}

      {tab === "documents" && <DocumentsSection siteId={site.id} documents={site.documents} canEdit={canEdit} onChanged={reload} />}
      {tab === "verification" && (
        <VerificationSection siteId={site.id} discrepancies={site.discrepancies} queries={site.clientQueries} loops={site.verificationLoops} canEdit={canEdit} onChanged={reload} />
      )}
      {tab === "materials" && <MaterialsSection siteId={site.id} materials={site.materials} canEdit={canEdit} onChanged={reload} />}
      {tab === "crs" && (
        <ChangeRequestsSection siteId={site.id} crs={site.changeRequests} canEdit={canEdit} closed={site.step === EricssonStep.CLOSED} onChanged={reload} />
      )}
      {tab === "log" && <DailyLogSection siteId={site.id} logs={site.dailyLogs} canEdit={canEdit} onChanged={reload} />}
      {tab === "activity" && (
        <Card>
          <CardContent className="pt-2">
            <ul className="flex flex-col">
              {site.events.map((e) => (
                <li key={e.id} className="flex flex-wrap gap-x-4 gap-y-0.5 border-b border-surface-100 py-3 text-sm last:border-0">
                  <span className="w-32 shrink-0 text-surface-500">{dateTime(e.createdAt)}</span>
                  <span className="min-w-0 flex-1"><strong>{e.actor ? fullName(e.actor) : "System"}</strong> · {e.message}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </Page>
  );
}
