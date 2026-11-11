// End-to-end walk of one Ericsson site through SOP steps 1–9 against a running API.
// Needs DEV_LOGIN=true and the seeded users. Usage: BASE_URL=http://localhost:8080/api node tools/e2e/ericsson-flow.mjs
const BASE = (process.env.BASE_URL ?? "http://localhost:3000/api").replace(/\/$/, "");
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`); if (!cond) failures++; };

async function login(email) {
  const r = await fetch(`${BASE}/auth/dev-login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
  const j = await r.json();
  if (!j.accessToken) throw new Error(`login failed for ${email}: ${JSON.stringify(j)}`);
  return j.accessToken;
}

function client(token) {
  return async (method, path, body) => {
    const init = { method, headers: { authorization: `Bearer ${token}` } };
    if (body instanceof FormData) init.body = body;
    else if (body !== undefined) { init.headers["content-type"] = "application/json"; init.body = JSON.stringify(body); }
    const r = await fetch(`${BASE}${path}`, init);
    const text = await r.text();
    let json; try { json = JSON.parse(text); } catch { json = text; }
    return { status: r.status, json };
  };
}

const pm = client(await login("vidhya@integertel.com"));
const apm = client(await login("jaspreet@integertel.com"));
const dl = client(await login("ashish@integertel.com"));
const fin = client(await login("siddhant@integertel.com"));
const users = (await pm("GET", "/users")).json;
const id = (email) => users.find((u) => u.email === email).id;

// Create
const code = `E2E-${Date.now().toString().slice(-6)}`;
let r = await pm("POST", "/ericsson/sites", {
  siteCode: code, venueName: "E2E Test Venue", scope: "IBS_ICI", venueSqft: 50000,
  pmId: id("vidhya@integertel.com"), apmId: id("jaspreet@integertel.com"), deliveryLeadId: id("ashish@integertel.com"),
});
ok(r.status === 201, `create site ${code} (${r.status})`);
const siteId = r.json.id;
r = await pm("POST", "/ericsson/sites", { siteCode: code, venueName: "dup", scope: "IBS_ICI" });
ok(r.status === 409, `duplicate site ID rejected (${r.status})`);
r = await fin("POST", "/ericsson/sites", { siteCode: code + "X", venueName: "x", scope: "IBS_ICI" });
ok(r.status === 403, `finance cannot create sites (${r.status})`);

const act = (c, body) => c("POST", `/ericsson/sites/${siteId}/actions`, body);
const upload = async (c, type, name) => {
  const fd = new FormData();
  fd.append("type", type);
  fd.append("file", new Blob([`%PDF-1.4 test ${type}`], { type: "application/pdf" }), name);
  return c("POST", `/ericsson/sites/${siteId}/documents`, fd);
};

// Step 1
r = await act(pm, { action: "SUBMIT_FOR_VERIFICATION" });
ok(r.status === 409 && r.json.details?.blockers?.length === 3, `step 1 gate: 3 docs missing (${r.status} ${JSON.stringify(r.json.details?.blockers)})`);
for (const t of ["SOV", "BOM", "RFDS"]) {
  r = await upload(pm, t, `${t}.pdf`);
  ok(r.status === 201, `upload ${t} (${r.status})`);
}
r = await act(pm, { action: "SUBMIT_FOR_VERIFICATION" });
ok(r.status === 200 && r.json.step === "CROSS_VERIFICATION", `→ step 2 (${r.json.step})`);

// Step 2
r = await apm("POST", `/ericsson/sites/${siteId}/discrepancies`, { item: "RRU count", sovValue: "8", bomValue: "6", rfdsValue: "8" });
ok(r.status === 201, "flag discrepancy");
const discId = r.json.id;
r = await apm("POST", `/ericsson/sites/${siteId}/client-queries`, { direction: "OUTBOUND", body: "BOM shows 6 RRUs; SOV 8?" });
ok(r.status === 201, "log question to Ericsson PM");
r = await act(apm, { action: "ACCEPT_SOV", sovValue: 41750, sovVersion: 2 });
ok(r.status === 409, `SOV blocked while discrepancy open (${r.json.error})`);
r = await apm("POST", `/ericsson/discrepancies/${discId}/resolve`, { resolution: "Ericsson confirmed 8; BOM reissued" });
ok(r.status === 200 && r.json.isResolved, "resolve discrepancy");
r = await act(dl, { action: "ACCEPT_SOV", sovValue: 41750, sovVersion: 2 });
ok(r.status === 403, `delivery lead cannot accept SOV (RACI) (${r.status})`);
r = await act(apm, { action: "ACCEPT_SOV", sovValue: 41750, sovVersion: 2 });
ok(r.status === 200 && r.json.step === "SOV_RFX" && r.json.verificationLoops === 1, `→ step 3, loops=${r.json.verificationLoops}`);

// Step 3
r = await act(apm, { action: "REQUEST_RFX" });
ok(r.status === 200 && r.json.step === "SOV_RFX" && r.json.rfxRequestedAt, "RFX requested (stays at step 3)");
r = await act(apm, { action: "RECORD_RFX", rfxNumber: "RFX-77150", receivedOn: "2026-11-10" });
ok(r.status === 200 && r.json.step === "MATERIALS", `→ step 4 (${r.json.step})`);

// Step 4
r = await apm("POST", `/ericsson/sites/${siteId}/materials`, { item: "BBU 6630", bomQty: 2, orderQty: 2, status: "ORDERED" });
ok(r.status === 201, "add material line (ordered)");
const matId = r.json.id;
r = await act(apm, { action: "START_EXECUTION" });
ok(r.status === 409, `execution blocked by uncovered material (${r.json.error})`);
r = await apm("PATCH", `/ericsson/materials/${matId}`, { status: "RECEIVED" });
ok(r.status === 200 && r.json.status === "RECEIVED", "material received");
r = await act(apm, { action: "START_EXECUTION" });
ok(r.status === 200 && r.json.step === "EXECUTION", `→ step 5 (${r.json.step})`);

// Step 5 + CRs
r = await act(dl, { action: "COMPLETE_SOW" });
ok(r.status === 409, `SOW completion needs a daily log (${r.json.error})`);
r = await dl("POST", `/ericsson/sites/${siteId}/daily-logs`, { workDate: "2026-11-10", summary: "Antennas mounted", crewCount: 4, hoursEach: 8, blocked: true, blockerNote: "Ceiling access" });
ok(r.status === 201, "daily log");
// Daily tracker costs
r = await dl("POST", `/ericsson/sites/${siteId}/expenses`, { workDate: "2026-11-10", category: "LABOR", description: "Antennas", amount: 2560 });
ok(r.status === 400, `labor cost needs hours (${r.status})`);
r = await dl("POST", `/ericsson/sites/${siteId}/expenses`, { workDate: "2026-11-10", category: "LABOR", description: "Antennas", personName: "Crew of 4", hours: 32, amount: 2560 });
ok(r.status === 201, "delivery lead records labor cost");
r = await fin("POST", `/ericsson/sites/${siteId}/expenses`, { workDate: "2026-11-10", category: "LABOR", description: "Borrowed RF tech", hours: 6, amount: 420, assigned: false });
ok(r.status === 201, "finance records a borrowed-resource cost");
const finCost = r.json.id;
r = await fin("GET", `/ericsson/expenses?siteId=${siteId}`);
ok(r.status === 200 && r.json.totals.total === 2980 && r.json.totals.borrowedHours === 6, `cost totals ${r.json.totals?.total}, borrowed hrs ${r.json.totals?.borrowedHours}`);
r = await dl("DELETE", `/ericsson/expenses/${finCost}`);
ok(r.status === 403, `delivery lead cannot remove someone else's cost (${r.status})`);
r = await pm("DELETE", `/ericsson/expenses/${finCost}`);
ok(r.status === 204, "PM removes a cost line");

r = await dl("POST", `/ericsson/sites/${siteId}/change-requests`, { type: "SUB_VENDOR", title: "Core drilling", reason: "Licensed sub-vendor requested", vendorQuote: 6000 });
ok(r.status === 201 && Number(r.json.total) === 6180 && Number(r.json.passThroughPct) === 3, `CR with 3% pass-through total=${r.json.total}`);
const crId = r.json.id;
r = await dl("POST", `/ericsson/change-requests/${crId}/transition`, { to: "SUBMITTED" });
ok(r.status === 403, `delivery lead cannot send CR to Ericsson (${r.status})`);
r = await pm("POST", `/ericsson/change-requests/${crId}/transition`, { to: "SUBMITTED" });
ok(r.status === 200 && r.json.status === "SUBMITTED", "PM sends CR to Ericsson");
r = await pm("POST", `/ericsson/change-requests/${crId}/transition`, { to: "SUBMITTED" });
ok(r.status === 409, `same move twice is rejected (${r.status})`);
r = await act(dl, { action: "COMPLETE_SOW" });
ok(r.status === 200 && r.json.step === "VSS_AE202", `→ step 7 (${r.json.step})`);

// Step 7
r = await act(dl, { action: "RECORD_VSS", vssDate: "2026-11-12", outcome: "FAILED" });
ok(r.status === 200, "VSS failed recorded");
r = await act(dl, { action: "SUBMIT_AE202" });
ok(r.status === 409 && r.json.details.blockers.length === 2, `AE202 blocked: failing VSS + no file`);
r = await act(dl, { action: "RECORD_VSS", vssDate: "2026-11-13", outcome: "PASSED" });
r = await upload(dl, "AE202", "AE202.pdf");
r = await act(dl, { action: "SUBMIT_AE202" });
ok(r.status === 200, "AE202 submitted");
r = await act(dl, { action: "STAMP_AE202" });
ok(r.status === 200 && r.json.step === "INVOICING", `→ step 9 (${r.json.step})`);

// Step 9
r = await act(apm, { action: "UPLOAD_INVOICE", srmInvoiceNumber: "SRM-1" });
ok(r.status === 409, `invoice blocked by open CR (${r.json.error})`);
r = await pm("POST", `/ericsson/change-requests/${crId}/transition`, { to: "APPROVED", note: "Approved by E// PM" });
ok(r.status === 200 && r.json.status === "APPROVED", "CR approved");
r = await act(apm, { action: "UPLOAD_INVOICE", srmInvoiceNumber: "SRM-1" });
ok(r.status === 200, "invoice uploaded");
r = await act(apm, { action: "APPROVE_INVOICE" });
ok(r.status === 200, "invoice approved");
r = await act(apm, { action: "CLOSE_SITE" });
ok(r.status === 403, `APM cannot close (PM only) (${r.status})`);
r = await act(pm, { action: "CLOSE_SITE" });
ok(r.status === 200 && r.json.step === "CLOSED", `→ CLOSED (${r.json.step})`);

// Reads
r = await fin("GET", `/ericsson/sites/${siteId}`);
ok(r.status === 200 && r.json.events.length >= 15, `finance can read; ${r.json.events.length} activity events`);
r = await pm("GET", "/ericsson/summary");
ok(r.status === 200 && typeof r.json.counts.CLOSED === "number", `summary: active=${r.json.activeSites} closed=${r.json.counts.CLOSED}`);
r = await pm("GET", "/ericsson/sites?mine=false");
ok(r.status === 200 && !r.json.some((s) => s.id === siteId), "closed site hidden from default list");
r = await pm("GET", "/ericsson/sites?includeClosed=true");
ok(r.json.some((s) => s.id === siteId), "includeClosed=true shows it");
const doc = (await pm("GET", `/ericsson/sites/${siteId}`)).json.documents[0];
r = await fetch(`${BASE}/ericsson/documents/${doc.id}/download`, { headers: { authorization: "Bearer bad" } });
ok(r.status === 401, `download requires auth (${r.status})`);
r = await fin("GET", "/ericsson/reports/revenue-cost");
const mine = r.json.sites?.find((s) => s.id === siteId);
ok(r.status === 200 && mine?.billing === "APPROVED" && mine.contractValue === 47930 && mine.cost === 2560,
  `report: contract ${mine?.contractValue} (SOV 41,750 + CR 6,180), cost ${mine?.cost}, ${mine?.billing}`);
r = await dl("GET", "/ericsson/reports/revenue-cost");
ok(r.status === 403, `delivery lead cannot see financial reports (${r.status})`);
r = await fetch(`${BASE}/ericsson/sites/export?includeClosed=true`, { headers: { authorization: `Bearer ${await login("ashish@integertel.com")}` } });
ok(r.status === 200 && (r.headers.get("content-type") ?? "").includes("spreadsheetml"), `site tracker exports to Excel (${r.status})`);
// Field crew: email-code sign-in and deny-by-default access
const crewEmail = `e2e.crew.${Date.now()}@example.test`;
const admin = client(await login("niranjan.tamhane@integertel.com"));
r = await admin("POST", "/users", { email: crewEmail, firstName: "E2E", lastName: "Crew", role: "FIELD_CREW" });
ok(r.status === 201, "admin adds a Field crew user");
const crewId = r.json.id;
const reqCode = async (email) => (await fetch(`${BASE}/auth/otp/request`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) })).json();
const staffCode = await reqCode("vidhya@integertel.com");
ok(staffCode.sent === true && staffCode.devCode === undefined, "staff email gets no code (same answer, no code)");
const c1 = await reqCode(crewEmail);
ok(/^\d{6}$/.test(c1.devCode ?? ""), "crew gets a 6-digit code (shown on test servers without email)");
const verify = (code) => fetch(`${BASE}/auth/otp/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: crewEmail, code }) }).then(async (x) => ({ status: x.status, json: await x.json() }));
r = await verify(c1.devCode === "000000" ? "111111" : "000000");
ok(r.status === 401, "wrong code is rejected");
r = await verify(c1.devCode);
ok(r.status === 200 && r.json.accessToken, "crew signs in with the code");
const crew = client(r.json.accessToken);
r = await verify(c1.devCode);
ok(r.status === 401, "a code works only once");

// A fresh site in execution for the crew to work on.
r = await pm("POST", "/ericsson/sites", { siteCode: `${code}-C`, venueName: "E2E Crew Venue", scope: "IBS_ICI", deliveryLeadId: id("ashish@integertel.com") });
const crewSite = r.json.id;
r = await crew("GET", "/field/sites");
ok(r.status === 200 && r.json.length === 0, "crew sees no sites before being assigned");
r = await crew("GET", `/field/sites/${crewSite}`);
ok(r.status === 403, `crew cannot open a site they're not on (${r.status})`);
r = await pm("PUT", `/ericsson/sites/${crewSite}/crew`, { userIds: [crewId] });
ok(r.status === 200, "PM assigns the crew member");
r = await pm("PUT", `/ericsson/sites/${crewSite}/crew`, { userIds: [id("ashish@integertel.com")] });
ok(r.status === 400, "only Field crew users can be on a crew");
r = await crew("GET", `/field/sites/${crewSite}`);
ok(r.status === 200 && r.json.siteCode === `${code}-C` && r.json.sovValue === undefined, "crew sees the site, without money");
r = await crew("POST", `/ericsson/sites/${crewSite}/daily-logs`, { workDate: "2026-11-10", summary: "Cable pulls", crewCount: 2, hoursEach: 8 });
ok(r.status === 403, `crew don't submit the site's headcount log (${r.status})`);

// Crew work: assigned to one person, updated by that person.
r = await crew("POST", `/ericsson/sites/${crewSite}/work-items`, { title: "x", assigneeId: crewId });
ok(r.status === 403, `crew cannot assign work (${r.status})`);
r = await pm("POST", `/ericsson/sites/${crewSite}/work-items`, { title: "Mount antennas, level 2", assigneeId: id("ashish@integertel.com") });
ok(r.status === 400, "work can only go to someone on the site's crew");
r = await pm("POST", `/ericsson/sites/${crewSite}/work-items`, { title: "Mount antennas, level 2", assigneeId: crewId, dueDate: "2026-11-12" });
ok(r.status === 201, "PM assigns work to the crew member");
const workId = r.json.id;
r = await crew("GET", "/field/my-work");
ok(r.status === 200 && r.json.some((w) => w.id === workId && w.status === "TODO"), "crew sees the work in My work");
r = await crew("POST", `/field/work-items/${workId}/updates`, { status: "BLOCKED", hours: 2 });
ok(r.status === 400, "blocked needs a reason");
r = await crew("POST", `/field/work-items/${workId}/updates`, { status: "CANCELLED", hours: 0 });
ok(r.status === 403, "crew cannot cancel work");
r = await crew("POST", `/field/work-items/${workId}/updates`, { status: "IN_PROGRESS", hours: 6, note: "Half the antennas up" });
ok(r.status === 201, "crew updates their own work (in progress, 6 hrs)");
// A second crew member on the site can't touch work that isn't theirs.
const crew2Email = `e2e.crew2.${Date.now()}@example.test`;
const crew2Id = (await admin("POST", "/users", { email: crew2Email, firstName: "E2E", lastName: "Crew Two", role: "FIELD_CREW" })).json.id;
await pm("PUT", `/ericsson/sites/${crewSite}/crew`, { userIds: [crewId, crew2Id] });
const c2 = await reqCode(crew2Email);
const crew2 = client((await fetch(`${BASE}/auth/otp/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: crew2Email, code: c2.devCode }) }).then((x) => x.json())).accessToken);
r = await crew2("POST", `/field/work-items/${workId}/updates`, { status: "DONE", hours: 1 });
ok(r.status === 403, `another crew member cannot update it (${r.status})`);

// The SOW gate waits for crew work.
await pm("POST", `/ericsson/sites/${crewSite}/documents`, (() => { const f = new FormData(); f.append("type", "SOV"); f.append("file", new Blob(["%PDF"], { type: "application/pdf" }), "s.pdf"); return f; })());
await pm("PATCH", `/ericsson/sites/${crewSite}`, {});
r = await crew("POST", `/field/work-items/${workId}/updates`, { status: "DONE", hours: 2, note: "All up" });
ok(r.status === 201, "crew marks their work done");
r = await pm("GET", `/ericsson/sites/${crewSite}`);
const w = r.json.workItems.find((x) => x.id === workId);
ok(w?.status === "DONE" && w.completedAt && w.updates.length === 2, `site shows the work done with 2 updates (${w?.status})`);
// FE expense claims: bill attached, manager approves, only then Finance sees it.
const claimForm = (fields, withReceipt = true) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, String(v));
  if (withReceipt) f.append("receipt", new Blob(["%PDF-1.4 receipt"], { type: "application/pdf" }), "toll.pdf");
  return f;
};
const claim = { siteId: crewSite, expenseType: "TRAVEL_TOLL", workDate: "2026-11-10", amount: "25", paymentMethod: "PERSONAL_CARD", note: "Tolls" };
r = await crew("POST", "/field/expenses", claimForm(claim, false));
ok(r.status === 400, "an expense needs the bill attached");
r = await crew("POST", "/field/expenses", claimForm(claim));
ok(r.status === 201 && r.json.status === "SUBMITTED" && r.json.approver?.email === "ashish@integertel.com" && r.json.receiptKey === undefined,
  `FE submits an expense; it goes to the site's delivery lead (no manager set) (${r.json.approver?.email})`);
const claimId = r.json.id;
r = await crew("GET", "/field/expenses");
ok(r.json.some((c) => c.id === claimId && c.status === "SUBMITTED"), "FE sees their claim waiting for approval");
r = await fin("GET", `/ericsson/expenses?siteId=${crewSite}`);
ok(!r.json.rows.some((x) => x.id === claimId), "Finance can't see it before approval");
r = await fin("GET", `/expenses/${claimId}/receipt`);
ok(r.status === 403, `Finance can't open the bill before approval (${r.status})`);
r = await crew("POST", `/expense-approvals/${claimId}/decide`, { decision: "APPROVE" });
ok(r.status === 403, "the FE can't approve their own expense");
r = await pm("POST", `/expense-approvals/${claimId}/decide`, { decision: "APPROVE" });
ok(r.status === 403, "a PM who isn't the approver can't approve it");
r = await dl("GET", "/expense-approvals");
ok(r.json.some((c) => c.id === claimId), "the approver sees it in Expense approvals");
r = await dl("POST", `/expense-approvals/${claimId}/decide`, { decision: "REJECT" });
ok(r.status === 400, "rejecting needs a reason");
r = await dl("POST", `/expense-approvals/${claimId}/decide`, { decision: "APPROVE" });
ok(r.status === 200 && r.json.status === "APPROVED", "the manager approves it");
r = await dl("POST", `/expense-approvals/${claimId}/decide`, { decision: "APPROVE" });
ok(r.status === 409, "it can't be decided twice");
r = await fin("GET", `/ericsson/expenses?siteId=${crewSite}`);
ok(r.json.rows.some((x) => x.id === claimId && x.category === "TRAVEL") && r.json.totals.owedToEngineers === 25, "Finance now sees it as a travel cost, $25 owed to the FE");
r = await fin("GET", `/expenses/${claimId}/receipt`);
ok(r.status === 200, "Finance can open the bill after approval");
r = await fin("GET", "/ericsson/reports/revenue-cost");
ok(r.json.sites.find((s) => s.id === crewSite)?.otherCost === 25, "the approved expense counts in the cost report");
r = await fin("POST", `/ericsson/expenses/${claimId}/reimbursed`);
ok(r.status === 200 && r.json.reimbursedAt, "Finance marks the personal-card claim reimbursed");
r = await crew("DELETE", `/field/expenses/${claimId}`);
ok(r.status === 409, "an approved claim can't be withdrawn");
r = await crew("POST", "/field/expenses", claimForm({ ...claim, expenseType: "HOTEL", amount: "140", paymentMethod: "CORPORATE_CARD" }));
const claim2 = r.json.id;
r = await dl("POST", `/expense-approvals/${claim2}/decide`, { decision: "REJECT", reason: "Wrong site" });
ok(r.status === 200 && r.json.status === "REJECTED", "the manager rejects a claim with a reason");
r = await crew2("GET", `/expenses/${claim2}/receipt`);
ok(r.status === 403, "another FE can't see the claim");
r = await crew("DELETE", `/field/expenses/${claim2}`);
ok(r.status === 204, "the FE withdraws the rejected claim");

for (const [m, p] of [["GET", "/ericsson/sites"], ["GET", "/ericsson/summary"]]) await crew2(m, p);
await admin("PATCH", `/users/${crew2Id}`, { isActive: false });
const photo = new FormData(); photo.append("type", "PHOTO"); photo.append("file", new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }), "p.png");
r = await crew("POST", `/ericsson/sites/${crewSite}/documents`, photo);
ok(r.status === 201, "crew uploads a site photo");
const sov = new FormData(); sov.append("type", "SOV"); sov.append("file", new Blob(["%PDF"], { type: "application/pdf" }), "s.pdf");
r = await crew("POST", `/ericsson/sites/${crewSite}/documents`, sov);
ok(r.status === 403, `crew cannot upload an SOV (${r.status})`);
r = await crew("POST", `/ericsson/sites/${crewSite}/change-requests`, { type: "EXTRA_VISIT", title: "Lift out", reason: "Venue lift broken" });
ok(r.status === 201, "crew raises a change request");
for (const [m, p] of [["GET", "/ericsson/sites"], ["GET", `/ericsson/sites/${crewSite}`], ["GET", "/ericsson/summary"], ["GET", "/ericsson/reports/revenue-cost"], ["GET", "/users"], ["GET", "/ericsson/my-work"]]) {
  r = await crew(m, p);
  ok(r.status === 403, `crew blocked from ${m} ${p} (${r.status})`);
}
// Site visits: check in / out with location, location trail while checked in.
r = await pm("PATCH", `/ericsson/sites/${crewSite}`, { latitude: 40.7128 });
ok(r.status === 400, "site map position needs both latitude and longitude");
r = await pm("PATCH", `/ericsson/sites/${crewSite}`, { latitude: 40.7128, longitude: -74.006 });
ok(r.status === 200, "PM sets the site's map position");
r = await crew("GET", "/field/visits/current");
ok(r.status === 200 && r.json.visit === null && r.json.consentAt === null && r.json.intervalSeconds >= 30, "FE has no open visit and hasn't agreed to location sharing yet");
r = await crew("POST", `/field/sites/${crewSite}/check-in`, { lat: 40.7130, lng: -74.0061, accuracy: 12 });
ok(r.status === 400 && r.json.details?.code === "CONSENT_REQUIRED", "check-in asks for consent the first time");
r = await pm("POST", `/field/sites/${crewSite}/check-in`, { lat: 40.7130, lng: -74.0061, consent: true });
ok(r.status === 403, `check-in is for field engineers (${r.status})`);
r = await crew("POST", `/field/sites/${crewSite}/check-in`, { lat: 40.7130, lng: -74.0061, accuracy: 12, consent: true, source: "app" });
ok(r.status === 201 && r.json.visit.distanceM < 50 && r.json.visit.far === false && r.json.visit.pointCount === 1, "FE checks in on site (distance from site recorded, first point saved)");
const visitId = r.json.visit.id;
r = await crew("POST", `/field/sites/${crewSite}/check-in`, { lat: 40.7130, lng: -74.0061 });
ok(r.status === 409, "can't check in twice");
const at = (msAgo) => new Date(Date.now() - msAgo).toISOString();
r = await crew("POST", `/field/visits/${visitId}/points`, { points: [
  { lat: 40.7131, lng: -74.0062, accuracy: 9, recordedAt: at(0) },
  { lat: 40.7, lng: -74, recordedAt: at(3_600_000) },
] });
ok(r.status === 200 && r.json.saved === 1 && r.json.ignored === 1, "location points from during the visit are saved; one from before check-in is ignored");
r = await crew2("POST", `/field/visits/${visitId}/points`, { points: [{ lat: 1, lng: 1, recordedAt: at(0) }] });
ok(r.status === 401 || r.status === 403, `another FE can't add to the visit (${r.status})`);
r = await crew("GET", `/ericsson/sites/${crewSite}/visits`);
ok(r.status === 403, "FEs can't see the managers' location view");
r = await fin("GET", `/ericsson/sites/${crewSite}/visits`);
ok(r.status === 403, "Finance can't see FE locations");
r = await dl("GET", `/ericsson/sites/${crewSite}/visits`);
ok(r.status === 200 && r.json[0]?.id === visitId && r.json[0].checkOutAt === null && r.json[0].pointCount === 2, "delivery lead sees who is on site now, with the location trail count");
r = await dl("GET", `/ericsson/visits/${visitId}/points`);
ok(r.status === 200 && r.json.length === 2, "delivery lead sees the location trail");
r = await crew("POST", `/field/visits/${visitId}/check-out`, { lat: 40.7129, lng: -74.006, accuracy: 10 });
ok(r.status === 200 && r.json.visit.checkOutBy === "FE" && r.json.visit.pointCount === 3, "FE checks out (final location saved)");
r = await crew("GET", "/field/visits/current");
ok(r.json.visit === null && r.json.consentAt, "after check-out no visit is open, and consent is remembered");
r = await crew("POST", `/field/sites/${crewSite}/check-in`, { lat: 41.5, lng: -74.006 });
ok(r.status === 201 && r.json.visit.far === true, "checking in far from the site is flagged (no consent prompt the second time)");
r = await dl("POST", `/ericsson/visits/${r.json.visit.id}/check-out`);
ok(r.status === 200 && r.json.visit.checkOutBy === "MANAGER", "a manager can close a visit the FE forgot");
r = await pm("GET", `/ericsson/sites/${crewSite}`);
ok(r.json.events.some((e) => e.type === "CHECK_IN") && r.json.events.some((e) => e.type === "CHECK_OUT"), "check-ins and check-outs appear in the site activity");

r = await admin("PATCH", `/users/${crewId}`, { isActive: false });

r = await fin("PATCH", `/users/${id("vidhya@integertel.com")}`, { role: "VIEWER" });
ok(r.status === 403, `non-admin cannot change roles (${r.status})`);

console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
