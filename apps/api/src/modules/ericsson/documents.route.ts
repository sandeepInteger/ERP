import type { FastifyInstance } from "fastify";
import type { EricssonDocType as DbDocType } from "@prisma/client";
import { z } from "zod";

import { ERICSSON_DOC_LABELS, EricssonDocType } from "@erp/types";
import { httpError, notFound } from "../../lib/http.js";
import { ALLOWED_MIME_TYPES, openFile, saveFile } from "../../lib/storage.js";
import { assertCanEdit, assertSite, logEvent } from "./ericsson.shared.js";

const IdParams = z.object({ id: z.string().min(1) });
const DocParams = z.object({ docId: z.string().min(1) });

export async function ericssonDocumentsRoute(app: FastifyInstance) {
  const guard = { preHandler: app.authenticate };

  // multipart/form-data: a "type" field (EricssonDocType) followed by one "file".
  app.post("/api/ericsson/sites/:id/documents", guard, async (req, reply) => {
    assertCanEdit(req.user.role);
    const { id } = IdParams.parse(req.params);
    const site = await assertSite(app, id);

    const file = await req.file();
    if (!file) throw httpError(400, "Attach a file");
    const typeField = file.fields["type"];
    const rawType = typeField && !Array.isArray(typeField) && "value" in typeField ? String(typeField.value) : "";
    const type = z.nativeEnum(EricssonDocType).safeParse(rawType);
    if (!type.success) throw httpError(400, "Send the document type before the file");
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) throw httpError(415, "Upload a PDF, image, Word, Excel or CSV file");

    const data = await file.toBuffer();
    if (file.file.truncated) throw httpError(413, "File is too large (25 MB max)");

    const key = await saveFile(`ericsson/${site.id}`, file.filename, data);
    const version = (await app.db.ericssonDocument.count({ where: { siteId: id, type: type.data as DbDocType } })) + 1;
    const doc = await app.db.ericssonDocument.create({
      data: {
        siteId: id,
        type: type.data as DbDocType,
        fileName: file.filename.slice(0, 255),
        mimeType: file.mimetype,
        sizeBytes: data.length,
        storageKey: key,
        version,
        uploadedById: req.user.sub,
      },
    });
    await logEvent(app.db, id, req.user.sub, "DOCUMENT_UPLOADED", `${ERICSSON_DOC_LABELS[type.data]} uploaded (v${version}): ${doc.fileName}`);
    return reply.status(201).send(doc);
  });

  app.get("/api/ericsson/documents/:docId/download", guard, async (req, reply) => {
    const { docId } = DocParams.parse(req.params);
    const doc = await app.db.ericssonDocument.findUnique({ where: { id: docId } });
    if (!doc) throw notFound("Document not found");
    const { stream, size } = await openFile(doc.storageKey);
    return reply
      .header("Content-Type", doc.mimeType)
      .header("Content-Length", size)
      .header("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`)
      .send(stream);
  });
}
