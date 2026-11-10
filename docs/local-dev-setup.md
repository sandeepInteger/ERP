# Local development setup

## Prerequisites
- Node.js 20+ and pnpm 9 (`npm i -g pnpm@9`)
- PostgreSQL 15+ running locally

## 1. Install
```bash
pnpm install
pnpm --filter @erp/types build
pnpm --filter @erp/api exec prisma generate
```

## 2. Database
Create an empty database, for example with psql:
```sql
CREATE DATABASE integer_erp;
```

## 3. Environment
Copy `.env.example` to `apps/api/.env` and fill in:
- `DATABASE_URL` — your local Postgres user, password and the `integer_erp` database
- `JWT_SECRET`, `JWT_REFRESH_SECRET` — any two long random strings
- `DEV_LOGIN=true` — lets you sign in locally as any seeded user without Microsoft

Then create the tables and seed the Ericsson team and RACI matrix:
```bash
pnpm --filter @erp/api run db:migrate
pnpm --filter @erp/api run db:seed            # users + RACI
SEED_DEMO=true pnpm --filter @erp/api run db:seed   # optional: 10 sample sites + 2 test users
```
See [Users and sample data](#users-and-sample-data) below for what this creates.

## 4. Run
```bash
pnpm dev
```
- Web: http://localhost:5173 (proxies `/api` to the API)
- API: http://localhost:3000 (`/health` checks the database)

On the login page, use **Developer sign-in** to pick a seeded user (PM, APM, Delivery lead, …)
and see the app with that role's permissions.

## Users and sample data

### Who to sign in as
The seed creates the Ericsson team from the SOP (Appendix A). With `SEED_DEMO=true` it also adds two
test accounts so every role can be tried. In local development and the Docker test stack, pick any of
them under **Developer sign-in**.

| Person | Role | Use them to test |
|---|---|---|
| Niranjan Tamhane, Amar Uppalapati | Admin | Users & roles, every workflow action |
| Chris Lembo | Sales leader | Read-only view of all sites (escalation level) |
| Test Ops Leader *(test account)* | Operations leader | Can perform every workflow action |
| Vidhyanidhi Danda | Project manager | Send CRs to Ericsson, record decisions, close sites |
| Jaspreet Singh | Associate PM | Accept SOV, RFX, materials, invoicing |
| Ashish Vashisht | Delivery lead | Daily logs, SOW complete, VSS & AE202, raise CRs |
| Hitesh Chaudhary | Coordinator | New sites, documents, discrepancies |
| Sidhant Sachan | Finance | Read-only; cannot change sites |
| Test Viewer *(test account)* | Viewer | Read-only |

Who may do what is defined in `packages/types/src/ericsson.ts` (`ERICSSON_ACTIONS`, from the SOP RACI)
and enforced by the API. A button you can't use shows "Not your role".

### Adding or changing users
- **In the app:** sign in as an Admin → **Admin → Users & roles** → add the person's Microsoft work email,
  name and role. Change roles or deactivate people from the same table; a change signs them out at once.
- **Permanently for everyone's setup:** add them to `USERS` in `apps/api/src/seed.ts` and re-run the seed.
- Real Microsoft sign-in only lets in people who exist here; their Microsoft email must match.

### Sample sites
`SEED_DEMO=true` adds 10 sample Ericsson sites (`apps/api/src/seed-demo.ts`), one at every SOP step,
so each screen has something to show. Venues and amounts are invented.

| Site | Step | What to try |
|---|---|---|
| E-IBS-1055 Retail Mall North | 1 · Docs received | Upload the missing RFDS, then send to verification |
| E-IBS-1042 Regional Hospital · Tower B | 2 · Verify | Resolve the open discrepancy, then accept the SOV |
| E-IBS-1051 University Library | 3 · SOV / RFX | Record the RFX number |
| E-IBS-1047 Downtown Office Plaza | 4 · Materials | BBU back-ordered: mark lines received to unblock execution |
| E-IBS-1049 Stadium Concourse | 5 · Execution | Daily logs, CR awaiting Ericsson, mark SOW complete |
| E-IBS-1044 Hotel & Conference Center | 5 · Execution | Sub-vendor CR in PM review (3% pass-through) |
| E-IBS-1038 Airport Terminal C | 7 · VSS & AE202 | Record the client stamp |
| E-IBS-1033 Convention Center Hall A | 9 · Invoicing | Record the SRM upload, approval, close |
| E-IBS-1029 County Courthouse | 9 · Invoicing | Invoice uploaded; record Ericsson's approval |
| E-IBS-1021 Medical Office Park | Closed | A finished site (tick "Include closed") |

Each sample site's notes start with `[Sample data]`. Re-running the seed never duplicates them and
never touches real sites. To put them back the way they started (after you've clicked through them):

```bash
SEED_RESET_DEMO=true SEED_DEMO=true pnpm --filter @erp/api run db:seed
```

In the Docker test stack the seed runs on every `up`; to reset there:
`SEED_RESET_DEMO=true docker compose -f docker-compose.test.yml up -d` (or `pnpm docker:test:down` to wipe everything).

Never run the seed with `SEED_DEMO=true` against a production database.

## Docker test environment
A full stack (Postgres 16 + API + web behind nginx) built from this repo. Needs Docker Desktop running.

```bash
pnpm docker:test:up      # build + start → http://localhost:8080
pnpm docker:test:e2e     # walk one site through SOP steps 1–9 (43 checks)
pnpm docker:test:logs    # follow API logs
pnpm docker:test:down    # stop and wipe the database and uploads
```

| Service | What it does | Host port |
|---|---|---|
| `db` | Postgres 16 (`erp` / `erp_test`, database `integer_erp`) | 5433 |
| `migrate` | One-shot: `prisma migrate deploy` + seed (users, RACI, demo sites) | — |
| `api` | Fastify API, `NODE_ENV=test`, developer sign-in on | — (via web) |
| `web` | nginx serving the SPA and proxying `/api` to `api` | 8080 |
| `e2e` | Profile `e2e`: runs `tools/e2e/ericsson-flow.mjs` against the stack | — |

- Sign in with **Developer sign-in** as any seeded user. Set `SEED_DEMO=false` to start without demo sites.
- Real Microsoft sign-in: copy `.env.docker.example` to `.env.docker`, fill `AZURE_*`, and add
  `http://localhost:8080/api/auth/sso/azure/callback` as a redirect URI on the app registration.
- Inspect the database from the host: `postgresql://erp:erp_test@localhost:5433/integer_erp`.
- The images use the same Dockerfiles as a real deployment (`apps/api/Dockerfile`, `apps/web/Dockerfile`);
  only `infra/docker/nginx.test.conf` and the test env vars are test-specific.
- Never expose this stack publicly: developer sign-in lets anyone act as any user.

## Microsoft sign-in
1. In Azure Portal → Entra ID → App registrations → New registration (single tenant).
2. Authentication → add a **Web** redirect URI: `http://localhost:5173/api/auth/sso/azure/callback`
   (production: `https://<your-domain>/api/auth/sso/azure/callback`).
3. Certificates & secrets → new client secret.
4. Set in `apps/api/.env`: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_REDIRECT_URI`.
5. Restart the API. "Sign in with Microsoft" becomes active.

Only people added under **Admin → Users & roles** (or by the seed) can sign in; their Microsoft
email must match. Turn `DEV_LOGIN` off anywhere other than your own machine.

## What is built so far (Ericsson IBS)
| Area | Screen | API |
|---|---|---|
| Dashboard | KPIs, sites by step, needs-attention list | `GET /api/ericsson/summary` |
| Site tracker | Filter by step / scope / mine, search | `GET /api/ericsson/sites` |
| New site | Step 1 intake + team | `POST /api/ericsson/sites` |
| Site detail | Step tracker, action panel with SOP gates, tabs | `GET /api/ericsson/sites/:id`, `POST …/actions` |
| Documents | SOV / BOM / RFDS / AE202 upload + download | `POST …/documents`, `GET /api/ericsson/documents/:id/download` |
| Verification | Discrepancies + Ericsson PM thread | `POST …/discrepancies`, `…/client-queries` |
| Materials | BOM lines, orders, status | `POST …/materials`, `PATCH /api/ericsson/materials/:id` |
| Change requests | Raise, PM review, Ericsson decision, 3% pass-through | `POST …/change-requests`, `POST …/transition` |
| Daily log | Crew, hours, blockers | `POST …/daily-logs` |
| Admin | Users & roles, RACI matrix | `/api/users`, `/api/raci` |

Not built yet: expenses/daily-tracker costs, revenue & cost reports, the phone-first field views,
notifications/escalation emails, and the AT&T module.
