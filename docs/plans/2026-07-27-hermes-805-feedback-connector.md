# Hermes 805 CRM Feedback Connector Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Run a supervised local Hermes worker for Jessica's revision-scoped 805 CRM feedback workflow.

**Architecture:** A dependency-injected Node worker owns queue polling and topic transitions. The local `shutters805` Hermes CLI produces strictly validated JSON; Codex and release commands are gated by exact API states and local configuration.

**Tech Stack:** Node.js 20, native `fetch`, Hermes CLI, Vitest, macOS launchd, Next.js integration API.

---

### Task 1: Worker contract and safeguards

**Files:**
- Create: `scripts/hermes-805-crm-feedback-worker.mjs`
- Test: `scripts/hermes-805-crm-feedback-worker.test.mjs`

1. Write failing tests for authenticated polling, exact claims, stable event IDs, clarification limits, structured output, stale claims, secret redaction, and release gating.
2. Run `npx vitest run scripts/hermes-805-crm-feedback-worker.test.mjs` and confirm the missing module fails.
3. Implement the smallest dependency-injected client and workflow state machine.
4. Re-run the focused tests and keep them green.

### Task 2: Local Hermes and Codex execution

**Files:**
- Modify: `scripts/hermes-805-crm-feedback-worker.mjs`
- Test: `scripts/hermes-805-crm-feedback-worker.test.mjs`

1. Add failing tests for strict Hermes JSON parsing and authorized workspace validation.
2. Invoke the `shutters805` profile in one-shot mode for clarification/assessment only.
3. Dispatch approved implementation through Codex only inside the configured 805 workspace.
4. Require explicit release enablement for approved deployments.

### Task 3: LaunchAgent configuration

**Files:**
- Create: `scripts/install-hermes-805-crm-feedback-launchagent.sh`
- Modify: `package.json`
- Test: `src/lib/crm/hermes-feedback-worker-config.test.ts`

1. Write a failing source-contract test for the worker scripts and safe defaults.
2. Add package commands and an installer that writes no secrets into the plist.
3. Load secrets at runtime from the `shutters805` profile environment or Keychain.
4. Install and start the LaunchAgent.

### Task 4: Full verification and handoff

1. Run focused tests.
2. Run `npm run typecheck`.
3. Run `npm test`.
4. Run `npm run build`.
5. Probe the live queue without printing credentials or topic content.
6. Report polling and CRM reply verification separately; do not claim live success when configuration is absent.
