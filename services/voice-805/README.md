# 805 Shutters phone service

Production target: the existing dedicated 805 Supabase project, Twilio Media Streams, and the Grok Voice API. No Render deployment is required. **Activation stays off until the flags below are set. This change does not configure the phone number.**

## Runtime

`supabase/functions/voice-805/index.ts` serves short signed webhooks. Twilio plays the greeting in Grok's cached `ara` voice and rings Mike and Jessica at the same time. `<Say>` is only the fallback when that audio is not stored yet. If neither person answers, a signed Media Stream connects the caller to Grok. PostgreSQL stores call state, messages, and the provider outbox. The CRM Call Center proxies authenticated staff actions with an explicit Mike/Jessica role mapping and a signed, replay-protected request.

`supabase-store.mjs` uses optimistic compare-and-swap transactions. No carrier request occurs inside a retried database transaction. Outbox claims commit before network submission. Unknown carrier outcomes stay uncertain for reconciliation; they are never blindly redialed or resent. Both initial staff dial requests start in the same parallel batch. Answering-machine detection chooses one human owner atomically; a machine or recorded greeting is not an answer. Answered status requires a signed caller conference join after staff connection and AI removal.

The pilot stores each dataset in a single JSON document with a 16 MiB ceiling. This is a bounded pilot implementation, not an unlimited archive. Inspect database size before and during the pilot; normalize/archive records with a reviewed retention policy before general production cutover. No automatic data deletion is enabled. PostgreSQL backups apply; the old SQLite backup tool does not back up Supabase.

## Call behavior

Every caller hears exactly: **Thank you for calling 805 Shutters. We appreciate you supporting local business. Let me get you over to one of our team members immediately.** That line is Grok's `ara` voice when the cached wav is ready. Mike and Jessica ring at the same time, while it plays. Until one of them joins, the caller hears ringing rather than a repeated hold message. Staff legs use Twilio answering-machine detection. A human bridges and cancels the other leg. A machine, beep, silence, fax, or unknown result is not an answer. Nobody presses a key.

If both legs are no-answer, or the offer window (default 20 seconds) expires, Grok says exactly: "Apologies, but team members are tied up at the moment. Would you like to leave a message for a callback, or would you like to schedule an appointment?" It does not repeat the thank-you greeting. A message collects name, a confirmed callback number, and the message. An appointment asks for the city and when the caller can meet. A weekday, anytime, morning, afternoon, a window, or a specific time is enough. The checker recommends one verified time from route and calendar constraints and does not require an exact clock time. It books only a currently open published CRM slot. If none fits, it offers a callback so staff can see whether they can accommodate it. Messages and appointments are read back and saved only after a spoken yes. If the media stream does not attach, Twilio records a voicemail that starts "Apologies, but team members are tied up at the moment" and then takes a message after the tone. It does not offer a choice.

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
