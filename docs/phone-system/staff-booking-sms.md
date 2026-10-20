# Staff booking SMS activation

This checklist is not authorization to send, to set live secrets, or to redeploy voice. Voice v24 (`94444563`) is already live. Real handset audio, a confirmed CRM booking, and delivery of both staff texts are still unverified.

## Program

SNS Interiors dba 805 Shutters. Brand `BN7de9364fdf7e2e9b53ff9233a47b76fd` is approved Low Volume Standard. Messaging service `MG60d4038bf54bffa0690cce85a6e49147` has one sender, `+18055908050`. The campaign on that service is not submitted and not approved. Do not send staff booking texts until the campaign is approved.

The alerts are staff-only and event-based: one text to Jessica and one text to Mike after an agent-confirmed consultation. Jessica stays off the incoming ring list. `VOICE_805_RING_STAFF_JSON` remains `["mike"]` for the current test. Do not remove Jessica from the booking SMS recipients.

The staff consent method for Mike and Jessica is pending. This release does not record that method and does not add a customer opt-in form.

## Sender

Agent staff booking SMS uses only these website environment variables, all required:

- `VOICE_805_STAFF_SMS_ACCOUNT_SID` — the verified 805 account. Any other account fails closed. Do not commit that SID.
- `VOICE_805_STAFF_SMS_AUTH_TOKEN` — auth token for that account. Do not commit or log it.
- `VOICE_805_STAFF_SMS_MESSAGING_SERVICE_SID` — must be `MG60d4038bf54bffa0690cce85a6e49147`.
- `VOICE_805_STAFF_SMS_FROM` — must be `+18055908050`. Any other from number, including `+18057931853`, fails closed.

If any value is missing, or the account, service, or from number is not the verified 805 identifier above, the notice fails and Twilio is not called. The outbox status is `failed`, not `sent`. Customer SMS, MTS SMS, calendar assignment SMS, and other owner alerts keep their existing `TWILIO_*` route and may still pin Mike to `+18057931853`.

Every agent staff alert ends with this line: `Reply STOP to unsubscribe; HELP for help.` Campaign samples must use that same ending.

Provider acceptance and handset delivery stay different. Twilio status `queued` or `accepted` stores outbox status `sent` and `noticePhase` `accepted`. That is not delivery. `noticePhase` `delivered` is stored only when the provider status is `delivered`. The booking result reports `staffNotice` `sent` for acceptance and `delivered` only when both staff rows have `noticePhase` `delivered`. A timeout, a 5xx response, or a 2xx response without a Message SID stays `uncertain` and is not retried automatically. A later outbox pass does not send that row again. Do not describe an accepted send as delivered.

## Opt-out

Advanced Opt-Out on `MG60d4038bf54bffa0690cce85a6e49147` is enabled and was verified after reload. The saved STOP, START, and HELP replies are branded 805 Shutters (SNS Interiors) and include frequency, rates, and the help contacts. Do not add an application STOP webhook. The four website variables stay unset until the campaign is approved and the staff consent method is recorded.

## Published URLs

These pages are in the review branch. They are not the live site until a later website publish. Do not give a preview or session URL to the campaign reviewer.

After the website publish, open both addresses with no login and confirm HTTP 200:

- `https://www.805shutters.com/privacy-policy/` includes “We do not sell or share your SMS opt-in data or personal information with third parties for marketing purposes” and still describes Google and Meta analytics.
- `https://www.805shutters.com/staff-booking-sms/` has the heading Terms & Conditions and an SMS Terms section. That section names SNS Interiors dba 805 Shutters, staff-only confirmed consultation alerts, “Message frequency varies.”, “Message and data rates may apply.”, **STOP**, **HELP**, `805@805shutters.com`, `805-590-8050`, the carrier delay notice, and that enrollment requires staff consent. It does not describe a consent collection method or say that consent evidence is pending.

Use those two production URLs in the campaign. Do not submit the campaign from this change.

## Before the first text

1. Confirm the production privacy and terms URLs above.
2. Submit and receive approval for the campaign on `MG60d4038bf54bffa0690cce85a6e49147`.
3. Keep `+18055908050` as the sole sender. Do not add another.
4. Leave Advanced Opt-Out on. Its STOP, START, and HELP replies are already saved.
5. Record the Mike and Jessica consent method outside this repository. That method is still pending.
6. Set the four website variables. Do not put the auth token in the voice Edge function or in git.
7. Place one controlled booking and confirm separate provider receipts for Jessica and Mike. `queued` or `accepted` is not handset delivery. An uncertain row is not success and is not resent automatically.
