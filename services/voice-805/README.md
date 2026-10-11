# 805 Shutters phone service

Production target: the existing dedicated 805 Supabase project, Twilio, and an xAI hosted voice agent. No Render deployment or always-running audio bridge is required by this design. **Activation is disabled until provider bindings and a temporary-number pilot are verified.**

## Runtime

`supabase/functions/voice-805/index.ts` serves short signed webhooks. Twilio sends audio directly to xAI over SIP. PostgreSQL stores call state, messages, shared follow-up status, caller links and the provider outbox. The CRM's Call Center proxies authenticated staff actions using an explicit Mike/Jessica role mapping and a signed, replay-protected request.

`supabase-store.mjs` uses optimistic compare-and-swap transactions. No carrier request occurs inside a retried database transaction. Outbox claims commit before network submission. Unknown carrier outcomes stay uncertain for reconciliation; they are never blindly redialed or resent. Both initial staff dial requests start in the same parallel batch. Press 1 acceptance chooses one owner atomically; answered status requires a signed caller conference join after staff connection and AI removal.

The pilot stores each dataset in a single JSON document with a 16 MiB ceiling. This is a bounded pilot implementation, not an unlimited archive. Inspect database size before and during the pilot; normalize/archive records with a reviewed retention policy before general production cutover. No automatic data deletion is enabled. PostgreSQL backups apply; the old SQLite backup tool does not back up Supabase.

## Call behavior

Every caller hears exactly **Hi, thank you for calling 805 Shutters.** Incoming CRM lookup starts before returning the SIP response but does not delay that response. A unique customer gets a first-name greeting and a status-specific conversational hint. Shared numbers require clarification. Unknown callers hear the hold/connection line and go straight to simultaneous Mike/Jessica ringing during configured hours. No scheduling or lead questionnaire precedes their transfer.

Caller ID is not identity verification. The agent receives no balances, addresses, appointments or private notes. It routes sensitive requests to staff. A failed lookup also routes to staff instead of inventing customer context. Outside configured hours, or on no-answer/provider failure, Twilio collects a callback message. Partial messages survive hangup and remain explicitly unconfirmed.

The red Call Center badge counts unresolved saved voice messages, including partial messages; missed calls without messages and text messages are separate. Reading does not resolve a message. Resolve/reopen updates both the Call Center and linked customer file.

## Deployment and provider contract

Follow [the Supabase deployment runbook](../../docs/phone-system/supabase-deployment.md). The HTTP tool adapter exists, but the hosted xAI agent's per-call SIP-header binding and audible greeting completion have **not** been verified. Keep `VOICE_805_AGENT_CONTRACT_VERIFIED=false` until actual provider evidence proves both. If the hosted builder cannot supply that contract, adapt to a supported provider interface before activation; do not pretend that simulated tools prove it.

All provider work remains guarded by `supabaseReadiness`, including work triggered by CRM reads. `/worker` supports an authenticated standby heartbeat without dialing. Configure the durable watchdog before enabling calls. SMS has an additional independent approval gate.

## Local checks

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npm run build
node --test services/voice-805/test/*.test.mjs
npx deno check --no-config supabase/functions/voice-805/index.ts
```

Browser fixtures use a local Next server with `NEXT_PUBLIC_SUPABASE_URL=https://phone-test.invalid` and `NEXT_PUBLIC_SUPABASE_ANON_KEY=fixture-anon-key` on port 3095, then `npx playwright test --config playwright.phone.config.ts`.

The retained Node/SQLite simulator (`server.mjs`, `media.mjs`, `store.mjs`, `maintenance.mjs`) is a local regression harness for the original engine, not the selected deployment path. It needs Node 24 and `npm ci --ignore-scripts` inside this directory. Its media tests do not prove hosted SIP behavior. Use the Supabase adapter's readiness and runbook for deployment.
