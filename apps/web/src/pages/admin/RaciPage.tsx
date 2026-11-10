import { ROLE_LABELS, type Role } from "@erp/types";
import { Page, PageHeader } from "../../components/PageHeader.js";
import { Badge } from "../../components/ui/badge.js";
import { Card } from "../../components/ui/card.js";
import { FormError } from "../../components/ui/field.js";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow, TableScroll } from "../../components/ui/table.js";
import { useApi } from "../../hooks/useApi.js";

interface RaciRule {
  id: string; taskKey: string; task: string; rank: number;
  responsible: Role[]; accountable: Role[]; consulted: Role[]; informed: Role[];
}

function Roles({ roles, required }: { roles: Role[]; required?: boolean }) {
  if (!roles.length) return required ? <Badge tone="error">Needs owner</Badge> : <span className="text-surface-400">—</span>;
  return <>{roles.map((r) => ROLE_LABELS[r] ?? r).join(", ")}</>;
}

export default function RaciPage() {
  const { data, error } = useApi<RaciRule[]>("/raci?client=ERICSSON");

  return (
    <Page>
      <PageHeader
        kicker="Ericsson IBS · SOP Appendix B"
        title="RACI matrix"
        description="Responsible does the task, Accountable signs it off, Consulted is asked, Informed is told. Workflow actions are permitted by this matrix."
      />
      <FormError message={error} />
      <Card className="overflow-hidden">
        <TableScroll>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead><TableHead>Responsible</TableHead><TableHead>Accountable</TableHead>
                <TableHead>Consulted</TableHead><TableHead>Informed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!data && <TableEmpty colSpan={5}>Loading…</TableEmpty>}
              {data?.length === 0 && <TableEmpty colSpan={5}>No RACI rules yet. Run the database seed.</TableEmpty>}
              {data?.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-semibold">{r.task}</TableCell>
                  <TableCell><Roles roles={r.responsible} required /></TableCell>
                  <TableCell><Roles roles={r.accountable} required /></TableCell>
                  <TableCell><Roles roles={r.consulted} /></TableCell>
                  <TableCell><Roles roles={r.informed} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableScroll>
        <p className="border-t border-surface-100 px-4 py-3 text-xs text-[var(--color-warning-fg)]">
          The SOP leaves "Send any CR for approval" without a Responsible role and has no Consulted / Informed entries. Confirm these with the PM.
        </p>
      </Card>
    </Page>
  );
}
