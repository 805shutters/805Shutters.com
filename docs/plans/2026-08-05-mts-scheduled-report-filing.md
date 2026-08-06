# MTS Report Filing Extension Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend the deployed 805 Gmail filing job to label and archive strictly verified MTS scheduled and incomplete notices alongside completed reports.

**Architecture:** Add scheduled and incomplete classification branches to the existing pure matcher and return the correct per-kind label to the unchanged label-first Gmail orchestrator. Expand the existing inbox query and production summary without creating competing jobs or weakening any type-specific requirements.

**Tech Stack:** Next.js App Router, TypeScript, Gmail API, Vitest, GitHub Actions, Vercel.

---

### Task 1: Specify scheduled and incomplete classification

**Files:**
- Modify: `src/lib/crm/mts-completed-report-filing.test.ts`
- Modify: `src/lib/crm/mts-completed-report-filing.ts`

1. Add tests accepting the observed `Customer - Scheduled` message with the required structured body fields and no attachment.
2. Add tests accepting the observed `Customer - Incomplete Report` message with standalone incomplete status, structured body fields, and its incomplete-service-report PDF.
3. Add rejection tests for missing fields, prose-only status words, conflicting type signals, wrong sender, wrong recipient, and incorrect attachments.
4. Run `npx vitest run src/lib/crm/mts-completed-report-filing.test.ts` and verify RED.
5. Add the minimal classifier returning `completed`, `scheduled`, `incomplete`, or `null`; preserve the existing completed predicate as a compatibility wrapper.
6. Rerun the focused test and verify GREEN.

### Task 2: Select and verify the label by report kind

**Files:**
- Modify: `src/lib/crm/mts-completed-report-filing.test.ts`
- Modify: `src/lib/crm/mts-completed-report-filing.ts`

1. Add failing orchestration tests proving scheduled notices use `805/MTS Scheduled Reports`, incomplete reports use `805/MTS Incomplete Reports`, completed reports keep their existing label, and ambiguous notices receive no mutation.
2. Run the focused test and verify RED.
3. Change the orchestrator to cache label IDs per kind and retain the existing label-before-archive and post-operation verification sequence.
4. Expand the Gmail query to shortlist exact `Scheduled` and `Incomplete Report` subjects without weakening completed/incomplete attachment validation.
5. Rerun the focused test and verify GREEN.

### Task 3: Update production contract and documentation

**Files:**
- Modify: `src/app/api/cron/mts-completed-reports/route.test.ts`
- Modify: `src/app/api/cron/mts-completed-reports/route.ts`
- Modify: `.github/workflows/mts-completed-report-filing.yml`
- Modify: `docs/805-crm-supabase.md`

1. Add a failing route test for all three filing labels in the response.
2. Run route tests and verify RED.
3. Return all three labels, update neutral workflow wording, and document every type-specific criterion.
4. Run route and library tests and verify GREEN.

### Task 4: Validate, publish, and production-verify

**Files:** Review all changed files.

1. Run `npm run typecheck`, `npm test`, and `npm run build`; require zero failures.
2. Run `git diff --check`, inspect the full diff, and confirm the 805-only boundary.
3. Commit intentionally, push `main`, and run `npm run deploy:vercel`.
4. Confirm the production deployment is Ready and the protected route rejects unauthorized requests.
5. Dispatch the existing workflow, verify existing qualifying completed, scheduled, and incomplete notices are labeled and archived, and rerun to verify zero-work idempotency.
6. Read the mailbox state without mutation to confirm every qualifying type left `INBOX` with its audit label.
7. Send the verified result, commit, deployment, and filing counts to the coordinator.
