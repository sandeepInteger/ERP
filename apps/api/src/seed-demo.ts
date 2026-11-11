import type { PrismaClient, Prisma } from "@prisma/client";

import { saveFile } from "./lib/storage.js";

// Sample data for local development and the Docker test stack: one Ericsson site at every
// SOP step, with the documents, discrepancies, materials, change requests, daily logs and
// activity a real site would have by then. Mirrors the approved prototype screens.
//
// Every sample site's notes start with SAMPLE_MARK. `resetDemo` deletes exactly those
// sites (children cascade), so real data is never touched. Venues and amounts are invented.

export const SAMPLE_MARK = "[Sample data]";

/** Test-only people for the roles the SOP team does not cover. Seeded only with the demo data. */
export const DEMO_USERS = [
  { email: "ops.leader@example.test", firstName: "Test", lastName: "Ops Leader", designation: "Operations leader (test account)", role: "OPS_LEADER" as const },
  { email: "viewer@example.test", firstName: "Test", lastName: "Viewer", designation: "Read-only (test account)", role: "VIEWER" as const },
  { email: "crew.tech1@example.test", firstName: "Test", lastName: "Technician One", designation: "Field technician (test account)", role: "FIELD_CREW" as const },
  { email: "crew.tech2@example.test", firstName: "Test", lastName: "Technician Two", designation: "Field technician (test account)", role: "FIELD_CREW" as const },
];

/** Sample crew assignments: technician one on both sites in execution, technician two on one. */
const CREW_ON: Record<string, string[]> = {
  "E-IBS-1049": ["crew.tech1@example.test", "crew.tech2@example.test"],
  "E-IBS-1044": ["crew.tech1@example.test"],
};

/** Sample FE expense claims (one waiting, one approved, one rejected) to try the approval flow. */
const CLAIMS: Record<string, { by: string; type: string; label: string; amount: number; daysAgo: number; pay: "CORPORATE_CARD" | "PERSONAL_CARD"; status: "SUBMITTED" | "APPROVED" | "REJECTED"; note?: string; reason?: string }[]> = {
  "E-IBS-1049": [
    { by: "crew.tech1@example.test", type: "TRAVEL_TOLL", label: "Travel - Toll", amount: 18.5, daysAgo: 3, pay: "CORPORATE_CARD", status: "APPROVED", note: "I-95 tolls to site" },
    { by: "crew.tech1@example.test", type: "HOTEL", label: "Hotel", amount: 129, daysAgo: 1, pay: "PERSONAL_CARD", status: "SUBMITTED", note: "1 night near stadium" },
    { by: "crew.tech1@example.test", type: "TRAVEL_FOOD", label: "Travel - Food", amount: 42.75, daysAgo: 2, pay: "PERSONAL_CARD", status: "REJECTED", reason: "Itemised bill missing, please attach it and resubmit" },
  ],
  "E-IBS-1044": [
    { by: "crew.tech1@example.test", type: "PARKING", label: "Parking", amount: 24, daysAgo: 2, pay: "CORPORATE_CARD", status: "SUBMITTED" },
  ],
};

type WorkStatus = "TODO" | "IN_PROGRESS" | "DONE" | "BLOCKED";
/** Sample crew work: dueIn is days from today (negative = overdue). */
const CREW_WORK: Record<string, { to: string; title: string; dueIn: number; updates: { daysAgo: number; hours: number; status: WorkStatus; note?: string }[] }[]> = {
  "E-IBS-1049": [
    { to: "crew.tech1@example.test", title: "Mount antennas, levels 2–3", dueIn: 0, updates: [
      { daysAgo: 2, hours: 8, status: "IN_PROGRESS", note: "Level 2 done" },
      { daysAgo: 1, hours: 7.5, status: "DONE", note: "Level 3 done, 12 antennas total" },
    ] },
    { to: "crew.tech1@example.test", title: "Terminate coax runs, levels 2–3", dueIn: -1, updates: [
      { daysAgo: 1, hours: 4, status: "IN_PROGRESS", note: "18 of 24 runs terminated" },
    ] },
    { to: "crew.tech2@example.test", title: "BBU swap and decommission old unit", dueIn: 2, updates: [
      { daysAgo: 2, hours: 6, status: "BLOCKED", note: "Ceiling access held by venue security" },
    ] },
    { to: "crew.tech2@example.test", title: "Label all antennas and runs", dueIn: 3, updates: [] },
  ],
  "E-IBS-1044": [
    { to: "crew.tech1@example.test", title: "Install floors 1–4", dueIn: -2, updates: [
      { daysAgo: 3, hours: 8, status: "IN_PROGRESS" },
      { daysAgo: 2, hours: 8, status: "DONE", note: "All four floors in" },
    ] },
    { to: "crew.tech1@example.test", title: "RF walk on P1 parking level", dueIn: 1, updates: [] },
  ],
};

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const dateOnly = (n: number) => new Date(new Date(Date.now() - n * DAY).toISOString().slice(0, 10) + "T00:00:00.000Z");

// A tiny valid PDF, so downloads of sample documents work.
function placeholderPdf(title: string): Buffer {
  const text = `Sample ${title} - placeholder file`;
  const stream = `BT /F1 14 Tf 72 720 Td (${text.replace(/[()\\]/g, "")}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(body.length); body += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = body.length;
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

type DocType = "SOV" | "BOM" | "RFDS" | "RFX" | "MATERIAL_RECEIPT" | "AE202" | "CR_APPROVAL" | "INVOICE" | "PHOTO";

interface SampleSite {
  site: Omit<Prisma.EricssonSiteUncheckedCreateInput, "pmId" | "apmId" | "deliveryLeadId" | "coordinatorId" | "createdById" | "notes"> & { notes: string };
  docs?: { type: DocType; daysAgo: number }[];
  discrepancies?: { item: string; sov?: string; bom?: string; rfds?: string; resolution?: string; daysAgo: number }[];
  queries?: { direction: "OUTBOUND" | "INBOUND"; body: string; daysAgo: number }[];
  materials?: Omit<Prisma.EricssonMaterialLineCreateManyInput, "siteId">[];
  crs?: {
    type: "EXTRA_VISIT" | "SCOPE_DEVIATION" | "SUB_VENDOR" | "EXTRA_MATERIAL";
    title: string; reason: string; amount?: number; vendorQuote?: number; extraDays?: number;
    status: "PM_REVIEW" | "SUBMITTED" | "APPROVED" | "REJECTED"; daysAgo: number; note?: string;
  }[];
  logs?: { daysAgo: number; summary: string; crew: number; hours: number; blocker?: string }[];
  costs?: { daysAgo: number; category: "LABOR" | "MATERIAL" | "TRAVEL" | "VENDOR"; description: string; person?: string; borrowed?: boolean; hours?: number; amount: number }[];
  events: { daysAgo: number; who: "pm" | "apm" | "dl" | "pc"; type: string; message: string }[];
}

function sites(): SampleSite[] {
  return [
    {
      site: { siteCode: "E-IBS-1055", venueName: "Retail Mall North", scope: "IBS_ICI", venueSqft: 120000, step: "DOCS_RECEIVED", stepChangedAt: daysAgo(1), targetDate: dateOnly(-36), clientPmName: "Ericsson PM (sample)", notes: `${SAMPLE_MARK} Step 1: SOV and BOM in, RFDS still missing.` },
      docs: [{ type: "SOV", daysAgo: 1 }, { type: "BOM", daysAgo: 1 }],
      events: [
        { daysAgo: 1, who: "pc", type: "SITE_CREATED", message: "Site assignment E-IBS-1055 logged" },
        { daysAgo: 1, who: "pc", type: "DOCUMENT_UPLOADED", message: "SOV and BOM uploaded; waiting for the RFDS" },
      ],
    },
    {
      site: { siteCode: "E-IBS-1042", venueName: "Regional Hospital · Tower B", scope: "IBS_ICI", venueSqft: 180000, step: "CROSS_VERIFICATION", stepChangedAt: daysAgo(6), verificationLoops: 2, targetDate: dateOnly(-18), clientPmName: "Ericsson PM (sample)", notes: `${SAMPLE_MARK} Step 2: one discrepancy still open after two loops with the Ericsson PM.` },
      docs: [{ type: "SOV", daysAgo: 8 }, { type: "BOM", daysAgo: 8 }, { type: "RFDS", daysAgo: 7 }],
      discrepancies: [
        { item: "Remote radio units", sov: "8", bom: "6", rfds: "8", resolution: "Ericsson confirmed 8; BOM reissued", daysAgo: 6 },
        { item: "Sectors / carriers", sov: "3 / 6", rfds: "3 / 4", daysAgo: 6 },
      ],
      queries: [
        { direction: "OUTBOUND", body: "BOM lists 6 RRUs but SOV and RFDS show 8. Which is correct? RFDS also shows 4 carriers vs 6 in the SOV.", daysAgo: 6 },
        { direction: "INBOUND", body: "8 RRUs is correct, BOM will be reissued. Checking carriers with the RF team.", daysAgo: 4 },
        { direction: "OUTBOUND", body: "Following up on the carrier count.", daysAgo: 1 },
      ],
      events: [
        { daysAgo: 7, who: "pc", type: "SUBMIT_FOR_VERIFICATION", message: "Send to cross-verification → Document cross-verification" },
        { daysAgo: 6, who: "apm", type: "DISCREPANCY_RAISED", message: "Discrepancies flagged: Remote radio units, Sectors / carriers" },
        { daysAgo: 4, who: "apm", type: "DISCREPANCY_RESOLVED", message: "Discrepancy resolved: Remote radio units" },
      ],
    },
    {
      site: { siteCode: "E-IBS-1051", venueName: "University Library", scope: "IBS_ICI", venueSqft: 95000, step: "SOV_RFX", stepChangedAt: daysAgo(5), sovValue: 29800, sovVersion: 2, sovAcceptedAt: daysAgo(5), rfxRequestedAt: daysAgo(5), verificationLoops: 1, targetDate: dateOnly(-29), notes: `${SAMPLE_MARK} Step 3: RFX requested 5 days ago, not received yet.` },
      docs: [{ type: "SOV", daysAgo: 9 }, { type: "BOM", daysAgo: 9 }, { type: "RFDS", daysAgo: 9 }],
      events: [
        { daysAgo: 5, who: "apm", type: "ACCEPT_SOV", message: "SOV v2 accepted ($29,800) → Accept SOV & request RFX" },
        { daysAgo: 5, who: "apm", type: "REQUEST_RFX", message: "Request RFX" },
      ],
    },
    {
      site: { siteCode: "E-IBS-1047", venueName: "Downtown Office Plaza", scope: "BBU_SWAP", step: "MATERIALS", stepChangedAt: daysAgo(3), sovValue: 12400, sovVersion: 1, sovAcceptedAt: daysAgo(8), rfxNumber: "RFX-77120", rfxRequestedAt: daysAgo(8), rfxReceivedAt: dateOnly(3), rfxAcceptedAt: daysAgo(3), targetDate: dateOnly(-22), notes: `${SAMPLE_MARK} Step 4: BBU back-ordered, so execution can't start.` },
      docs: [{ type: "SOV", daysAgo: 12 }, { type: "BOM", daysAgo: 12 }, { type: "RFDS", daysAgo: 12 }, { type: "RFX", daysAgo: 3 }, { type: "MATERIAL_RECEIPT", daysAgo: 2 }],
      materials: [
        { item: "BBU 6630", bomQty: 2, orderQty: 2, orderRef: "MO-2211", shipTo: "Site", eta: dateOnly(-11), status: "BACK_ORDERED", unitCost: 3100 },
        { item: "Radio 4449 B5/B13", bomQty: 4, clientSuppliedQty: 4, status: "CLIENT_SUPPLIED" },
        { item: "Fiber jumper 10 m", bomQty: 6, orderQty: 6, orderRef: "MO-2212", shipTo: "Site", eta: dateOnly(-2), status: "SHIPPED", unitCost: 45 },
        { item: "Grounding kit", bomQty: 4, orderQty: 4, orderRef: "MO-2209", shipTo: "Vendor", status: "RECEIVED", unitCost: 60 },
        { item: "Weatherproofing tape", bomQty: 10, status: "IN_STOCK" },
      ],
      crs: [{ type: "EXTRA_MATERIAL", title: "Delay from BBU back-order", reason: "BBU back-ordered to the ETA shown. Crew remobilization needed after delivery.", amount: 4950, extraDays: 1, status: "SUBMITTED", daysAgo: 2 }],
      costs: [
        { daysAgo: 2, category: "MATERIAL", description: "MO-2212 fiber jumpers + DC kit", person: "Supplier", amount: 1240 },
        { daysAgo: 5, category: "MATERIAL", description: "MO-2209 grounding kits", person: "Supplier", amount: 240 },
      ],
      events: [
        { daysAgo: 3, who: "apm", type: "RECORD_RFX", message: "RFX RFX-77120 recorded and accepted → RFX receipt & material procurement" },
        { daysAgo: 2, who: "apm", type: "MATERIAL_STATUS", message: "BBU 6630: Ordered → Back-ordered" },
      ],
    },
    {
      site: { siteCode: "E-IBS-1049", venueName: "Stadium Concourse", scope: "MODERNIZATION", venueSqft: 240000, step: "EXECUTION", stepChangedAt: daysAgo(4), sovValue: 54000, sovVersion: 1, sovAcceptedAt: daysAgo(14), rfxNumber: "RFX-77134", rfxRequestedAt: daysAgo(14), rfxReceivedAt: dateOnly(10), rfxAcceptedAt: daysAgo(10), executionStartedAt: daysAgo(4), targetDate: dateOnly(-25), notes: `${SAMPLE_MARK} Step 5: crew on day 3 of 4; one CR for an extra visit.` },
      docs: [{ type: "SOV", daysAgo: 18 }, { type: "BOM", daysAgo: 18 }, { type: "RFDS", daysAgo: 18 }, { type: "RFX", daysAgo: 10 }, { type: "PHOTO", daysAgo: 1 }],
      materials: [
        { item: "BBU 6630", bomQty: 1, orderQty: 1, orderRef: "MO-2190", shipTo: "Site", status: "RECEIVED", unitCost: 3100 },
        { item: "Antenna · ceiling mount", bomQty: 24, clientSuppliedQty: 24, status: "CLIENT_SUPPLIED" },
      ],
      crs: [{ type: "EXTRA_VISIT", title: "Extra day: ceiling access blocked by venue", reason: "Venue security held ceiling access for 3 hours on two days. Work will exceed the 4-day IC&I estimate by one crew day.", amount: 2950, extraDays: 1, status: "SUBMITTED", daysAgo: 4 }],
      logs: [
        { daysAgo: 3, summary: "Site walk, staging, cable pulls on level 1.", crew: 3, hours: 8 },
        { daysAgo: 2, summary: "BBU swapped, old unit decommissioned.", crew: 4, hours: 7.5, blocker: "Ceiling access delayed 3 hrs by venue security" },
        { daysAgo: 1, summary: "Levels 2–3: antennas mounted, 18 of 24 runs terminated.", crew: 4, hours: 8 },
      ],
      costs: [
        { daysAgo: 3, category: "LABOR", description: "Site walk, staging, cable pulls L1", person: "Crew of 3", hours: 24, amount: 1920 },
        { daysAgo: 2, category: "LABOR", description: "BBU swap, decommission old unit", person: "Crew of 4", hours: 30, amount: 2400 },
        { daysAgo: 2, category: "TRAVEL", description: "Parking & tolls", person: "Crew", amount: 46 },
        { daysAgo: 1, category: "LABOR", description: "Antenna mount L2–3, terminations", person: "Crew of 4", hours: 32, amount: 2560 },
        { daysAgo: 1, category: "TRAVEL", description: "Mileage 84 mi × 2 vans", person: "Crew", amount: 118 },
      ],
      events: [
        { daysAgo: 4, who: "apm", type: "START_EXECUTION", message: "Start work execution → Work execution" },
        { daysAgo: 1, who: "dl", type: "DAILY_LOG", message: "Daily log: crew of 4, 32 labor hrs" },
      ],
    },
    {
      site: { siteCode: "E-IBS-1044", venueName: "Hotel & Conference Center", scope: "IBS_ICI", venueSqft: 150000, step: "EXECUTION", stepChangedAt: daysAgo(6), sovValue: 41750, sovVersion: 1, sovAcceptedAt: daysAgo(15), rfxNumber: "RFX-77101", rfxRequestedAt: daysAgo(15), rfxReceivedAt: dateOnly(12), rfxAcceptedAt: daysAgo(12), executionStartedAt: daysAgo(6), targetDate: dateOnly(-20), notes: `${SAMPLE_MARK} Step 5: scope grew; one CR in PM review (sub-vendor, 3% pass-through), one awaiting Ericsson.` },
      docs: [{ type: "SOV", daysAgo: 20 }, { type: "BOM", daysAgo: 20 }, { type: "RFDS", daysAgo: 20 }, { type: "RFX", daysAgo: 12 }],
      crs: [
        { type: "SUB_VENDOR", title: "Core drilling by sub-vendor", reason: "Ericsson PM asked that core drilling be done by a licensed sub-vendor.", vendorQuote: 6000, status: "PM_REVIEW", daysAgo: 1 },
        { type: "SCOPE_DEVIATION", title: "Two extra antennas in parking level", reason: "RF walk found a dead zone on P1. Estimate for additional drivers attached.", amount: 4320, status: "SUBMITTED", daysAgo: 5 },
      ],
      logs: [{ daysAgo: 2, summary: "Floors 1–4 complete. P1 dead zone found on RF walk.", crew: 3, hours: 8 }],
      costs: [
        { daysAgo: 2, category: "LABOR", description: "Floors 1–4 install", person: "Crew of 3", hours: 24, amount: 1920 },
        { daysAgo: 1, category: "LABOR", description: "RF walk on P1 (support tech)", person: "R. Patel", borrowed: true, hours: 6, amount: 420 },
      ],
      events: [{ daysAgo: 6, who: "apm", type: "START_EXECUTION", message: "Start work execution → Work execution" }],
    },
    {
      site: { siteCode: "E-IBS-1038", venueName: "Airport Terminal C", scope: "MACRO_INSTALL", step: "VSS_AE202", stepChangedAt: daysAgo(2), sovValue: 22300, sovVersion: 1, sovAcceptedAt: daysAgo(25), rfxNumber: "RFX-76988", rfxRequestedAt: daysAgo(25), rfxReceivedAt: dateOnly(22), rfxAcceptedAt: daysAgo(22), executionStartedAt: daysAgo(14), sowCompletedAt: daysAgo(2), vssDate: dateOnly(1), vssOutcome: "PASSED", ae202SubmittedAt: daysAgo(1), targetDate: dateOnly(-8), notes: `${SAMPLE_MARK} Step 7: VSS passed, AE202 submitted, waiting for the client stamp.` },
      docs: [{ type: "SOV", daysAgo: 30 }, { type: "BOM", daysAgo: 30 }, { type: "RFDS", daysAgo: 30 }, { type: "RFX", daysAgo: 22 }, { type: "AE202", daysAgo: 1 }],
      crs: [{ type: "EXTRA_VISIT", title: "Return visit for alarm testing", reason: "Ericsson NOC unavailable on day 4; alarm testing needed a second visit.", amount: 1850, status: "APPROVED", daysAgo: 6, note: "Approved by Ericsson PM" }],
      logs: [{ daysAgo: 3, summary: "Alarm testing completed with NOC.", crew: 2, hours: 6 }],
      events: [
        { daysAgo: 2, who: "dl", type: "COMPLETE_SOW", message: "Mark SOW complete → VSS & AE202 submission" },
        { daysAgo: 1, who: "dl", type: "RECORD_VSS", message: "VSS: Passed" },
        { daysAgo: 1, who: "dl", type: "SUBMIT_AE202", message: "Submit AE202" },
      ],
    },
    {
      site: { siteCode: "E-IBS-1033", venueName: "Convention Center Hall A", scope: "IBS_ICI", venueSqft: 210000, step: "INVOICING", stepChangedAt: daysAgo(1), sovValue: 48900, sovVersion: 1, sovAcceptedAt: daysAgo(35), rfxNumber: "RFX-76940", rfxRequestedAt: daysAgo(35), rfxReceivedAt: dateOnly(32), rfxAcceptedAt: daysAgo(32), executionStartedAt: daysAgo(20), sowCompletedAt: daysAgo(6), vssDate: dateOnly(5), vssOutcome: "PASSED", ae202SubmittedAt: daysAgo(4), ae202StampedAt: daysAgo(1), targetDate: dateOnly(-4), notes: `${SAMPLE_MARK} Step 9: AE202 stamped, ready to upload the invoice to SRM.` },
      docs: [{ type: "SOV", daysAgo: 40 }, { type: "BOM", daysAgo: 40 }, { type: "RFDS", daysAgo: 40 }, { type: "RFX", daysAgo: 32 }, { type: "AE202", daysAgo: 4 }, { type: "CR_APPROVAL", daysAgo: 9 }],
      crs: [{ type: "EXTRA_VISIT", title: "Extra visit for walk test", reason: "Walk test needed a second visit after a venue event.", amount: 2350, status: "APPROVED", daysAgo: 10, note: "Approved" }],
      costs: [
        { daysAgo: 15, category: "LABOR", description: "IC&I install, 4 days", person: "Crew of 4", hours: 128, amount: 10240 },
        { daysAgo: 9, category: "VENDOR", description: "Lift rental (sub-vendor)", person: "Vendor", amount: 1000 },
        { daysAgo: 12, category: "MATERIAL", description: "Integer-procured material", person: "Supplier", amount: 1240 },
      ],
      events: [{ daysAgo: 1, who: "dl", type: "STAMP_AE202", message: "Record client stamp → Invoicing & project closure" }],
    },
    {
      site: { siteCode: "E-IBS-1029", venueName: "County Courthouse", scope: "BBU_SWAP", step: "INVOICING", stepChangedAt: daysAgo(7), sovValue: 11900, sovVersion: 1, sovAcceptedAt: daysAgo(30), rfxNumber: "RFX-76902", rfxRequestedAt: daysAgo(30), rfxReceivedAt: dateOnly(28), rfxAcceptedAt: daysAgo(28), executionStartedAt: daysAgo(18), sowCompletedAt: daysAgo(10), vssDate: dateOnly(9), vssOutcome: "PASSED", ae202SubmittedAt: daysAgo(9), ae202StampedAt: daysAgo(7), srmInvoiceNumber: "SRM-INV-5521", invoiceUploadedAt: daysAgo(6), targetDate: dateOnly(0), notes: `${SAMPLE_MARK} Step 9: invoice uploaded to SRM, waiting for Ericsson's approval.` },
      docs: [{ type: "SOV", daysAgo: 35 }, { type: "BOM", daysAgo: 35 }, { type: "RFDS", daysAgo: 35 }, { type: "AE202", daysAgo: 9 }, { type: "INVOICE", daysAgo: 6 }],
      events: [{ daysAgo: 6, who: "apm", type: "UPLOAD_INVOICE", message: "Invoice SRM-INV-5521 uploaded to SRM" }],
    },
    {
      site: { siteCode: "E-IBS-1021", venueName: "Medical Office Park", scope: "IBS_ICI", venueSqft: 80000, step: "CLOSED", stepChangedAt: daysAgo(10), sovValue: 36100, sovVersion: 1, sovAcceptedAt: daysAgo(60), rfxNumber: "RFX-76811", rfxRequestedAt: daysAgo(60), rfxReceivedAt: dateOnly(57), rfxAcceptedAt: daysAgo(57), executionStartedAt: daysAgo(45), sowCompletedAt: daysAgo(30), vssDate: dateOnly(28), vssOutcome: "PASSED", ae202SubmittedAt: daysAgo(27), ae202StampedAt: daysAgo(25), srmInvoiceNumber: "SRM-INV-5402", invoiceUploadedAt: daysAgo(24), invoiceApprovedAt: daysAgo(12), closedAt: daysAgo(10), targetDate: dateOnly(30), notes: `${SAMPLE_MARK} Closed: the full lifecycle, start to finish.` },
      docs: [{ type: "SOV", daysAgo: 65 }, { type: "BOM", daysAgo: 65 }, { type: "RFDS", daysAgo: 65 }, { type: "AE202", daysAgo: 27 }, { type: "INVOICE", daysAgo: 24 }],
      costs: [
        { daysAgo: 40, category: "LABOR", description: "IC&I install, 4 days", person: "Crew of 3", hours: 96, amount: 7680 },
        { daysAgo: 40, category: "TRAVEL", description: "Mileage and parking", person: "Crew", amount: 310 },
      ],
      events: [{ daysAgo: 10, who: "pm", type: "CLOSE_SITE", message: "Close site → Closed" }],
    },
  ];
}

export async function resetDemo(db: PrismaClient): Promise<number> {
  // DEMO-* were the first, smaller set of sample sites (before SAMPLE_MARK existed);
  // E2E-* are left behind by tools/e2e/ericsson-flow.mjs runs.
  const { count } = await db.ericssonSite.deleteMany({
    where: { OR: [{ notes: { startsWith: SAMPLE_MARK } }, { siteCode: { startsWith: "DEMO-" } }, { siteCode: { startsWith: "E2E-" } }] },
  });
  return count;
}

/** Creates the sample sites that don't exist yet. Existing sites (sample or real) are left alone. */
export async function seedDemo(db: PrismaClient): Promise<number> {
  for (const u of DEMO_USERS) await db.user.upsert({ where: { email: u.email }, update: {}, create: u });
  // The sample field engineers report to the delivery lead, who approves their expenses.
  const dlId = (await db.user.findUniqueOrThrow({ where: { email: "ashish@integertel.com" } })).id;
  await db.user.updateMany({ where: { role: "FIELD_CREW", email: { endsWith: "@example.test" }, managerId: null }, data: { managerId: dlId } });

  const id = async (email: string) => (await db.user.findUniqueOrThrow({ where: { email } })).id;
  const team = {
    pm: await id("vidhya@integertel.com"),
    apm: await id("jaspreet@integertel.com"),
    dl: await id("ashish@integertel.com"),
    pc: await id("hitesh.chaudhary@integertel.com"),
  };

  let created = 0;
  for (const s of sites()) {
    if (await db.ericssonSite.findUnique({ where: { siteCode: s.site.siteCode }, select: { id: true } })) continue;

    const site = await db.ericssonSite.create({
      data: { ...s.site, pmId: team.pm, apmId: team.apm, deliveryLeadId: team.dl, coordinatorId: team.pc, createdById: team.pc, createdAt: daysAgo(60) },
    });

    const versions = new Map<string, number>();
    for (const d of s.docs ?? []) {
      const v = (versions.get(d.type) ?? 0) + 1;
      versions.set(d.type, v);
      const fileName = `${s.site.siteCode}_${d.type}.pdf`;
      const storageKey = await saveFile(`ericsson/${site.id}`, fileName, placeholderPdf(`${d.type} for ${s.site.siteCode}`));
      await db.ericssonDocument.create({
        data: { siteId: site.id, type: d.type, fileName, mimeType: "application/pdf", sizeBytes: 600, storageKey, version: v, uploadedById: team.pc, uploadedAt: daysAgo(d.daysAgo) },
      });
    }

    for (const d of s.discrepancies ?? []) {
      await db.ericssonDiscrepancy.create({
        data: {
          siteId: site.id, item: d.item, sovValue: d.sov ?? null, bomValue: d.bom ?? null, rfdsValue: d.rfds ?? null,
          raisedById: team.apm, createdAt: daysAgo(d.daysAgo),
          ...(d.resolution ? { isResolved: true, resolution: d.resolution, resolvedById: team.apm, resolvedAt: daysAgo(d.daysAgo - 2) } : {}),
        },
      });
    }

    for (const q of s.queries ?? []) {
      await db.ericssonClientQuery.create({ data: { siteId: site.id, direction: q.direction, body: q.body, authorId: q.direction === "OUTBOUND" ? team.pm : team.apm, createdAt: daysAgo(q.daysAgo) } });
    }

    if (s.materials?.length) await db.ericssonMaterialLine.createMany({ data: s.materials.map((m) => ({ ...m, siteId: site.id })) });

    for (const c of s.crs ?? []) {
      const quote = c.type === "SUB_VENDOR" ? (c.vendorQuote ?? 0) : 0;
      const pct = c.type === "SUB_VENDOR" ? 3 : 0;
      const total = Math.round(((c.amount ?? 0) + quote * (1 + pct / 100)) * 100) / 100;
      const at = daysAgo(c.daysAgo);
      const sent = c.status !== "PM_REVIEW";
      await db.ericssonChangeRequest.create({
        data: {
          siteId: site.id, type: c.type, title: c.title, reason: c.reason, extraDays: c.extraDays ?? null,
          amount: c.amount ?? 0, vendorQuote: quote, passThroughPct: pct, total, status: c.status,
          raisedById: team.dl, createdAt: at, updatedAt: at,
          ...(sent ? { reviewedById: team.pm, reviewedAt: at, submittedAt: at } : {}),
          ...(c.status === "APPROVED" || c.status === "REJECTED" ? { decidedAt: daysAgo(Math.max(0, c.daysAgo - 2)), decisionNote: c.note ?? null } : {}),
        },
      });
    }

    for (const l of s.logs ?? []) {
      await db.ericssonDailyLog.create({
        data: {
          siteId: site.id, workDate: dateOnly(l.daysAgo), summary: l.summary, crewCount: l.crew, hoursEach: l.hours,
          blocked: Boolean(l.blocker), blockerNote: l.blocker ?? null, authorId: team.dl, createdAt: daysAgo(l.daysAgo),
        },
      });
    }

    for (const c of s.costs ?? []) {
      await db.ericssonExpense.create({
        data: {
          siteId: site.id, workDate: dateOnly(c.daysAgo), category: c.category, description: c.description,
          personName: c.person ?? null, assigned: !c.borrowed, hours: c.hours ?? null, amount: c.amount,
          createdById: team.pc, createdAt: daysAgo(c.daysAgo),
        },
      });
    }

    for (const e of s.events) {
      await db.ericssonSiteEvent.create({ data: { siteId: site.id, actorId: team[e.who], type: e.type, message: e.message, createdAt: daysAgo(e.daysAgo) } });
    }
    for (const email of CREW_ON[s.site.siteCode] ?? []) {
      await db.ericssonSiteCrew.create({ data: { siteId: site.id, userId: await id(email) } });
    }
    for (const c of CLAIMS[s.site.siteCode] ?? []) {
      const by = await db.user.findUniqueOrThrow({ where: { email: c.by }, select: { id: true, firstName: true, lastName: true } });
      const receiptKey = await saveFile(`expense-receipts/${by.id}`, "receipt.pdf", placeholderPdf(`${c.label} receipt`));
      const decided = c.status !== "SUBMITTED";
      await db.ericssonExpense.create({
        data: {
          siteId: site.id, workDate: dateOnly(c.daysAgo), category: c.type === "CABLE" ? "MATERIAL" : c.type === "OTHERS" ? "OTHER" : "TRAVEL",
          description: c.note ? `${c.label}: ${c.note}` : c.label, personName: `${by.firstName} ${by.lastName}`, amount: c.amount,
          createdById: by.id, createdAt: daysAgo(c.daysAgo), status: c.status, claimType: c.type, paymentMethod: c.pay,
          receiptKey, receiptName: "receipt.pdf", receiptMime: "application/pdf", approverId: team.dl,
          ...(decided ? { decidedById: team.dl, decidedAt: daysAgo(Math.max(0, c.daysAgo - 1)) } : {}),
          ...(c.reason ? { rejectionReason: c.reason } : {}),
        },
      });
    }

    for (const w of CREW_WORK[s.site.siteCode] ?? []) {
      const assigneeId = await id(w.to);
      const item = await db.ericssonWorkItem.create({
        data: {
          siteId: site.id, title: w.title, assigneeId, createdById: team.dl, dueDate: dateOnly(-w.dueIn), // dueIn is days ahead
          status: w.updates.at(-1)?.status ?? "TODO", completedAt: w.updates.at(-1)?.status === "DONE" ? daysAgo(w.updates.at(-1)!.daysAgo) : null,
          createdAt: daysAgo(4),
        },
      });
      for (const u of w.updates) {
        await db.ericssonWorkUpdate.create({
          data: { workItemId: item.id, userId: assigneeId, workDate: dateOnly(u.daysAgo), hours: u.hours, status: u.status, note: u.note ?? null, createdAt: daysAgo(u.daysAgo) },
        });
      }
    }
    created++;
  }
  return created;
}
