# Supabase deployment and temporary-number acceptance

This runbook replaces the earlier Render proposal. Nothing here authorizes porting the public business number or changing MTS routes.

## 1. Dedicated 805 database and function

Confirm the connected management account can read the existing 805 production project. Review and apply only `20261011014441_voice_805_supabase_call_center.sql`, after checking remote migration history and existing CRM columns. The schema adds a service-only RLS state table, an atomic revision-checked commit function, and a service-only caller lookup. It does not grant browser access. Run Supabase database advisors and verify anonymous/authenticated denial plus service-role lookup and CAS behavior after applying.

Inspect CLI `functions deploy --help` and `secrets set --help`, then deploy `voice-805` to the explicit 805 project. `verify_jwt=false` is intentional: Twilio signatures and application-specific HMAC/bearer credentials protect the routes. Do not deploy to a project selected implicitly by stale local linking.

Keep `VOICE_805_MODE=standby`, `VOICE_805_DATASET=pilot`, `VOICE_805_LIVE_AUTHORIZED=false`, `VOICE_805_AGENT_CONTRACT_VERIFIED=false`, `VOICE_805_WORKER_VERIFIED=false`, `VOICE_805_AGENT_REVIEWED=false`, and `VOICE_805_NOTIFICATIONS_APPROVED=false` while provisioning.

Privately configure these Edge secrets without logging values:

- `VOICE_805_PUBLIC_ORIGIN`: full HTTPS function URL, no trailing slash.
- `VOICE_805_TWILIO_ACCOUNT_SID`, `VOICE_805_TWILIO_AUTH_TOKEN`, `VOICE_805_NUMBER`: separate 805 account and temporary test number.
- `VOICE_805_XAI_API_KEY`: dedicated Grok Voice API key. Do not put it in the stream URL.
- `VOICE_805_TRANSPORT`: `media` (the live path). Hosted SIP is not the answer path.
- `VOICE_805_CONTROL_KEY`, `VOICE_805_TOOLS_KEY`, `VOICE_805_WORKER_KEY`: separate random secrets, each at least 32 characters.
- `VOICE_805_BOOKING_AUTHORIZED`: leave unset or `false` until a reviewed production booking release. Pilot calls may inspect slots and cannot create CRM appointments.
- `VOICE_805_STAFF_JSON`: `mike` and `jessica`, each with `kind:cell`, `destination`, and `sms`. Reuse independently verified existing workflow numbers; never commit them.
- `VOICE_805_HOURS_JSON`: explicit day keys 0–6 (Sunday first), each containing minute-of-day intervals. Pacific timezone, exclusive closing time; split overnight intervals at midnight. `VOICE_805_HOLIDAYS_JSON`: date-specific interval overrides. Hours remain a user decision.
- `VOICE_805_OFFER_SECONDS`: 20 when unset. Optional `VOICE_805_STATUS_TOPICS_JSON` overrides the distinct stage hints.

Website secrets: `VOICE_805_SERVICE_ORIGIN` equals the full function URL, `VOICE_805_CONTROL_KEY` matches Edge, and `VOICE_805_STAFF_EMAILS_JSON` explicitly maps the existing authorized email identities to Mike/Jessica. Never expose these as `NEXT_PUBLIC` values. Existing CRM authentication still applies.

## 2. Durable watchdog

Use Supabase pg_cron + pg_net with credentials in Vault ([official guidance](https://supabase.com/docs/guides/functions/schedule-functions)). Enable the extensions and privately provision Vault secrets `voice_805_origin` and `voice_805_worker_key`; the latter must match the Edge secret. Apply `watchdog.sql` only to the dedicated 805 project. It schedules a 5-second heartbeat and preserves existing unrelated jobs.

Read back `cron.job`, recent `cron.job_run_details`, and `net._http_response` status codes without exposing request headers. In standby the authenticated worker returns HTTP 200 with `callingEnabled:false`; an invalid key returns 401. After observing successful periodic requests, set `VOICE_805_WORKER_VERIFIED=true`. The worker still performs no carrier operations until every remaining readiness check passes. Typical timeout recovery occurs within one schedule interval plus request latency; measure actual behavior during the pilot. Rollback: `select cron.unschedule('voice-805-watchdog');`.

## 3. Grok media receptionist

The carrier says the greeting, then both staff legs ring with answering-machine detection. After no answer, Twilio opens a signed Media Stream to `/twilio/media/<call id>`. Grok apologizes and offers a message or a consultation. Scheduling and message tools run through `POST /api/voice-805/scheduling` on www.805shutters.com. A spoken yes after the played readback is the only save. See [the media pilot note](grok-api-pilot.md). Do not enable `VOICE_805_AGENT_CONTRACT_VERIFIED` until a real call proves greeting audio, both handsets, machine detection, spoken confirmation, and a verified CRM save.

## 4. Temporary Twilio number only

Read back the dedicated account and test number before edits. After a future deploy, the suggested voice webhook is `POST {ORIGIN}/twilio/inbound`, parent status `POST {ORIGIN}/twilio/status`, and voice fallback `POST {ORIGIN}/twilio/fallback.xml`. `VOICE_805_PUBLIC_ORIGIN` must be that same origin or signatures fail. Do not configure `+18055908050` from this change. Incoming SMS stays a separate setup. Preserve existing production and MTS number routes.

Activation requires the reviewed hosted agent, valid hours, working watchdog, provider funding/account restrictions, verified trial destinations where applicable, and explicit temporary-number readiness. Then set the activation flags and check `/health` reports ready. Do not enable notification sending until staff alert wording, destinations, consent and provider messaging requirements are approved.

## 5. Evidence required before calling it ready

Place an authorized test call to the temporary number. Correlate carrier SIDs, persisted state and actual handset/audio observations. Prove exact greeting timing; both private handsets ringing; machine-detection rejection of personal voicemail; AI exit to the recorded fallback; actual two-way staff audio; no-answer message and scheduling; spoken confirmation; verified CRM saves; caller hangup; and both staff alerts with recipient receipt evidence if messaging is enabled.

Test process interruption and watchdog recovery, plus duplicate callbacks and uncertain carrier outcomes. Review history capacity and backup/restore before cutover. No public-number port until separate authorization and a successful pilot.
