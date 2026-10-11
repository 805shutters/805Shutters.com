# 805 Call Center implementation status

October 10, 2026. The Supabase implementation is locally tested. **The phone agent is not live or verified ready.**

Implemented: AI-first common greeting; concurrent CRM lookup; distinct stage hints; unique/ambiguous/unknown branches; simultaneous private-cell offers with atomic acceptance; conference-based staff connection, hold/consult/transfer/resume; durable message/outbox state; signed carrier callbacks and staff controls; parent hangup handling; shared customer messages; red unresolved-voice-message badge; independent text state; guarded watchdog and carrier submission.

Verified locally:

- 41 phone-service tests pass, including Supabase transaction races, duplicate ingress, uncertain carrier submissions, caller completion, conference evidence and activation guards.
- Full website suite: 10,239 passed, 31 skipped across 802 files.
- Desktop, iPad and mobile browser fixture checks pass for badge behavior, message follow-up, customer access and SMS separation.
- Production website build and Deno entrypoint check pass. No carrier/audio evidence is implied.

Remaining: dedicated 805 Supabase management access; remote migration/advisor checks and Edge deployment; secure provider/website configuration; watchdog readback; xAI hosted-agent call-token/tool and greeting-audio verification; Pacific ringing hours; temporary-number routing; actual authorized handset/audio pilot and any approved staff-message delivery checks. The current management account lists MTS projects but lacks the dedicated 805 production project. Authenticated Twilio/xAI browser tabs were available, but this chat lacks the browser-control tool.

Use [the deployment runbook](supabase-deployment.md). The pilot JSON state has a 16 MiB ceiling; capacity and a reviewed archival/normalization plan must be addressed before public-number cutover. No Render service, number port, production call-route change, live test call or SMS has been performed by this implementation.
