# Live CRM Activity Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expand the live CRM payment ledger into a unified newest-first activity feed with filters, customer timelines, and scroll-safe background updates.

**Architecture:** Read canonical payment rows and the existing CRM audit log through an authenticated no-store route. Normalize both sources in a pure shared module, then render a polling client component that buffers new events while the viewer is scrolled away from the top.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase JS, Vitest, Vercel

---

### Task 1: Define the unified activity model and normalization

**Files:**
- Create: `src/lib/crm/unified-activity.ts`
- Create: `src/lib/crm/unified-activity.test.ts`
- Modify: `src/lib/crm/types.ts`

**Step 1: Write failing tests**

Cover newest-first sorting; Square/Venmo/Zelle source labels; note, status, update, and follow-up classification; customer resolution across job, quote, bookkeeping entry, and metadata; concise descriptions; and duplicate payment-audit suppression.

**Step 2: Run the focused test and verify RED**

Run: `npm test -- src/lib/crm/unified-activity.test.ts`

Expected: FAIL because the module and exported functions do not exist.

**Step 3: Add the minimal types and pure normalization implementation**

Define `CrmActivityEvent`, `CrmActivitySnapshot`, `UnifiedActivityEvent`, and filter categories. Build stable IDs, resolve customer identity from loaded CRM maps, normalize descriptions, and sort with timestamp plus stable ID tie-breaking.

**Step 4: Run the focused test and verify GREEN**

Run: `npm test -- src/lib/crm/unified-activity.test.ts`

Expected: PASS.

### Task 2: Add the authenticated activity snapshot endpoint

**Files:**
- Create: `src/app/api/crm/activity/route.ts`
- Create: `src/app/api/crm/activity/route.test.ts`
- Modify: `src/lib/crm/backend.ts`

**Step 1: Write failing route and backend tests**

Verify approved-user auth is required, audit events and payments load in parallel with descending order and fixed limits, partial source failures return the surviving source, and the response is private/no-store.

**Step 2: Run the focused tests and verify RED**

Run: `npm test -- src/app/api/crm/activity/route.test.ts src/lib/crm/backend.test.ts`

Expected: FAIL because the activity loader and route do not exist.

**Step 3: Implement the bounded loader and route**

Add `loadCrmActivitySnapshot` to query only `crm_activity_events` and `crm_quote_bookkeeping_payments`. Add a Node.js, force-dynamic route using `requireCrmUser` and existing error handling.

**Step 4: Run the focused tests and verify GREEN**

Run: `npm test -- src/app/api/crm/activity/route.test.ts src/lib/crm/backend.test.ts`

Expected: PASS.

### Task 3: Build the unified feed UI

**Files:**
- Create: `src/components/crm/UnifiedActivityFeed.tsx`
- Create: `src/components/crm/UnifiedActivityFeed.test.tsx`
- Modify: `src/app/globals.css`

**Step 1: Write failing component/source tests**

Verify all five filter tabs, newest-first event rows, source/customer/type/amount/timestamp/description fields, empty and stale states, customer selection, payment history, notes, status, follow-up state, and the new-activity jump control.

**Step 2: Run the focused test and verify RED**

Run: `npm test -- src/components/crm/UnifiedActivityFeed.test.tsx`

Expected: FAIL because the component does not exist.

**Step 3: Implement the component and responsive styles**

Use a bounded scroll region, accessible tab buttons, stable list keys, a selected-customer detail panel, and scroll-position-aware buffering. Avoid introducing a UI dependency.

**Step 4: Run the focused test and verify GREEN**

Run: `npm test -- src/components/crm/UnifiedActivityFeed.test.tsx`

Expected: PASS.

### Task 4: Integrate polling and replace the payment-only card

**Files:**
- Modify: `src/components/crm/CrmApp.tsx`
- Modify: `src/components/crm/CrmApp.recent-financial-activity.source.test.ts`

**Step 1: Update the source contract test to require the unified dashboard**

Assert that the payment-only builder/card is removed, `UnifiedActivityFeed` receives CRM records and live snapshot data, the activity endpoint is polled only for authenticated full-CRM sessions, and failures preserve the last snapshot.

**Step 2: Run the source test and verify RED**

Run: `npm test -- src/components/crm/CrmApp.recent-financial-activity.source.test.ts`

Expected: FAIL against the payment-only card.

**Step 3: Implement visibility-aware polling and component wiring**

Load immediately after authentication, refresh on a bounded interval while visible, abort on cleanup, and preserve the last successful snapshot on errors. Replace only the Recent Financial Activity section.

**Step 4: Run focused tests and verify GREEN**

Run: `npm test -- src/components/crm/CrmApp.recent-financial-activity.source.test.ts src/components/crm/UnifiedActivityFeed.test.tsx src/lib/crm/unified-activity.test.ts src/app/api/crm/activity/route.test.ts`

Expected: PASS.

### Task 5: Full validation and production release

**Files:**
- Review all modified files and generated build output; stage only intentional source and documentation changes.

**Step 1: Run repository validation**

Run: `npm run typecheck`

Run: `npm test`

Run: `npm run build`

Expected: all commands exit 0 with no test failures.

**Step 2: Review security and final diff**

Confirm the route requires CRM auth, no service key or credential is serialized, limits are bounded, cache headers are private/no-store, and no unrelated user changes are included.

**Step 3: Commit and push**

Run: `git add <intentional files>`

Run: `git commit -m "feat: add live CRM activity dashboard"`

Run: `git push origin main`

Expected: `origin/main` contains the validated commit.

**Step 4: Deploy and verify production**

Run: `npm run deploy:vercel`

Verify: `https://www.805shutters.com` and the authenticated `/crm/` dashboard load from the new production deployment, the activity endpoint is authorized, and no new production errors appear.

