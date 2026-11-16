import { PrismaClient, type Role } from "@prisma/client";

import { resetDemo, seedDemo } from "./seed-demo.js";

// Seeds users and the RACI matrix from the Ericsson IBS SOP (Appendices A and B).
// Safe to re-run: users and RACI rules are upserts.
//   SEED_DEMO=true        also adds sample sites + two test users (seed-demo.ts)
//   SEED_RESET_DEMO=true  first deletes the sample sites (only those, never real data)

const db = new PrismaClient();

const USERS: { email: string; firstName: string; lastName: string; designation: string; role: Role }[] = [
  { email: "niranjan.tamhane@integertel.com", firstName: "Niranjan", lastName: "Tamhane", designation: "System administrator", role: "ADMIN" },
  { email: "amar@integertel.com", firstName: "Amar", lastName: "Uppalapati", designation: "Vice President", role: "ADMIN" },
  { email: "chris.lembo@integertel.com", firstName: "Chris", lastName: "Lembo", designation: "Sales & Operations", role: "SALES_LEADER" },
  { email: "vidhya@integertel.com", firstName: "Vidhyanidhi", lastName: "Danda", designation: "Delivery PM", role: "PROJECT_MANAGER" },
  { email: "ashish@integertel.com", firstName: "Ashish", lastName: "Vashisht", designation: "Delivery Lead", role: "DELIVERY_LEAD" },
  { email: "jaspreet@integertel.com", firstName: "Jaspreet", lastName: "Singh", designation: "Associate Project Manager", role: "ASSOCIATE_PM" },
  { email: "hitesh.chaudhary@integertel.com", firstName: "Hitesh", lastName: "Chaudhary", designation: "Project Coordinator", role: "COORDINATOR" },
  { email: "siddhant@integertel.com", firstName: "Sidhant", lastName: "Sachan", designation: "Cost Accountant", role: "FINANCE" },
];

// Ericsson SOP Appendix B. The SOP leaves "Send CR for approval" without a Responsible
// role and leaves Consulted / Informed empty; they stay empty until the business fills them.
const ERICSSON_RACI: { taskKey: string; task: string; r: Role[]; a: Role[] }[] = [
  { taskKey: "RECEIVE_DOCS", task: "Receive SOV, BOM, RFDS", r: ["PROJECT_MANAGER"], a: ["PROJECT_MANAGER"] },
  { taskKey: "REVIEW_SOV", task: "Review SOV", r: ["ASSOCIATE_PM"], a: ["PROJECT_MANAGER"] },
  { taskKey: "REVIEW_BOM_RFDS", task: "Review BOM & RFDS", r: ["PROJECT_MANAGER"], a: ["PROJECT_MANAGER"] },
  { taskKey: "SEND_QUESTIONS", task: "Send questions & concerns to Ericsson PM", r: ["ASSOCIATE_PM"], a: ["PROJECT_MANAGER"] },
  { taskKey: "SOV_HANDSHAKE", task: "Send SOV to Ericsson for handshake and request RFX", r: ["ASSOCIATE_PM"], a: ["PROJECT_MANAGER"] },
  { taskKey: "ACCEPT_RFX_ORDER", task: "Accept the RFX and order the material needed for site", r: ["ASSOCIATE_PM"], a: ["PROJECT_MANAGER"] },
  { taskKey: "COMPLETE_SOW", task: "Complete the site with assigned SOW", r: ["DELIVERY_LEAD"], a: ["PROJECT_MANAGER"] },
  { taskKey: "VSS_AE202", task: "Do VSS & send AE202 to customer with stamping", r: ["DELIVERY_LEAD"], a: ["PROJECT_MANAGER"] },
  { taskKey: "SEND_CR", task: "Send any CR for approval to Ericsson PM", r: [], a: ["PROJECT_MANAGER"] },
  { taskKey: "UPLOAD_INVOICE", task: "Upload invoice to Ericsson SRM portal", r: ["ASSOCIATE_PM"], a: ["PROJECT_MANAGER"] },
];

async function seedUsers() {
  for (const u of USERS) {
    await db.user.upsert({ where: { email: u.email }, update: {}, create: u });
  }
  console.log(`users: ${USERS.length}`);
}

async function seedRaci() {
  for (const [i, r] of ERICSSON_RACI.entries()) {
    const data = { task: r.task, rank: i + 1, responsible: r.r, accountable: r.a, consulted: [], informed: [] };
    await db.raciRule.upsert({
      where: { client_taskKey: { client: "ERICSSON", taskKey: r.taskKey } },
      update: data,
      create: { client: "ERICSSON", taskKey: r.taskKey, ...data },
    });
  }
  console.log(`raci rules (Ericsson): ${ERICSSON_RACI.length}`);
}

// SOP Appendix C. Recipients are seeded once; after that, admins own them (re-seeding keeps their edits).
const ERICSSON_LISTS: { key: string; name: string; frequency: string; description: string; recipients: string[] }[] = [
  { key: "DELIVERY_STATUS", name: "Delivery status update", frequency: "As site/scope is completed", description: "", recipients: ["vidhya@integertel.com", "ashish@integertel.com"] },
  { key: "DAILY_STANDUP", name: "Daily stand-up call", frequency: "Daily", description: "", recipients: ["chris.lembo@integertel.com", "vidhya@integertel.com", "jaspreet@integertel.com", "ashish@integertel.com", "hitesh.chaudhary@integertel.com"] },
  { key: "REVENUE_COST_REPORT", name: "Bimonthly revenue / cost report", frequency: "Bimonthly", description: "", recipients: ["siddhant@integertel.com"] },
  { key: "SOV_RFX_ACCEPTANCE", name: "SOV / RFX acceptance", frequency: "As per assignment", description: "", recipients: ["jaspreet@integertel.com"] },
  { key: "SITE_INVOICING", name: "Site PO / CR / material invoicing", frequency: "As site/scope is completed", description: "", recipients: ["jaspreet@integertel.com"] },
  { key: "VENDOR_ONBOARDING", name: "Vendor onboarding", frequency: "As per assignment", description: "", recipients: ["vidhya@integertel.com"] },
  // The SOP names Narsimha Rao / Aniket Gupta here, with no email: an admin adds them under Notifications.
  { key: "VENDOR_INVOICING", name: "Vendor invoicing", frequency: "As site/scope is completed", description: "SOP: Narsimha Rao / Aniket Gupta (add their emails)", recipients: [] },
];

// Escalation ladder, from the SOP's Detailed R&R (page 3): PM (Vidhya) is level 1, the Sales
// leader (Chris) is level 2. The Ops leader is also level 2 in the general R&R, so that role is
// included for when someone holds it. Level 3 is "Management" (Admin). Admins can change it.
const ERICSSON_ESCALATION = [
  { level: 1, afterDays: 3, roles: ["PROJECT_MANAGER"] as Role[] },
  { level: 2, afterDays: 5, roles: ["SALES_LEADER", "OPS_LEADER"] as Role[] },
  { level: 3, afterDays: 8, roles: ["ADMIN"] as Role[] },
];
// The ladder seeded before 2026-11-12. A database still on exactly this one is moved to the new
// default; one an admin has edited is left alone.
const OLD_ERICSSON_ESCALATION = [
  { level: 1, afterDays: 3, roles: ["PROJECT_MANAGER"] },
  { level: 2, afterDays: 5, roles: ["OPS_LEADER"] },
  { level: 3, afterDays: 8, roles: ["SALES_LEADER"] },
];

async function seedNotifications() {
  const users = await db.user.findMany({ select: { id: true, email: true } });
  const idOf = new Map(users.map((u) => [u.email.toLowerCase(), u.id]));
  for (const [i, l] of ERICSSON_LISTS.entries()) {
    const meta = { name: l.name, frequency: l.frequency, description: l.description, rank: i + 1 };
    await db.distributionList.upsert({
      where: { client_key: { client: "ERICSSON", key: l.key } },
      update: meta,
      create: { client: "ERICSSON", key: l.key, ...meta, userIds: l.recipients.map((e) => idOf.get(e)).filter((x): x is string => Boolean(x)), emails: [] },
    });
  }
  const current = await db.escalationRule.findMany({ where: { client: "ERICSSON" }, orderBy: { level: "asc" }, select: { level: true, afterDays: true, roles: true } });
  const isOldDefault = JSON.stringify(current) === JSON.stringify(OLD_ERICSSON_ESCALATION);
  if (current.length === 0 || isOldDefault) {
    await db.$transaction([
      db.escalationRule.deleteMany({ where: { client: "ERICSSON" } }),
      db.escalationRule.createMany({ data: ERICSSON_ESCALATION.map((r) => ({ client: "ERICSSON", ...r })) }),
    ]);
    if (isOldDefault) console.log("escalation ladder: moved to SOP Detailed R&R (L2 Sales leader, L3 Admin)");
  }
  console.log(`distribution lists (Ericsson): ${ERICSSON_LISTS.length}, escalation levels: ${ERICSSON_ESCALATION.length}`);
}

try {
  await seedUsers();
  await seedRaci();
  await seedNotifications();
  if (process.env["SEED_RESET_DEMO"] === "true") console.log(`sample sites removed: ${await resetDemo(db)}`);
  if (process.env["SEED_DEMO"] === "true") console.log(`sample sites added: ${await seedDemo(db)} (existing ones kept)`);
} finally {
  await db.$disconnect();
}
