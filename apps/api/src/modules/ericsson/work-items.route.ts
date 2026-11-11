import type { FastifyInstance } from "fastify";
import type { WorkItemStatus as DbWorkStatus } from "@prisma/client";
import { z } from "zod";

import { CREW_WORK_STATUSES, Role, WORK_STATUS_LABELS, WorkItemStatus } from "@erp/types";
import { day, defined, forbidden, httpError, notFound } from "../../lib/http.js";
import { notifyUsers } from "../../lib/notify.js";
import { PERSON_SELECT, assertCanEdit, assertSite, logEvent, personName } from "./ericsson.shared.js";
import { itemPatch, updateError } from "./work-items.logic.js";

// Crew work: the PM / delivery lead assigns work items to individual field crew members,
// and each crew member updates their own (status, hours, note, photos) from the field view.

const IdParams = z.object({ id: z.string().min(1) });
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const CreateSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
  assigneeId: z.string().min(1),
  dueDate: DATE.optional(),
});

const EditSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  assigneeId: z.string().min(1).optional(),
  dueDate: DATE.nullable().optional(),
});

const UpdateSchema = z.object({
  status: z.nativeEnum(WorkItemStatus),
  hours: z.number().min(0).max(24),
  note: z.string().trim().max(2000).optional(),
  workDate: DATE.optional(),
  photoCount: z.number().int().min(0).max(50).default(0),
});

async function assertOnCrew(app: FastifyInstance, siteId: string, userId: string) {
  const row = await app.db.ericssonSiteCrew.findUnique({ where: { siteId_userId: { siteId, userId } }, select: { siteId: true } });
  if (!row) throw httpError(400, "Assign work only to people on this site's field crew");
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export async function ericssonWorkItemsRoute(app: FastifyInstance) {
  const guard = { preHandler: app.authenticate };
  const managerOnly = (role: string) => {
    if (role === Role.FIELD_CREW) throw forbidden("Only the PM or delivery lead can assign work");
    assertCanEdit(role);
  };

  app.post("/api/ericsson/sites/:id/work-items", guard, async (req, reply) => {
    managerOnly(req.user.role);
    const { id } = IdParams.parse(req.params);
    const site = await assertSite(app, id);
    if (site.step === "CLOSED") throw httpError(409, "This site is closed");
    const b = CreateSchema.parse(req.body);
    await assertOnCrew(app, id, b.assigneeId);
    const item = await app.db.ericssonWorkItem.create({
      data: {
        siteId: id, title: b.title, description: b.description ?? null, assigneeId: b.assigneeId,
        dueDate: b.dueDate ? day(b.dueDate) : null, createdById: req.user.sub,
      },
      include: { assignee: { select: PERSON_SELECT } },
    });
    await logEvent(app.db, id, req.user.sub, "WORK_ASSIGNED", `Work assigned to ${personName(item.assignee)}: ${item.title}`);
    void notifyUsers(app, [b.assigneeId], {
      type: "WORK_ASSIGNED", title: `New work on ${site.siteCode}: ${item.title}`,
      ...(b.dueDate ? { body: `Due ${b.dueDate}` } : {}), link: "/field", siteId: id,
    });
    return reply.status(201).send(item);
  });

  app.patch("/api/ericsson/work-items/:id", guard, async (req) => {
    managerOnly(req.user.role);
    const { id } = IdParams.parse(req.params);
    const item = await app.db.ericssonWorkItem.findUnique({ where: { id } });
    if (!item) throw notFound("Work item not found");
    const { dueDate, ...rest } = EditSchema.parse(req.body);
    if (rest.assigneeId && rest.assigneeId !== item.assigneeId) await assertOnCrew(app, item.siteId, rest.assigneeId);
    const updated = await app.db.ericssonWorkItem.update({
      where: { id },
      data: { ...defined(rest), ...(dueDate !== undefined ? { dueDate: dueDate ? day(dueDate) : null } : {}) },
      include: { assignee: { select: PERSON_SELECT } },
    });
    if (rest.assigneeId && rest.assigneeId !== item.assigneeId) {
      await logEvent(app.db, item.siteId, req.user.sub, "WORK_REASSIGNED", `"${item.title}" reassigned to ${personName(updated.assignee)}`);
      void notifyUsers(app, [rest.assigneeId], { type: "WORK_ASSIGNED", title: `Work assigned to you: ${updated.title}`, link: "/field", siteId: item.siteId });
    }
    return updated;
  });

  // The signed-in person's own work: open items, plus anything finished in the last 2 days.
  app.get("/api/field/my-work", guard, async (req) => {
    const recent = new Date(Date.now() - 2 * 86_400_000);
    const items = await app.db.ericssonWorkItem.findMany({
      where: {
        assigneeId: req.user.sub,
        site: { step: { not: "CLOSED" } },
        OR: [{ status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] } }, { status: "DONE", completedAt: { gte: recent } }],
      },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      include: {
        site: { select: { id: true, siteCode: true, venueName: true, address: true } },
        updates: { where: { userId: req.user.sub }, orderBy: { createdAt: "desc" }, take: 5 },
      },
    });
    const today = todayIso();
    return items.map((i) => ({
      id: i.id, title: i.title, description: i.description, status: i.status, dueDate: i.dueDate,
      site: i.site,
      hoursToday: i.updates.filter((u) => u.workDate.toISOString().slice(0, 10) === today).reduce((n, u) => n + Number(u.hours), 0),
      updatedToday: i.updates.some((u) => u.workDate.toISOString().slice(0, 10) === today),
      lastUpdate: i.updates[0] ? { status: i.updates[0].status, note: i.updates[0].note, hours: i.updates[0].hours, createdAt: i.updates[0].createdAt } : null,
    }));
  });

  app.get("/api/field/work-items/:id", guard, async (req) => {
    const { id } = IdParams.parse(req.params);
    const item = await app.db.ericssonWorkItem.findUnique({
      where: { id },
      include: {
        site: { select: { id: true, siteCode: true, venueName: true, address: true } },
        updates: { orderBy: { createdAt: "desc" }, take: 20, include: { user: { select: PERSON_SELECT } } },
      },
    });
    if (!item) throw notFound("Work item not found");
    if (req.user.role === Role.FIELD_CREW && item.assigneeId !== req.user.sub) throw forbidden("This work isn't assigned to you");
    return item;
  });

  app.post("/api/field/work-items/:id/updates", guard, async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const b = UpdateSchema.parse(req.body);
    const item = await app.db.ericssonWorkItem.findUnique({
      where: { id },
      include: { site: { select: { id: true, siteCode: true, step: true, pmId: true, deliveryLeadId: true } } },
    });
    if (!item) throw notFound("Work item not found");
    if (item.site.step === "CLOSED") throw httpError(409, "This site is closed");
    const err = updateError({ assigneeId: item.assigneeId, status: item.status as WorkItemStatus }, { id: req.user.sub, role: req.user.role }, b.status);
    if (err) throw forbidden(err);
    if (req.user.role === Role.FIELD_CREW && !(CREW_WORK_STATUSES as readonly string[]).includes(b.status)) throw forbidden("Choose To do, In progress, Done or Blocked");
    if (b.status === WorkItemStatus.BLOCKED && !b.note) throw httpError(400, "Say what is blocking the work");

    const now = new Date();
    const update = await app.db.$transaction(async (tx) => {
      const u = await tx.ericssonWorkUpdate.create({
        data: {
          workItemId: id, userId: req.user.sub, workDate: day(b.workDate ?? todayIso()), hours: b.hours,
          status: b.status as DbWorkStatus, note: b.note ?? null, photoCount: b.photoCount,
        },
      });
      await tx.ericssonWorkItem.update({ where: { id }, data: itemPatch(item.status as WorkItemStatus, b.status, now) as { status: DbWorkStatus; completedAt?: Date | null } });
      await logEvent(tx, item.siteId, req.user.sub, "WORK_UPDATE",
        `"${item.title}": ${WORK_STATUS_LABELS[b.status]} · ${b.hours} hrs${b.note ? ` · ${b.note}` : ""}`);
      return u;
    });

    const who = await app.db.user.findUnique({ where: { id: req.user.sub }, select: { firstName: true, lastName: true } });
    const name = personName(who) ?? "Crew";
    const link = `/ericsson/sites/${item.siteId}?tab=work`;
    if (b.status === WorkItemStatus.BLOCKED) {
      void notifyUsers(app, [item.site.pmId, item.site.deliveryLeadId].filter((x) => x !== req.user.sub), {
        type: "WORK_BLOCKED", title: `${item.site.siteCode}: work blocked`, body: `${name} · ${item.title}: ${b.note}`, link, siteId: item.siteId,
      });
    } else if (b.status === WorkItemStatus.DONE && item.status !== WorkItemStatus.DONE) {
      void notifyUsers(app, [item.site.deliveryLeadId].filter((x) => x !== req.user.sub), {
        type: "WORK_DONE", title: `${item.site.siteCode}: ${item.title} done`, body: `By ${name}`, link, siteId: item.siteId,
      });
    }
    return reply.status(201).send(update);
  });
}
