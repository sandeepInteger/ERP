# Integer ERP — Claude Instructions & Project Hand-off

Project tracker for **Integer Telecom Services** client work. Read this file first: it is the hand-off
between sessions, so a new agent should not need to re-explore the repo. Keep it current when you change
something it describes (see "Keeping this file current" at the end).

Owner / product contact: Niranjan Tamhane (Admin in the seed).
Architecture, folder layout and conventions mirror the HRMS project at `C:\IntegerTel\Projects\hrms-ClaudeCode`
(Fastify + Prisma + React/Vite/Tailwind + shadcn-style primitives). When in doubt, do what HRMS does.

---

## 1. Decisions already made (do not re-litigate)
- **Stack:** Fastify 4 + Prisma 6 + PostgreSQL API, React 18 + Vite 6 + Tailwind v4 web, pnpm + Turborepo monorepo. The user said "MERN" but chose Fastify to match HRMS.
- **Client workflows are separate.** Ericsson IBS and AT&T are independent modules (own tables, routes, pages, vocabulary). Never merge them into a shared lifecycle. Only platform plumbing is shared.
- **No Clappia / no-code platform.** Custom build.
- **Sign-in:** staff use Microsoft (Azure Entra ID, OIDC code flow). **Field engineers** use a 6-digit **email one-time code**. No passwords. No auto-provisioning: an admin adds the user first.
- **"Field engineer (FE)"** is the business name for on-site technicians. The internal role key is still `FIELD_CREW` (enum, code, table `ericsson_site_crew`); only labels say FE. Don't rename the key without a migration plan.
- FEs **update their own assigned work items** — they do not submit the site's headcount daily log (that is the delivery lead's site summary).
- FE **expense claims** need a bill, are approved by the FE's **manager**, and are invisible to Finance / excluded from costs until approved.
- Workflow-button permissions live in **code** (`ERICSSON_ACTIONS`), not the editable RACI table, because they also drive "My work" task assignment. The RACI table's Consulted/Informed drive notifications only.
- Prototype (UI reference, 17 screens): https://claude.ai/artifact/LSk4wSP59R8BxpKj1THx3Q · PDF: `prototypes/Ericsson-IBS-Prototype.pdf`.
- Source SOPs: `docs/Ericsson IBS Project Work Flow 1.pdf`, `docs/AT&T Project Work Flow 1.pdf`.

## 2. Status (as of 2026-11-11)
**Git:** `main` = commit `6c4cf7c` "Foundation and Ericsson IBS core" (pushed; remote moved to
`https://github.com/Integer-Telecom-Inc/Integer-ERP-System.git`, local `origin` still points at the old `IntergerDevs` URL which redirects).
Features 3.6–3.13 + hand-off hooks are committed as `2e6bfbb` on branch **`feature/ericsson-fe-and-ops`** (pushed,
not yet merged to `main`; PR: https://github.com/Integer-Telecom-Inc/Integer-ERP-System/pull/new/feature/ericsson-fe-and-ops).
Ask before committing; push to a review branch, not `main`.

**Built (Ericsson IBS module):**
| # | Feature | Where (web route) |
|---|---|---|
| 3.1 | Users & roles, Microsoft SSO, dev sign-in, audit log | `/admin/users`, `/login` |
| 3.2 | Site workflow SOP steps 1–9 with gates, action panel, activity trail | `/ericsson/sites`, `/ericsson/sites/:id` |
| 3.3 | Documents (SOV/BOM/RFDS/AE202/photos), verification (discrepancies + Ericsson PM thread), materials, daily log | site tabs |
| 3.4 | Change requests (PM review → Ericsson decision, 3% sub-vendor pass-through) | `/ericsson/change-requests`, site tab |
| 3.5 | Dashboard (KPIs, sites by step, needs attention) | `/dashboard` |
| 3.6 | My work inbox (tasks from site state + RACI; leadership escalations) | `/my-work` |
| 3.7 | Daily tracker & costs (labor/material/travel/vendor, borrowed resources) | `/ericsson/expenses`, site "Costs" tab |
| 3.8 | Revenue & cost reports (bimonthly/MBR/QBR) + Excel exports | `/ericsson/reports`, tracker "Export to Excel" |
| 3.9 | Phone field views; collapsible mobile menu | `/field` |
| 3.10 | Notifications bell, SOP Appendix C distribution lists, escalation ladder, scheduled jobs, optional SMTP email | bell, `/admin/notifications` |
| 3.11 | RACI matrix (editable by admin; C/I notified) | `/admin/raci` |
| 3.12 | FE email-code sign-in; FE assigned to sites; FE work items they update themselves | login page, site Overview "Field engineers", site "FE work" tab, `/field/work/:id` |
| 3.13 | FE expense claims (15 types, corporate/personal card, bill required) → manager approval → Finance; reimbursement | `/field/expenses`, `/approvals/expenses` |

**Not built yet (backlog, roughly in priority order):**
1. AT&T module (separate workflow) — blocked on SOP questions (step numbering conflicts, missing Appendix A).
2. Production hosting (HRMS uses AWS ECS/RDS/S3), CI (typecheck, tests, e2e on push), backups, error logging.
3. S3 document storage (today: local disk via `apps/api/src/lib/storage.ts` — only that file must change).
4. PWA "add to home screen" for FEs.

**Open business questions** (put answers into code/seed when received):
- Escalation chain: SOP lists Sales leader as both L2 and L3; current default PM → Ops leader → Sales leader (3/5/8 days).
- RACI "Send CR for approval" has no Responsible role in the SOP; C/I columns empty.
- Margin definition (vs contract value; sites with no costs show 100%).
- Real managers for FEs (sample FEs report to Ashish Vashisht); emails for Narsimha Rao / Aniket Gupta (vendor invoicing list).
- Seed team emails from the SOP may not match real Microsoft logins (e.g. `siddhant@`).

## 3. Repo map
```
apps/api/                 Fastify API (@erp/api)
  prisma/schema.prisma    all models; migrations in prisma/migrations (6 so far, never edit an applied one)
  src/app.ts              registers plugins + every route + scheduled jobs
  src/plugins/auth.ts     app.authenticate / requireRole; FIELD_CREW deny-by-default check
  src/lib/                http (httpError, defined, queryBool, day), storage (local files), email (SMTP),
                          notify (bell + email + lists), spreadsheet (Excel), crew-access (FE route allowlist)
  src/jobs/ericsson-jobs  escalations, stand-up digest, bimonthly report reminder (every 15 min, idempotent)
  src/modules/auth/       auth (refresh/logout/me/dev-login), sso (Microsoft), otp (FE email codes)
  src/modules/ericsson/   sites, workflow gates, documents, verification, materials, change-requests,
                          daily-logs, expenses (cost lines), claims (FE expenses + approvals), reports,
                          my-work, field (FE-safe site data + crew assignment), work-items, notify hooks
  src/modules/{users,raci,notifications,settings,health}
  src/seed.ts             users + RACI + distribution lists + escalation (real config)
  src/seed-demo.ts        SAMPLE data: 10 sites at every step, test users, FE work, claims (SEED_DEMO=true)
apps/web/                 React SPA (@erp/web)
  src/App.tsx             all routes
  src/components/ui/      primitives (Button, AsyncButton, Badge, Card, Input/Textarea/SelectField, Table, Tabs/Chips, Checkbox, Field, Progress)
  src/components/         AppShell, SidebarNav (role-filtered menu), TopHeaderBar (+ ThemeToggle, NotificationBell), EmailCodeLogin, SummaryStatCard, PageHeader
  src/components/ericsson/ site-page sections and forms
  src/pages/              Dashboard, Login, ExpenseApprovals, admin/*, ericsson/*, field/* (phone-first)
  src/lib/                api (axios + token refresh), ericsson (response types, tones), format, download (downloadFile/viewFile), theme (light/dark)
packages/types/src/       roles.ts (Role, labels, role sets) · ericsson.ts (steps, actions+roles, statuses, labels, FE expense types, lists)
.claude/settings.json + .claude/hooks/handoff-check.mjs   hooks that keep this file current (see §10)
tools/e2e/ericsson-flow.mjs   end-to-end API check (102 checks); needs DEV_LOGIN + seeded users
docker-compose.test.yml   Postgres 16 + migrate/seed + API + web(nginx) on :8080, e2e profile
docs/local-dev-setup.md   full setup, users & sample data, FE sign-in, FE work, FE expenses, Docker
```

## 4. Domain model cheat-sheet
**Roles** (`packages/types/src/roles.ts`, mirrored in Prisma `Role`): ADMIN, SALES_LEADER, OPS_LEADER, PROJECT_MANAGER, ASSOCIATE_PM, DELIVERY_LEAD, COORDINATOR, FINANCE, VIEWER, FIELD_CREW (= FE).
Key sets: `LEADERSHIP_ROLES`, `ERICSSON_EDIT_ROLES` (can change sites), `ERICSSON_FINANCE_VIEW_ROLES` (see money), `ERICSSON_EXPENSE_ROLES`, `ALWAYS_ACT` (Admin, Ops leader do any workflow action), `EXPENSE_APPROVER_OVERRIDE_ROLES`.

**Ericsson site steps** (`EricssonStep`): DOCS_RECEIVED(1) → CROSS_VERIFICATION(2) → SOV_RFX(3) → MATERIALS(4) → EXECUTION(5) → VSS_AE202(7) → INVOICING(9) → CLOSED. CRs (SOP 6 & 8) are a parallel track.
Gates in `ericsson.workflow.ts` (`gateFailures`): SOV/BOM/RFDS uploaded; no open discrepancies; RFX accepted; materials covered; daily log or FE work update exists **and all FE work items done**; passing VSS + AE202 file; no open CRs before invoice/close.
Actions run in a transaction with `SELECT … FOR UPDATE`, re-check gates, write an activity event, then fire notifications.

**FE (FIELD_CREW) access:** deny-by-default allowlist in `apps/api/src/lib/crew-access.ts`; routes then check "on this site's crew" (`assertCanWorkOnSite`) / "own item/claim". FEs never see money, documents list, other sites, reports or admin. Web: `AppShell` bounces FEs to `/field`; sidebar shows only items flagged `crew: true`.

**Expenses** live in one table `ericsson_expenses`: staff cost lines are `status=APPROVED` immediately; FE claims start `SUBMITTED` with `claimType`, `paymentMethod`, `receipt*`, `approverId`. Every money view filters `status: "APPROVED"`. Approver = FE's `User.managerId` → site delivery lead → site PM (`claims.logic.ts`).

**Notifications:** `lib/notify.ts` (`notifyUsers`, `notifyList`) — bell rows + optional email; `dedupeKey` makes scheduled jobs idempotent. Workflow hooks in `ericsson.notify.ts`.

## 5. Commands
- Install: `pnpm install` · build types: `pnpm --filter @erp/types build` · Prisma client: `pnpm --filter @erp/api exec prisma generate`
- Typecheck: `pnpm --filter @erp/api exec tsc --noEmit` and `pnpm --filter @erp/web exec tsc --noEmit`
- Unit tests: `pnpm --filter @erp/api run test` (65 tests) · Lint: `pnpm exec eslint apps/api/src apps/web/src`
- New migration: stop the dev servers first (Windows locks the Prisma engine), then `pnpm --filter @erp/api exec prisma migrate dev --name <name>`
- Seed: `pnpm --filter @erp/api run db:seed`; sample data `SEED_DEMO=true …`; reset samples `SEED_RESET_DEMO=true SEED_DEMO=true …`
- Dev: `pnpm dev` (API :3000, web :5173 proxies /api). Needs `apps/api/.env` (see `.env.example`).
- E2E: `BASE_URL=http://localhost:3000/api pnpm test:e2e` (creates `E2E-*` sites; the sample reset removes them)
- Docker test stack: `pnpm docker:test:up` → http://localhost:8080 · `pnpm docker:test:e2e` · `pnpm docker:test:down` (wipes data). Docker Desktop must be running (it sometimes stalls on "Starting": restart it / `wsl --shutdown`).
- Git Bash on Windows rewrites `/paths` in arguments: prefix scripts with `MSYS_NO_PATHCONV=1`.

**Local test logins** (dev sign-in on login page; FE via email code — code is shown on screen when no SMTP and `DEV_LOGIN=true`):
Admin `niranjan.tamhane@integertel.com` · PM `vidhya@integertel.com` · APM `jaspreet@integertel.com` · Delivery lead `ashish@integertel.com` · Coordinator `hitesh.chaudhary@integertel.com` · Finance `siddhant@integertel.com` · Sales `chris.lembo@integertel.com` · Ops `ops.leader@example.test` · Viewer `viewer@example.test` · FEs `crew.tech1@example.test`, `crew.tech2@example.test` (manager: Ashish).

## 6. API module pattern
- One folder per module under `apps/api/src/modules/<module>/`: `<name>.route.ts`, `<name>.schema.ts` (zod), `<name>.service.ts`, plus pure logic `*.logic.ts` + `*.test.ts`. Register every route in `app.ts`.
- Validate every body/query/params with zod; errors are `throw httpError(status, message, details?)`.
- Use `defined()` when passing zod optional fields to Prisma (exactOptionalPropertyTypes). Query booleans use `queryBool`, never `z.coerce.boolean()`.
- Permissions: role sets and per-action roles in `@erp/types`, enforced on the API; the web only uses them to hide buttons.
- Any new route an FE must call → add it to `crew-access.ts` (and its test), then check ownership/site inside the route.
- Business rules go in pure functions with unit tests; add the user-visible flow to `tools/e2e/ericsson-flow.mjs`.
- Multipart uploads: send text fields **before** the file; storage only via `lib/storage.ts`.

## 7. Database rules
- Never edit a migration that has run anywhere; add a new one.
- Prisma enums are mirrored in `packages/types/src` — change both together, then rebuild types.
- Column names camelCase (Prisma default); table names snake_case via `@@map`.
- Sample data only in `seed-demo.ts`, marked with `[Sample data]` notes or `@example.test` emails. Never run `SEED_DEMO=true` against production.

## 8. Web rules (same as HRMS)
- Tailwind utilities and `src/components/ui/` primitives only. No inline `style={{…}}`, no new `.css` files (exception: a `ui/` primitive setting a runtime dimension, see `Progress`).
- Never a raw `<input>`, `<select>`, `<textarea>`, `<table>`, checkbox or status `<span>`: use `Input`, `SelectField`, `Textarea`, `Table*`, `Checkbox`, `Badge`.
- Buttons that call a mutating API use `AsyncButton`; its `onClick` returns the promise and rethrows on failure.
- A Back button that leaves the page goes in the top bar via `usePageBack()`.
- Light/dark: colours come only from tokens in `styles/tokens.css`; dark values live under `:root[data-theme="dark"]`.
  `index.html` sets `data-theme` before first paint (saved choice in localStorage `erp-theme`, else OS); the top-bar
  ThemeToggle switches it. Never hard-code colours, or they won't switch.
- Field (`/field/*`) screens are phone-first: max-w-xl column, ≥44px targets, `capture="environment"` for photos; copy files out of a file input **before** clearing it.
- `exactOptionalPropertyTypes`: optional props that receive possibly-undefined values must be typed `?: T | undefined`.
- Check `src/components/ui/` and `src/components/` before writing anything new.

## 9. How to work in this repo
- Verify with: both typechecks, unit tests, lint, the e2e script (and a browser check for UI changes). Report results honestly.
- Never commit or push unless the user explicitly asks; prefer a review branch.
- The user prefers to be told when each section of a multi-part task is done, and plain-language summaries.

## 10. Keeping this file current
When you finish a feature or decision: update **§2 Status** (built / backlog / open questions / git state),
add new files to **§3**, new rules to **§4–8**, and new test logins to **§5**. This file is the hand-off.

**Mandatory update points:**
- **After any prompt that changed code**: update this file before ending the turn. Enforced by a `Stop` hook
  (`.claude/settings.json` → `.claude/hooks/handoff-check.mjs stop`): if a changed file under `apps/`, `packages/`,
  `tools/`, `infra/` (or Docker/env/root config) is newer than CLAUDE.md, the turn is held until this file is updated.
- **When context is running low** (long session, many large files read): update this file proactively, before
  compaction. After a compaction a `SessionStart(compact)` hook reminds the agent to reconcile the summary with this file.
- Keep updates short and factual; don't paste code. Hooks can be reviewed or disabled via `/hooks`.
