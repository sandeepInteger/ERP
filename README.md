# Integer ERP

Project tracker for Integer Telecom Services client work. First module: **Ericsson IBS**
(sites through SOP steps 1–9, change requests, documents, daily logs).

Stack: Fastify + Prisma + PostgreSQL (`apps/api`), React + Vite + Tailwind (`apps/web`),
shared types in `packages/types`. Same structure as the HRMS project.

---

## Option A — Run it in Docker (easiest, nothing else to install)

Use this to **try the app or test it**. You only need **Docker Desktop**, running.

```bash
git clone https://github.com/Integer-Telecom-Inc/Integer-ERP-System.git integer-erp
cd integer-erp
docker compose -f docker-compose.test.yml up -d --build
```

The first build takes 3–5 minutes. Then open **http://localhost:8080**.

**Sign in:** on the login page, under **Developer sign-in**, pick a person and click
**Sign in as this user**. Each person has a different role (PM, Associate PM, Delivery lead,
Coordinator, Finance, Admin), so switch users to see what each role can do.
Ten sample sites (`E-IBS-1021` to `E-IBS-1055`), one at every SOP step, are already there to play with.
Who to sign in as, what each sample site is for, and how to reset them:
[docs/local-dev-setup.md → Users and sample data](docs/local-dev-setup.md#users-and-sample-data).

| Task | Command |
|---|---|
| Run the automated end-to-end check (43 checks) | `docker compose -f docker-compose.test.yml --profile e2e run --rm e2e` |
| See API logs | `docker compose -f docker-compose.test.yml logs -f api` |
| Stop (keeps data) | `docker compose -f docker-compose.test.yml stop` |
| Start again | `docker compose -f docker-compose.test.yml up -d` |
| Wipe everything and start fresh | `docker compose -f docker-compose.test.yml down -v` then `up -d --build` |
| After pulling new code | `docker compose -f docker-compose.test.yml up -d --build` |

If you have pnpm installed, the same commands are `pnpm docker:test:up`, `pnpm docker:test:e2e`,
`pnpm docker:test:logs` and `pnpm docker:test:down`.

**Port already in use?** The stack uses 8080 (web) and 5433 (database). Stop whatever is using them,
or change the left-hand port numbers in `docker-compose.test.yml`.

---

## Option B — Run it locally (for writing code)

Use this when you will **change the code**: it reloads instantly on save.

**You need:** Node.js 20 or newer, pnpm 9 (`corepack enable` or `npm i -g pnpm@9`),
and PostgreSQL 15+ (or just the database from Option A — see the tip below).

```bash
git clone https://github.com/Integer-Telecom-Inc/Integer-ERP-System.git integer-erp
cd integer-erp
pnpm install
pnpm --filter @erp/types build
pnpm --filter @erp/api exec prisma generate
```

**1. Create the environment file.** Copy `.env.example` to `apps/api/.env` and set at least:

```ini
DATABASE_URL=postgresql://postgres:<your-password>@localhost:5432/integer_erp
JWT_SECRET=<any long random text>
JWT_REFRESH_SECRET=<another long random text>
DEV_LOGIN=true
```

> **Tip — no local Postgres?** Start only the Docker database:
> `docker compose -f docker-compose.test.yml up -d db` and use
> `DATABASE_URL=postgresql://erp:erp_test@localhost:5433/integer_erp`.

**2. Create the database** (skip if you use the Docker database): in psql or pgAdmin,
`CREATE DATABASE integer_erp;`

**3. Create the tables and the starting data:**

```bash
pnpm --filter @erp/api run db:migrate
SEED_DEMO=true pnpm --filter @erp/api run db:seed
```

(On Windows PowerShell use `$env:SEED_DEMO="true"; pnpm --filter @erp/api run db:seed`.)

**4. Run:**

```bash
pnpm dev
```

Open **http://localhost:5173** and use **Developer sign-in** as in Option A.

**Before you push**, run:

```bash
pnpm --filter @erp/api exec tsc --noEmit
pnpm --filter @erp/web exec tsc --noEmit
pnpm --filter @erp/api run test
```

---

## Common problems

| Problem | Fix |
|---|---|
| Login page says "The server is not reachable" | The API isn't running. Docker: check `logs -f api`. Local: check the `pnpm dev` terminal. |
| No "Developer sign-in" section | `DEV_LOGIN=true` is missing from `apps/api/.env` (local), or the API wasn't restarted. |
| `Can't reach database server` | Postgres isn't running, or `DATABASE_URL` has the wrong password / port. |
| `Cannot find module '@erp/types'` | Run `pnpm --filter @erp/types build`. |
| Prisma errors after pulling new code | Run `pnpm --filter @erp/api exec prisma generate` and `pnpm --filter @erp/api run db:migrate`. |
| Docker Desktop stuck on "Starting" | Docker Desktop → bug icon → Restart. If still stuck: `wsl --shutdown` in PowerShell, then reopen Docker Desktop. |

**"Sign in with Microsoft" is greyed out** — expected. It needs an Azure app registration;
developer sign-in is all you need for testing. Setup steps are in
[docs/local-dev-setup.md](docs/local-dev-setup.md).

---

## More

- [docs/local-dev-setup.md](docs/local-dev-setup.md) — full setup, Microsoft sign-in, what is built so far
- [CLAUDE.md](CLAUDE.md) — code conventions (module pattern, UI rules)
- `docs/*.pdf` — the client SOPs the workflows are built from
