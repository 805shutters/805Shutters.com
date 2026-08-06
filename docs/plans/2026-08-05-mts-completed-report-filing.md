# MTS Completed Report Filing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** File verified completed MTS service reports from the 805 Gmail inbox under a dedicated label within ten minutes, including the existing inbox backlog.

**Architecture:** Add a small Gmail filing service behind a protected Next.js cron route. The service separates pure fail-closed classification from Gmail API operations, adds and verifies the filing label before removing and verifying `INBOX`, and relies on Gmail label state for retry-safe idempotency. A dedicated GitHub Actions schedule invokes the production route every ten minutes without coupling filing to the existing CRM processor.

**Tech Stack:** Next.js App Router, TypeScript, Gmail API, Vitest, GitHub Actions, Vercel.

---

### Task 1: Specify strict completed-report matching

**Files:**
- Create: `src/lib/crm/mts-completed-report-filing.test.ts`
- Create: `src/lib/crm/mts-completed-report-filing.ts`

**Step 1: Write the failing matcher tests**

Cover the current `Customer - Complete Report` format and the known legacy completed-service-report subject. Require exact normalized sender and recipient, a positive completion body signal, and a completed-service-report PDF. Add separate negative cases for scheduled reports, incomplete reports, wrong sender, wrong recipient, missing completion content, and missing PDF.

**Step 2: Run the matcher tests and verify RED**

Run: `npx vitest run src/lib/crm/mts-completed-report-filing.test.ts`

Expected: FAIL because the new module and matcher do not exist.

**Step 3: Implement the minimum pure matcher**

Add constants for `805shutters@gmail.com`, `noreply@mtsinstallationsandrepairs.com`, and `805/MTS Completed Reports`. Parse header addresses conservatively, recognize only approved current/legacy subjects, reject scheduled/incomplete status signals, and require both completion content and the completed-report PDF filename.

**Step 4: Run the matcher tests and verify GREEN**

Run: `npx vitest run src/lib/crm/mts-completed-report-filing.test.ts`

Expected: PASS.

### Task 2: Specify label-first filing, verification, and retries

**Files:**
- Modify: `src/lib/crm/mts-completed-report-filing.test.ts`
- Modify: `src/lib/crm/mts-completed-report-filing.ts`

**Step 1: Write failing orchestration tests**

Use an injected Gmail adapter to assert this exact order for each qualifying message: apply dedicated label, read/verify label, remove `INBOX`, read/verify final state. Verify non-qualifying messages receive no mutations. Verify label failure prevents archive, archive failure leaves a retryable labeled inbox message, and a later run safely completes it.

**Step 2: Run the focused tests and verify RED**

Run: `npx vitest run src/lib/crm/mts-completed-report-filing.test.ts`

Expected: FAIL because filing orchestration is missing.

**Step 3: Implement the filing orchestrator and Gmail adapter**

List only inbox candidates using a narrow Gmail query, fetch full message metadata/body/attachment names, create or reuse the label, and perform the verified two-phase label/archive operations. Stop and surface an operational error on failed mutation or verification. Search only `in:inbox`, so already archived messages are naturally idempotent while labeled inbox messages remain eligible for retry.

**Step 4: Run focused tests and verify GREEN**

Run: `npx vitest run src/lib/crm/mts-completed-report-filing.test.ts`

Expected: PASS.

### Task 3: Add the protected production cron endpoint

**Files:**
- Create: `src/app/api/cron/mts-completed-reports/route.ts`
- Create: `src/app/api/cron/mts-completed-reports/route.test.ts`
- Modify: `src/lib/crm/installation-invoices.ts`

**Step 1: Write failing route/auth tests**

Verify requests are rejected when the configured secret does not match and that authorized runs return the filing summary. Keep the route independent from Supabase because Gmail label state is the durable record.

**Step 2: Run the route tests and verify RED**

Run: `npx vitest run src/app/api/cron/mts-completed-reports/route.test.ts`

Expected: FAIL because the route does not exist.

**Step 3: Implement the route and shared Gmail authentication export**

Expose the existing 805 Gmail access-token resolver for reuse, protect the route with `MTS_COMPLETED_REPORT_CRON_SECRET` falling back to `INSTALLATION_INVOICE_CRON_SECRET` and then `CRON_SECRET`, and return non-success status for any filing or verification error.

**Step 4: Run route and library tests and verify GREEN**

Run: `npx vitest run src/app/api/cron/mts-completed-reports/route.test.ts src/lib/crm/mts-completed-report-filing.test.ts`

Expected: PASS.

### Task 4: Schedule the independent ten-minute production job

**Files:**
- Create: `.github/workflows/mts-completed-report-filing.yml`
- Modify: `.env.example`
- Modify: `docs/805-crm-supabase.md`

**Step 1: Add a failing source guard**

Extend the filing test to read the workflow and assert a `*/10 * * * *` schedule, distinct concurrency group, protected production URL, and dedicated/fallback secret contract.

**Step 2: Run the guard and verify RED**

Run: `npx vitest run src/lib/crm/mts-completed-report-filing.test.ts`

Expected: FAIL because the workflow is missing.

**Step 3: Add workflow and configuration documentation**

Add a dedicated GitHub Actions workflow with `cancel-in-progress: false`, a ten-minute cron, manual dispatch, secret presence check, retrying `curl`, and the canonical `https://www.805shutters.com/api/cron/mts-completed-reports` endpoint. Document the label, strict matching, modify-scope requirement, and backfill/retry behavior.

**Step 4: Run the guard and verify GREEN**

Run: `npx vitest run src/lib/crm/mts-completed-report-filing.test.ts`

Expected: PASS.

### Task 5: Validate and publish

**Files:**
- Review all files above.

**Step 1: Run required repository validation**

Run:

```bash
npm run typecheck
npm test
npm run build
```

Expected: all commands exit 0 with no test failures or TypeScript/build errors.

**Step 2: Review the final diff and repository boundary**

Run: `git status --short && git diff --check && git diff HEAD`

Expected: only intentional 805 repository files are changed; no secrets, MTS repository paths, or unrelated edits are present.

**Step 3: Commit and push main**

Run:

```bash
git add <intentional-files>
git commit -m "feat(crm): file completed MTS reports"
git push origin main
```

Expected: `origin/main` advances to the new commit.

**Step 4: Deploy the 805 Vercel project**

Run: `npm run deploy:vercel`

Expected: production deployment reaches Ready for project `805`.

### Task 6: Verify production and initial backfill

**Files:**
- No source changes expected.

**Step 1: Verify the production site and protected route**

Check `https://www.805shutters.com` and confirm an unauthorized request to the filing route is rejected when a secret is configured.

**Step 2: Trigger the workflow manually**

Run: `gh workflow run mts-completed-report-filing.yml --ref main`, then watch the dispatched run to completion.

Expected: the workflow succeeds against the production endpoint, performing the approved existing-inbox backfill.

**Step 3: Verify Gmail outcomes read-only**

Confirm every message labeled `805/MTS Completed Reports` is absent from `INBOX`, current matching completed reports were filed, and representative `Scheduled` and `Incomplete Report` messages remain untouched. Do not modify mail during verification.

**Step 4: Verify the live recurring schedule**

Confirm GitHub recognizes the workflow on `main`, its schedule is every ten minutes, and a scheduled run succeeds. If GitHub has not emitted a scheduled run within a reasonable verification window, report that exact external timing blocker instead of claiming schedule execution.

**Step 5: Report completion**

Send the coordinator the commit, deployment result, workflow run evidence, backfill counts, and read-only Gmail verification. Report any external blocker precisely.
