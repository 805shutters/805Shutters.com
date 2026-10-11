# 805 Call Center implementation status

October 10, 2026 (Pacific). The Call Center website is published and the Supabase schema and standby function are deployed. **The phone agent is not live or verified ready.**

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
