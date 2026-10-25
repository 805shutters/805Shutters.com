# 805 Call Center implementation status

October 25, 2026. Audited live Edge is voice-805 v25, matching `dd55b405`. This later commit is not deployed. An esbuild 0.25.12 bundle of `dd55b405` reproduces the live v25 bundle, 182142 characters, except a transport trailing newline. Live `ringStaff` is mike and jessica, restored through the dashboard and checked on `/health`. Do not change that secret. The active and Edge fallback paths do not start a new recording. Caller-message transcripts are queued for both staff and are not sent. Campaign `BU542a67b844388f5192a84c79d6a86cb9` is draft on service `MG60d4038bf54bffa0690cce85a6e49147`. Booking-alert SMS stays off. The call-summary migration is not applied. The dedicated number's Twilio Function fallback still returns a Record verb; the reviewed replacement is not deployed. Production `/terms/` still returns 404, and the live privacy policy does not yet include the SMS section. The watchdog was active every 5 seconds, with 17204 succeeded runs in the last 24 hours. The callback table was empty. The latest real call before that check was October 22, before the v25 release, so there is no v25 complete handset booking proof.

October 20, 2026. Voice v24 (`94444563`) answered call `5a39f34c-7053-499a-afb0-b0f80c84eb55` at `2026-10-20T21:05:26Z` and confirmed welcome carrier playback: welcome speaking `21:05:28.118`, Twilio playback mark played `21:05:46.364`. Opening speech started `21:05:46.902` and the carrier disconnected `21:05:53.172` during opening playback. A stored `greetingPlayed=false` is not evidence that the welcome did not play. Scheduling intake, a verified CRM save, and provider acceptance of both staff texts remain pending. The October 10 notes below are the earlier hosted-agent snapshot.

October 10, 2026 (Pacific). The Call Center website is published and the Supabase schema and standby function are deployed. **That hosted-agent snapshot was not live or verified ready.**

Implemented: AI-first common greeting; concurrent CRM lookup; distinct stage hints; unique/ambiguous/unknown branches; simultaneous private-cell offers with atomic acceptance; conference-based staff connection, hold/consult/transfer/resume; durable message/outbox state; signed carrier callbacks and staff controls; parent hangup handling; shared customer messages; red unresolved-voice-message badge; independent text state; guarded watchdog and carrier submission.

Verified locally:

- 42 phone-service tests pass, including Supabase transaction races, duplicate ingress, uncertain carrier submissions, caller completion, conference evidence, activation guards, and hosted gateway paths with public-URL carrier signatures.
- Full website suite on the current release base: 10,242 passed, 31 skipped across 802 files.
- Desktop, iPad and mobile browser fixture checks pass for badge behavior, message follow-up, customer access and SMS separation.
- Production website build and Deno entrypoint check pass. No carrier/audio evidence is implied.

Verified remotely: migration 20261011014441 is recorded in the dedicated 805 project, its stored source matches the repository, RLS is enabled, anonymous/authenticated roles cannot read call state or execute caller lookup, and service-role CAS rejects a stale revision. Verification writes were rolled back and both datasets remain empty. The first Edge deployment boots; live verification exposed the gateway-prefix routing correction included here.

The user approved ringing Mike and Jessica 24 hours every day. The deployed environment contains that schedule and explicit false activation flags. The hosted receptionist draft now has the short common greeting, context branches and 24/7 instructions; it remains disconnected.

Remaining: redeploy and verify the routing fix; secure provider/website configuration; watchdog readback; xAI hosted-agent call-token/tool and greeting-audio verification; temporary-number routing; actual authorized handset/audio pilot and any approved staff-message delivery checks. The CLI/MCP management identity still lacks the dedicated project, but the authenticated Supabase dashboard works. Twilio requires sign-in. xAI has no number assigned to this agent; trusted SIP-header injection into hosted HTTP tools has not been verified. The documented signed SIP webhook plus call-ID WebSocket flow is a possible adapter replacement, not implemented or proven by this deployment.

Use [the deployment runbook](supabase-deployment.md). The pilot JSON state has a 16 MiB ceiling; capacity and a reviewed archival/normalization plan must be addressed before public-number cutover. No Render service, number port, production call-route change, live test call or SMS has been performed by this implementation.
