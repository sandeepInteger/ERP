# Integer ERP — Claude Instructions

Project tracker for Integer Telecom Services client work. Architecture, folder layout and
conventions mirror the HRMS project (`C:\IntegerTel\Projects\hrms-ClaudeCode`); when in
doubt, follow what HRMS does.

## Tech stack
- `apps/api/` — Fastify 4, Prisma 6, PostgreSQL (pnpm workspace `@erp/api`)
- `apps/web/` — React 18, Vite 6, react-router-dom v6, Tailwind v4 + shadcn-style primitives (`@erp/web`)
- `packages/types/` — enums, labels and role/permission rules shared by API and web (`@erp/types`)
- `packages/config/` — shared tsconfig
- Monorepo: pnpm workspaces + Turborepo
- Sign-in: Microsoft (Azure Entra ID, OIDC code flow). No passwords. Admins add users first; no auto-provisioning.

## Commands
- Typecheck API: `pnpm --filter @erp/api exec tsc --noEmit`
- Typecheck web: `pnpm --filter @erp/web exec tsc --noEmit`
- Test API: `pnpm --filter @erp/api run test`
- Prisma generate: `pnpm --filter @erp/api exec prisma generate`
- New migration: `pnpm --filter @erp/api exec prisma migrate dev --name <name>`
- Seed: `pnpm --filter @erp/api run db:seed` (add `SEED_DEMO=true` for demo sites)
- Dev: `pnpm dev` (API on :3000, web on :5173 with /api proxied)
- E2E against a running API: `BASE_URL=http://localhost:3000/api pnpm test:e2e`
- Docker test stack: `pnpm docker:test:up` (http://localhost:8080), `pnpm docker:test:e2e`, `pnpm docker:test:down`
- When the workflow changes, update `tools/e2e/ericsson-flow.mjs` with it.

## Client workflows are separate
- Each client (Ericsson, AT&T, …) is its own module with its own tables, routes, pages and vocabulary
  (`ericsson_*` tables, `/api/ericsson/*`, `pages/ericsson/`). Never merge them into a shared lifecycle.
- Only platform plumbing is shared: users/roles, auth, audit, RACI table, document storage, UI primitives.
- Workflow rules come from the client SOP in `docs/`. Gate logic lives in pure functions
  (`*.workflow.ts`, `*.logic.ts`) with unit tests next to them.

## API module pattern
- One folder per module under `apps/api/src/modules/<module>/`: `<name>.route.ts`, `<name>.schema.ts` (zod), `<name>.service.ts`, plus pure logic + `*.test.ts`.
- Register every route in `app.ts`.
- Validate every body/query/params with zod; errors are `throw httpError(status, message, details?)` (`lib/http.ts`).
- Use `defined()` from `lib/http.ts` when passing zod optional fields to Prisma (exactOptionalPropertyTypes).
- Query-string booleans use `queryBool`, never `z.coerce.boolean()` ("false" coerces to true).
- Permissions: role sets and per-action roles live in `@erp/types` and are enforced on the API; the web uses the same sets only to hide buttons.
- Workflow actions run in a transaction with `SELECT … FOR UPDATE` on the row, re-check gates inside it, and write an activity event.

## Database rules
- Never edit a migration that has run anywhere; add a new one.
- Prisma enums are mirrored in `packages/types/src` — change both together.
- Column names are camelCase (Prisma default); table names are snake_case via `@@map`.

## Web rules (same as HRMS)
- Tailwind utilities and the primitives in `src/components/ui/` only. No inline `style={{…}}`, no new `.css` files.
  Exception: a `ui/` primitive may set a runtime dimension via style inside itself (see `Progress`).
- Never write a raw `<input>`, `<select>`, `<textarea>`, `<table>`, checkbox or status `<span>`: use `Input`, `SelectField`, `Textarea`, `Table*`, `Checkbox`, `Badge`.
- Buttons that call a mutating API use `AsyncButton`. Its `onClick` returns the promise and must rethrow on failure.
- A Back button that leaves the page goes in the top bar via `usePageBack()`, never in the page body.
- Repeated class strings (3+ times) become a component or `cva` variant.
- Check `src/components/ui/` and `src/components/` before writing anything new.

## Commit policy
- Never commit or push unless the user explicitly asks.
