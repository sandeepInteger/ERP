import type { FastifyInstance } from "fastify";

import type { EricssonList } from "@erp/types";
import { sendEmail } from "./email.js";

// One place that creates notifications: bell rows for users, plus email to users and to
// email-only list members. Never throws: a failed notification must not fail the action.

export interface NotifyInput {
  type: string;
  title: string;
  body?: string;
  /** In-app path, e.g. /ericsson/sites/<id>?tab=crs */
  link?: string;
  siteId?: string;
  /** Same key for the same user → only the first is stored (used by scheduled jobs). */
  dedupeKey?: string;
}

export async function notifyUsers(app: FastifyInstance, userIds: Iterable<string | null | undefined>, n: NotifyInput, extraEmails: string[] = []) {
  try {
    const ids = [...new Set([...userIds].filter((x): x is string => Boolean(x)))];
    if (!ids.length && !extraEmails.length) return;

    const users = await app.db.user.findMany({ where: { id: { in: ids }, isActive: true }, select: { id: true, email: true } });
    let fresh = users;
    if (n.dedupeKey) {
      // Skip users who already have this exact notification (createMany would skip them too,
      // but this also keeps them out of the email).
      const seen = await app.db.notification.findMany({ where: { dedupeKey: n.dedupeKey, userId: { in: users.map((u) => u.id) } }, select: { userId: true } });
      const done = new Set(seen.map((s) => s.userId));
      fresh = users.filter((u) => !done.has(u.id));
    }
    if (fresh.length) {
      await app.db.notification.createMany({
        data: fresh.map((u) => ({
          userId: u.id, type: n.type, title: n.title, body: n.body ?? null, link: n.link ?? null,
          siteId: n.siteId ?? null, dedupeKey: n.dedupeKey ?? null,
        })),
        skipDuplicates: true,
      });
    }
    const emails = [...new Set([...fresh.map((u) => u.email), ...extraEmails].map((e) => e.toLowerCase()))];
    await sendEmail(app.log, emails, n.title, n.body ?? n.title, n.link ?? null);
  } catch (err) {
    app.log.error({ err, type: n.type }, "Notification failed");
  }
}

/** Notifies everyone on a distribution list (users in-app + email; email-only members by email). */
export async function notifyList(app: FastifyInstance, client: string, key: EricssonList, n: NotifyInput, alsoUserIds: (string | null | undefined)[] = []) {
  try {
    const list = await app.db.distributionList.findUnique({ where: { client_key: { client, key } } });
    const userIds = list?.userIds ?? [];
    const emails = list?.emails ?? [];
    if (!userIds.length && !emails.length) {
      // A list nobody is on must not swallow the message: send it to the admins instead, and say why.
      app.log.warn({ key }, "Distribution list has no recipients; sending to admins");
      const admins = await app.db.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { id: true } });
      const name = list?.name ?? key;
      await notifyUsers(app, [...admins.map((a) => a.id), ...alsoUserIds], {
        ...n,
        body: `${n.body ? `${n.body}\n\n` : ""}Sent to admins because the "${name}" list has no recipients. Add them under Admin › Notifications.`,
      });
      return;
    }
    await notifyUsers(app, [...userIds, ...alsoUserIds], n, emails);
  } catch (err) {
    app.log.error({ err, key }, "List notification failed");
  }
}
