import type { FastifyInstance } from "fastify";
import type { PaymentMethod as DbPayment, Prisma } from "@prisma/client";
import { z } from "zod";

import {
  EXPENSE_APPROVER_OVERRIDE_ROLES, ExpenseStatus, FE_EXPENSE_TYPES, FE_EXPENSE_TYPE_LABELS, PAYMENT_METHOD_LABELS, PaymentMethod, Role,
} from "@erp/types";
import { day, forbidden, httpError, notFound } from "../../lib/http.js";
import { notifyUsers } from "../../lib/notify.js";
import { openFile, saveFile } from "../../lib/storage.js";
import { PERSON_SELECT, assertCanWorkOnSite, assertSite, logEvent, personName } from "./ericsson.shared.js";
import { RECEIPT_MIME_TYPES, canViewClaim, categoryFor, decideError, resolveApprover } from "./claims.logic.js";

// Field engineer expense claims. An FE submits a claim against a site with a receipt; their
// manager approves or rejects it; only approved claims are visible to Finance and count as costs.

const IdParams = z.object({ id: z.string().min(1) });
const TYPE_KEYS = FE_EXPENSE_TYPES.map((t) => t.key) as [string, ...string[]];

const ClaimFields = z.object({
  siteId: z.string().min(1),
  expenseType: z.enum(TYPE_KEYS),
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the expense date"),
  amount: z.coerce.number().positive("Enter the amount").max(1_000_000).transform((n) => Math.round(n * 100) / 100),
  paymentMethod: z.nativeEnum(PaymentMethod),
  note: z.string().trim().max(1000).optional(),
});

const DecideSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  reason: z.string().trim().max(1000).optional(),
});

const CLAIM_INCLUDE = {
  site: { select: { id: true, siteCode: true, venueName: true } },
  createdBy: { select: PERSON_SELECT },
  approver: { select: PERSON_SELECT },
  decidedBy: { select: PERSON_SELECT },
} as const;

// Never send the storage key to the browser.
function shape<T extends { receiptKey: string | null }>(row: T) {
  const { receiptKey, ...rest } = row;
  return { ...rest, hasReceipt: Boolean(receiptKey) };
}

export async function ericssonClaimsRoute(app: FastifyInstance) {
  const guard = { preHandler: app.authenticate };

  // multipart/form-data: the fields above, then one "receipt" file (required: proof of the bill).
  app.post("/api/field/expenses", guard, async (req, reply) => {
    const file = await req.file();
    if (!file) throw httpError(400, "Attach the bill or receipt");
    const raw = Object.fromEntries(
      Object.entries(file.fields).flatMap(([k, v]) => (v && !Array.isArray(v) && "value" in v ? [[k, String(v.value)]] : [])),
    );
    const b = ClaimFields.parse({ ...raw, note: raw["note"] || undefined });
    if (!RECEIPT_MIME_TYPES.has(file.mimetype)) throw httpError(415, "The receipt must be a photo or a PDF");

    const site = await assertSite(app, b.siteId);
    if (site.step === "CLOSED") throw httpError(409, "This site is closed");
    await assertCanWorkOnSite(app, req.user, b.siteId);

    const data = await file.toBuffer();
    if (file.file.truncated) throw httpError(413, "The receipt is too large (25 MB max)");

    const [me, siteTeam] = await Promise.all([
      app.db.user.findUniqueOrThrow({ where: { id: req.user.sub }, select: { id: true, managerId: true, firstName: true, lastName: true } }),
      app.db.ericssonSite.findUniqueOrThrow({ where: { id: b.siteId }, select: { deliveryLeadId: true, pmId: true } }),
    ]);
    const approverId = resolveApprover(me, siteTeam);
    if (!approverId) throw httpError(409, "No manager to approve this: ask an admin to set your manager");

    const receiptKey = await saveFile(`expense-receipts/${req.user.sub}`, file.filename, data);
    const label = FE_EXPENSE_TYPE_LABELS[b.expenseType] ?? b.expenseType;
    const row = await app.db.ericssonExpense.create({
      data: {
        siteId: b.siteId, workDate: day(b.workDate), category: categoryFor(b.expenseType),
        description: b.note ? `${label}: ${b.note}` : label, personName: personName(me), assigned: true,
        amount: b.amount, createdById: req.user.sub,
        status: "SUBMITTED", claimType: b.expenseType, paymentMethod: b.paymentMethod as DbPayment,
        receiptKey, receiptName: file.filename.slice(0, 255), receiptMime: file.mimetype, approverId,
      },
      include: CLAIM_INCLUDE,
    });
    void notifyUsers(app, [approverId], {
      type: "EXPENSE_SUBMITTED",
      title: `Expense to approve: ${personName(me)} · $${b.amount.toLocaleString("en-US")}`,
      body: `${label} on ${site.siteCode} · ${PAYMENT_METHOD_LABELS[b.paymentMethod]}`,
      link: "/approvals/expenses", siteId: b.siteId,
    });
    return reply.status(201).send(shape(row));
  });

  // The signed-in person's own claims, every status.
  app.get("/api/field/expenses", guard, async (req) => {
    const rows = await app.db.ericssonExpense.findMany({
      where: { createdById: req.user.sub, claimType: { not: null } },
      orderBy: [{ createdAt: "desc" }],
      include: CLAIM_INCLUDE,
      take: 200,
    });
    return rows.map(shape);
  });

  // An FE can withdraw a claim that hasn't been approved (e.g. to fix it and submit again).
  app.delete("/api/field/expenses/:id", guard, async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const row = await app.db.ericssonExpense.findUnique({ where: { id } });
    if (!row || row.createdById !== req.user.sub || !row.claimType) throw notFound("Claim not found");
    if (row.status === "APPROVED") throw httpError(409, "Approved claims can't be withdrawn; ask Finance");
    await app.db.ericssonExpense.delete({ where: { id } });
    return reply.status(204).send();
  });

  // Claims waiting for the signed-in person's decision (admins and the ops leader see all).
  app.get("/api/expense-approvals", guard, async (req) => {
    const where: Prisma.EricssonExpenseWhereInput = {
      status: "SUBMITTED",
      claimType: { not: null },
      ...(EXPENSE_APPROVER_OVERRIDE_ROLES.has(req.user.role) ? {} : { approverId: req.user.sub }),
    };
    const rows = await app.db.ericssonExpense.findMany({ where, orderBy: { createdAt: "asc" }, include: CLAIM_INCLUDE });
    return rows.map(shape);
  });

  app.post("/api/expense-approvals/:id/decide", guard, async (req) => {
    const { id } = IdParams.parse(req.params);
    const { decision, reason } = DecideSchema.parse(req.body);
    const row = await app.db.ericssonExpense.findUnique({ where: { id }, include: { site: { select: { siteCode: true } } } });
    if (!row || !row.claimType) throw notFound("Claim not found");
    const err = decideError({ createdById: row.createdById, approverId: row.approverId, status: row.status as ExpenseStatus }, { id: req.user.sub, role: req.user.role });
    if (err) throw httpError(row.status !== "SUBMITTED" ? 409 : 403, err);
    if (decision === "REJECT" && !reason) throw httpError(400, "Say why it's rejected, so the engineer can fix it");

    const status = decision === "APPROVE" ? "APPROVED" : "REJECTED";
    // Guard on SUBMITTED so two managers clicking at once can't both decide.
    const { count } = await app.db.ericssonExpense.updateMany({
      where: { id, status: "SUBMITTED" },
      data: { status, decidedById: req.user.sub, decidedAt: new Date(), rejectionReason: decision === "REJECT" ? reason! : null },
    });
    if (count === 0) throw httpError(409, "This claim has already been decided");

    const label = FE_EXPENSE_TYPE_LABELS[row.claimType] ?? row.claimType;
    const amount = `$${Number(row.amount).toLocaleString("en-US")}`;
    await logEvent(app.db, row.siteId, req.user.sub, `EXPENSE_${status}`, `${label} ${amount} by ${row.personName ?? "engineer"} ${status === "APPROVED" ? "approved" : `rejected: ${reason}`}`);
    void notifyUsers(app, [row.createdById], {
      type: `EXPENSE_${status}`,
      title: status === "APPROVED" ? `Expense approved: ${label} ${amount}` : `Expense rejected: ${label} ${amount}`,
      body: status === "APPROVED" ? row.site.siteCode : `${row.site.siteCode} · ${reason}`,
      link: "/field/expenses", siteId: row.siteId,
    });
    return app.db.ericssonExpense.findUnique({ where: { id }, include: CLAIM_INCLUDE }).then((r) => (r ? shape(r) : null));
  });

  // The receipt file, for whoever may see the claim.
  app.get("/api/expenses/:id/receipt", guard, async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const row = await app.db.ericssonExpense.findUnique({ where: { id } });
    if (!row?.receiptKey) throw notFound("No receipt");
    if (!canViewClaim({ createdById: row.createdById, approverId: row.approverId, status: row.status as ExpenseStatus }, { id: req.user.sub, role: req.user.role })) {
      throw forbidden("You can't see this receipt");
    }
    const { stream, size } = await openFile(row.receiptKey);
    return reply
      .header("Content-Type", row.receiptMime ?? "application/octet-stream")
      .header("Content-Length", size)
      .header("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(row.receiptName ?? "receipt")}`)
      .send(stream);
  });

  // Finance marks an approved personal-card claim as paid back to the engineer.
  app.post("/api/ericsson/expenses/:id/reimbursed", { preHandler: app.requireRole(Role.FINANCE, Role.ADMIN) }, async (req) => {
    const { id } = IdParams.parse(req.params);
    const row = await app.db.ericssonExpense.findUnique({ where: { id } });
    if (!row || row.status !== "APPROVED" || row.paymentMethod !== "PERSONAL_CARD") throw httpError(409, "Only approved personal-card claims are reimbursed");
    if (row.reimbursedAt) throw httpError(409, "Already marked reimbursed");
    const updated = await app.db.ericssonExpense.update({ where: { id }, data: { reimbursedAt: new Date() }, include: CLAIM_INCLUDE });
    void notifyUsers(app, [row.createdById], {
      type: "EXPENSE_REIMBURSED", title: `Reimbursed: $${Number(row.amount).toLocaleString("en-US")}`, body: row.description, link: "/field/expenses",
    });
    return shape(updated);
  });
}
