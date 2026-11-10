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
r = await fin("PATCH", `/users/${id("vidhya@integertel.com")}`, { role: "VIEWER" });
ok(r.status === 403, `non-admin cannot change roles (${r.status})`);

console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
