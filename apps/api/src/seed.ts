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

try {
  await seedUsers();
  await seedRaci();
  if (process.env["SEED_RESET_DEMO"] === "true") console.log(`sample sites removed: ${await resetDemo(db)}`);
  if (process.env["SEED_DEMO"] === "true") console.log(`sample sites added: ${await seedDemo(db)} (existing ones kept)`);
} finally {
  await db.$disconnect();
}
