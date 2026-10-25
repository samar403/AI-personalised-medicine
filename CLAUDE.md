@AGENTS.md

## Project notes

- Next.js 16 App Router with Cache Components on. Authenticated API routes go through `withAuth` in `src/lib/api.ts`, which calls `connection()` so they always run at request time.
- App pages under `src/app/app` are client components that fetch from `/api/*` with `useApi`.
- Database: Drizzle + libSQL. After changing `src/lib/db/schema.ts`, run `npm run db:generate` and commit the new file in `drizzle/`.
- Every AI call goes through `src/lib/ai/client.ts`. With no `ANTHROPIC_API_KEY`, each feature falls back to the offline engine in `src/lib/ai/heuristics.ts`; keep both paths working.
- Before pushing: `npm run lint && npm run typecheck && npm test && npm run build`.
- Clinical logic lives in `src/lib/clinical` and is deterministic on purpose: medication-safety flags come from the rules there (CPIC gene-drug rules, interactions, lab ranges), never from the model. AI explains findings; it does not create or override them.
- Health data rules: every ingest goes through `requireConsent`, genotype calls are stored encrypted (`src/lib/crypto.ts`), and anything sent to Claude is built by `describeSnapshot` in `src/lib/ai/context.ts`, which must stay de-identified (no names, emails or exact birth dates).
- Keep the red-flag precheck in `src/lib/safety.ts` ahead of any model call, and keep the "not medical advice" wording visible on pages that show recommendations.
