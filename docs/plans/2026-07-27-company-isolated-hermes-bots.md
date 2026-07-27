# Company-Isolated Hermes Bots Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the mixed Hermes connector with independently authenticated MTS and 805 bot systems.

**Architecture:** The 805 repository owns an 805-only feedback API, Telegram webhook, worker, credentials, and workspace guard. The MTS repository owns its mirrored MTS-only infrastructure. No runtime router or fallback connects them.

**Tech Stack:** Next.js 16, Supabase/Postgres, Node.js workers, Hermes CLI profiles, Telegram Bot API, Vitest, macOS launchd.

---

### Task 1: Lock the 805 company contract

**Files:**
- Modify: `src/lib/crm/feedback-types.ts`
- Modify: `supabase/migrations/20260726120000_create_crm_feedback_requests.sql`
- Create: `supabase/migrations/*_scope_crm_feedback_to_805.sql`
- Test: `src/lib/crm/feedback-integration-contract.test.ts`

Write failing tests requiring `company_scope = '805'` across topics, approvals, claims, event IDs, and queue filters. Add the migration and route guards.

### Task 2: Isolate the 805 API and Telegram bot

**Files:**
- Move: `src/app/api/integrations/hermes/crm-feedback/**` to `src/app/api/integrations/hermes/805/crm-feedback/**`
- Move: `src/app/api/integrations/willie/telegram/route.ts` to `src/app/api/integrations/805/telegram/route.ts`
- Rename: `src/lib/notify/willie-telegram.ts` to `src/lib/notify/eight-oh-five-telegram.ts`
- Modify: `.env.example`

Write failing tests for 805-only route namespaces, `SHUTTERS_805_TELEGRAM_*`, scoped callback data, and rejection of MTS configuration. Implement the minimal isolated routes.

### Task 3: Isolate the local 805 worker

**Files:**
- Modify: `scripts/hermes-805-crm-feedback-worker.mjs`
- Modify: `scripts/install-hermes-805-crm-feedback-launchagent.sh`
- Modify: `src/lib/crm/hermes-805-crm-feedback-worker.test.ts`
- Modify: `src/lib/crm/hermes-feedback-worker-config.test.ts`

Require worker ID `home-mac-hermes-805`, the `shutters805` profile, 805 logs, 805 API namespace, and a hard refusal of MTS environment variables or workspaces.

### Task 4: Build the independent MTS mirror

In the canonical MTS repository, add the mirrored MTS worker and tests using only:

- default Hermes profile
- `home-mac-hermes-mts`
- `HERMES_MTS_*`
- `MTS_TELEGRAM_*`
- MTS API/webhook namespaces
- MTS workspace and logs

Do not import or reference 805 configuration.

### Task 5: Verify separation

Run each repository's focused tests, full tests, typecheck, and production build. Add negative tests proving each bot rejects the other company's secret, callback, topic, and workspace. Install workers with both release switches disabled. Do not push, migrate, or deploy without that company's exact approval.
