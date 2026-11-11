import type { FastifyInstance } from "fastify";
import type { ExpenseCategory as DbCategory, Prisma } from "@prisma/client";
import { z } from "zod";

import {
  ERICSSON_EXPENSE_ROLES, ERICSSON_FINANCE_VIEW_ROLES, EXPENSE_CATEGORY_LABELS, ExpenseCategory, LEADERSHIP_ROLES, Role,
} from "@erp/types";
import { day, forbidden, httpError, notFound } from "../../lib/http.js";
import { PERSON_SELECT, assertSite, logEvent } from "./ericsson.shared.js";

// The daily tracker's cost lines: labor, material, travel, vendor. Feeds the cost reports.

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const IdParams = z.object({ id: z.string().min(1) });

const CreateExpenseSchema = z.object({
  workDate: DATE,
  category: z.nativeEnum(ExpenseCategory),
  description: z.string().trim().min(1).max(300),
  personName: z.string().trim().max(120).optional(),
  assigned: z.boolean().default(true),
  hours: z.number().positive().max(10_000).optional(),
  amount: z.number().nonnegative().max(9_999_999_999).transform((n) => Math.round(n * 100) / 100),
});

const ListQuerySchema = z.object({
  siteId: z.string().optional(),
  category: z.nativeEnum(ExpenseCategory).optional(),
  from: DATE.optional(),
  to: DATE.optional(),
});

const canView = (role: string) => ERICSSON_EXPENSE_ROLES.has(role) || ERICSSON_FINANCE_VIEW_ROLES.has(role);

export async function ericssonExpensesRoute(app: FastifyInstance) {
  const guard = { preHandler: app.authenticate };

  app.get("/api/ericsson/expenses", guard, async (req) => {
    if (!canView(req.user.role)) throw forbidden("Your role cannot see costs");
    const q = ListQuerySchema.parse(req.query);
    const where: Prisma.EricssonExpenseWhereInput = {
      // Only approved costs are legitimate: FE claims waiting for (or refused by) their manager stay out.
      status: "APPROVED",
      ...(q.siteId ? { siteId: q.siteId } : {}),
      ...(q.category ? { category: q.category as DbCategory } : {}),
      ...(q.from || q.to ? { workDate: { ...(q.from ? { gte: day(q.from) } : {}), ...(q.to ? { lte: day(q.to) } : {}) } } : {}),
    };
    const rows = await app.db.ericssonExpense.findMany({
      where,
      orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
      include: {
        site: { select: { id: true, siteCode: true, venueName: true } },
        createdBy: { select: PERSON_SELECT },
        decidedBy: { select: PERSON_SELECT },
      },
      take: 1000,
    });

    const byCategory = Object.fromEntries(Object.values(ExpenseCategory).map((c) => [c, 0])) as Record<ExpenseCategory, number>;
    let laborHours = 0;
    let borrowedHours = 0;
    for (const r of rows) {
      byCategory[r.category as ExpenseCategory] += Number(r.amount);
      if (r.category === "LABOR") {
        laborHours += Number(r.hours ?? 0);
        if (!r.assigned) borrowedHours += Number(r.hours ?? 0);
      }
    }
    const total = Object.values(byCategory).reduce((a, b) => a + b, 0);
    const owed = rows.filter((r) => r.paymentMethod === "PERSONAL_CARD" && !r.reimbursedAt).reduce((a, r) => a + Number(r.amount), 0);
    return {
      rows: rows.map(({ receiptKey, ...r }) => ({ ...r, hasReceipt: Boolean(receiptKey) })),
      totals: { total, byCategory, laborHours, borrowedHours, owedToEngineers: owed },
    };
  });

  app.post("/api/ericsson/sites/:id/expenses", guard, async (req, reply) => {
    if (!ERICSSON_EXPENSE_ROLES.has(req.user.role)) throw forbidden("Your role cannot record costs");
    const { id } = IdParams.parse(req.params);
    await assertSite(app, id);
    const b = CreateExpenseSchema.parse(req.body);
    if (b.category === ExpenseCategory.LABOR && !b.hours) throw httpError(400, "Labor needs the number of hours");

    const row = await app.db.ericssonExpense.create({
      data: {
        siteId: id,
        workDate: day(b.workDate),
        category: b.category as DbCategory,
        description: b.description,
        personName: b.personName ?? null,
        assigned: b.assigned,
        hours: b.hours ?? null,
        amount: b.amount,
        createdById: req.user.sub,
      },
    });
    await logEvent(app.db, id, req.user.sub, "EXPENSE",
      `${EXPENSE_CATEGORY_LABELS[b.category]} cost recorded for ${b.workDate}: $${b.amount.toLocaleString("en-US")}${b.assigned ? "" : " (borrowed resource)"}`);
    return reply.status(201).send(row);
  });

  // Whoever recorded it can remove it; so can Finance, the PM and leadership (to fix mistakes).
  app.delete("/api/ericsson/expenses/:id", guard, async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const row = await app.db.ericssonExpense.findUnique({ where: { id } });
    if (!row) throw notFound("Cost line not found");
    const role = req.user.role as string;
    const ok = row.createdById === req.user.sub || role === Role.FINANCE || role === Role.PROJECT_MANAGER || LEADERSHIP_ROLES.has(role);
    if (!ok) throw forbidden("Only whoever recorded it, the PM or Finance can remove a cost line");
    await app.db.ericssonExpense.delete({ where: { id } });
    await logEvent(app.db, row.siteId, req.user.sub, "EXPENSE_REMOVED", `Cost line removed: ${row.description} ($${Number(row.amount).toLocaleString("en-US")})`);
    return reply.status(204).send();
  });
}
