# LinkedIn Profile Email Filing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Label and archive irrelevant LinkedIn People You May Know emails while leaving shutter-related, unrelated, and unreadable mail visible.

**Architecture:** Add a pure fail-closed LinkedIn profile classifier and relevance decision around the existing verified Gmail label/archive adapter. Expose it through a separate protected Next.js route and distinct ten-minute GitHub Actions workflow.

**Tech Stack:** Next.js App Router, TypeScript, Gmail API, Vitest, GitHub Actions, Vercel.

---

### Task 1: Specify strict LinkedIn profile recognition and relevance

**Files:**
- Create: `src/lib/crm/linkedin-profile-filing.test.ts`
- Create: `src/lib/crm/linkedin-profile-filing.ts`

1. Write tests for exact sender and recipient, required `email_pymk_02` and People You May Know footer markers, a LinkedIn profile URL, and non-empty decoded content.
2. Write tests retaining whole-word `shutters` in either subject or recommendation content, case-insensitively.
3. Write tests proving the standard `Owner at 805 Shutters` account footer is excluded and unreadable/unrecognized/other LinkedIn mail is untouched.
4. Run `npx vitest run src/lib/crm/linkedin-profile-filing.test.ts` and verify RED.
5. Implement the minimal pure classifier and rerun for GREEN.

### Task 2: Specify label-first filing and retries

**Files:**
- Modify: `src/lib/crm/linkedin-profile-filing.test.ts`
- Modify: `src/lib/crm/linkedin-profile-filing.ts`
- Modify: `src/lib/crm/mts-completed-report-filing.ts`

1. Add failing orchestration tests for label, verify, archive, final verify, retained relevance, fail-safe skips, and archive retry.
2. Run the focused test and verify RED.
3. Reuse the existing Gmail adapter with an injected LinkedIn inbox query; do not duplicate Gmail mutation logic.
4. Implement the orchestrator and verify GREEN.

### Task 3: Add an independent route and schedule

**Files:**
- Create: `src/app/api/cron/linkedin-profile-filing/route.test.ts`
- Create: `src/app/api/cron/linkedin-profile-filing/route.ts`
- Create: `.github/workflows/linkedin-profile-filing.yml`
- Modify: `.env.example`
- Modify: `docs/805-crm-supabase.md`

1. Write failing route/auth and workflow-contract tests.
2. Run focused tests and verify RED.
3. Add the protected route, dedicated/fallback secret contract, distinct concurrency group, ten-minute schedule, and documentation.
4. Rerun focused tests and verify GREEN.

### Task 4: Validate, publish, and production-verify

1. Run `npm run typecheck`, `npm test`, and `npm run build` with zero failures.
2. Run `git diff --check`, inspect the final diff, and confirm the 805-only boundary.
3. Commit, push `main`, and run `npm run deploy:vercel`.
4. Confirm production readiness and unauthorized route protection.
5. Dispatch the LinkedIn workflow, verify existing qualifying inbox mail is labeled and archived, and rerun to prove idempotency.
6. Read mailbox state without mutation to confirm shutter-relevant profile email remains visible and other LinkedIn mail types were not affected.
7. Send the verified MTS and LinkedIn outcomes to the coordinator.
