import { useRef, useState } from "react";
import { Download } from "lucide-react";

import { ERICSSON_DOC_LABELS, ERICSSON_INTAKE_DOCS, EricssonDocType } from "@erp/types";
import { AsyncButton } from "../ui/async-button.js";
import { Badge } from "../ui/badge.js";
import { Button } from "../ui/button.js";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card.js";
import { Field, FormError } from "../ui/field.js";
import { Input, SelectField } from "../ui/input.js";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow, TableScroll } from "../ui/table.js";
import { api, errMsg } from "../../lib/api.js";
import { downloadFile } from "../../lib/download.js";
import { dateTime, fileSize, fullName } from "../../lib/format.js";
import type { SiteDocument } from "../../lib/ericsson.js";
import { useToast } from "../../context/ToastContext.js";

function download(doc: SiteDocument) {
  return downloadFile(`/ericsson/documents/${doc.id}/download`, doc.fileName);
}

export function DocumentsSection({
  siteId, documents, canEdit, onChanged,
}: { siteId: string; documents: SiteDocument[]; canEdit: boolean; onChanged: () => Promise<void> }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<EricssonDocType>(EricssonDocType.SOV);
  const [error, setError] = useState<string | null>(null);

  const present = new Set(documents.map((d) => d.type));

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose a file first.");
      throw new Error("validation");
    }
    setError(null);
    const form = new FormData();
    form.append("type", type); // must come before the file
    form.append("file", file);
    try {
      await api.post(`/ericsson/sites/${siteId}/documents`, form);
      if (fileRef.current) fileRef.current.value = "";
      toast(`${ERICSSON_DOC_LABELS[type]} uploaded`);
      await onChanged();
    } catch (e) {
      setError(errMsg(e));
      throw e;
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        {ERICSSON_INTAKE_DOCS.map((t) => (
          <Badge key={t} tone={present.has(t) ? "success" : "error"}>{t}: {present.has(t) ? "uploaded" : "missing"}</Badge>
        ))}
      </div>

      {canEdit && (
        <Card>
          <CardHeader><CardTitle>Upload a document</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Type" className="w-64">
                <SelectField value={type} onChange={(e) => setType(e.target.value as EricssonDocType)}>
                  {Object.values(EricssonDocType).map((t) => <option key={t} value={t}>{ERICSSON_DOC_LABELS[t]}</option>)}
                </SelectField>
              </Field>
              <Field label="File" className="min-w-64 flex-1" hint="PDF, image, Word, Excel or CSV · 25 MB max">
                <Input ref={fileRef} type="file" className="h-auto py-1.5" />
              </Field>
              <AsyncButton onClick={() => upload()}>Upload</AsyncButton>
            </div>
            <FormError message={error} />
          </CardContent>
        </Card>
      )}

      <Card className="overflow-hidden">
        <TableScroll>
          <Table stack>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>File</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead>By</TableHead>
                <TableHead><span className="sr-only">Download</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.length === 0 && <TableEmpty colSpan={6}>No documents yet.</TableEmpty>}
              {documents.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-semibold">{ERICSSON_DOC_LABELS[d.type as EricssonDocType] ?? d.type}</TableCell>
                  <TableCell>{d.fileName} <span className="text-surface-500">· {fileSize(d.sizeBytes)}</span></TableCell>
                  <TableCell>v{d.version}</TableCell>
                  <TableCell className="whitespace-nowrap">{dateTime(d.uploadedAt)}</TableCell>
                  <TableCell className="whitespace-nowrap">{fullName(d.uploadedBy)}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" aria-label={`Download ${d.fileName}`} onClick={() => void download(d).catch(() => toast("Download failed", "error"))}>
                      <Download size={16} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableScroll>
      </Card>
    </div>
  );
}
