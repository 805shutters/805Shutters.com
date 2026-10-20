# Staff booking SMS activation

This checklist is not authorization to send, to set live secrets, or to redeploy voice. Voice v24 (`94444563`) is already live. Real handset audio, a confirmed CRM booking, and delivery of both staff texts are still unverified.

## Program

SNS Interiors dba 805 Shutters. Brand `BN7de9364fdf7e2e9b53ff9233a47b76fd` is approved Low Volume Standard. Campaign registration is being prepared on messaging service `MG60d4038bf54bffa0690cce85a6e49147`. That campaign is not submitted and not approved. Do not send staff booking texts until the campaign is approved and a sender is associated with that service.

The alerts are staff-only and event-based: one text to Jessica and one text to Mike after an agent-confirmed consultation. Jessica stays off the incoming ring list. `VOICE_805_RING_STAFF_JSON` remains `["mike"]` for the current test. Do not remove Jessica from the booking SMS recipients.

Mike and Jessica consent evidence is pending. This release does not record that consent and does not add a customer opt-in form.

## Sender

Agent staff booking SMS uses only these website environment variables, all required:

- `VOICE_805_STAFF_SMS_ACCOUNT_SID` — dedicated 805 Twilio account. It must not equal `TWILIO_ACCOUNT_SID`.
- `VOICE_805_STAFF_SMS_AUTH_TOKEN` — auth token for that account. Do not commit or log it.
- `VOICE_805_STAFF_SMS_MESSAGING_SERVICE_SID` — must be `MG60d4038bf54bffa0690cce85a6e49147`.
- `VOICE_805_STAFF_SMS_FROM` — sender on that service, in E.164. It must not be `+18057931853`.

If any value is missing, the service SID does not match, the from number is the old owner-alert sender, or the account SID matches the shared Twilio account, the notice fails and Twilio is not called. The outbox status is `failed`, not `sent`. Customer SMS, MTS SMS, calendar assignment SMS, and other owner alerts keep their existing `TWILIO_*` route and may still pin Mike to `+18057931853`.

Accepted provider responses store the Message SID and `queued` or `accepted` as accepted, not delivered. `delivered` is recorded only when the provider status is `delivered`. A timeout, a 5xx response, or a 2xx response without a Message SID stays `uncertain` and is not retried automatically. A later outbox pass does not send that row again.

## Opt-out

Do not add an application STOP webhook in this release. After the messaging service setup is verified, confirm that service `MG60d4038bf54bffa0690cce85a6e49147` uses Twilio default or Advanced Opt-Out before any staff text is sent. Until that check is recorded, leave the four variables unset so the path stays fail-closed.

## Published URLs

These pages are in the review branch. They are not the live site until a later website publish. Do not give a preview or session URL to the campaign reviewer.

After the website publish, open both addresses with no login and confirm HTTP 200:

- `https://www.805shutters.com/privacy-policy/` includes “We do not sell or share your SMS opt-in data or personal information with third parties for marketing purposes” and still describes Google and Meta analytics.
- `https://www.805shutters.com/staff-booking-sms/` names SNS Interiors dba 805 Shutters, staff-only confirmed consultation alerts, “Message frequency varies.”, “Message and data rates may apply.”, **STOP**, **HELP**, `805@805shutters.com`, `805-590-8050`, and the carrier delay notice. It states that consent evidence is pending.

Use those two production URLs in the campaign. Do not submit the campaign from this change.

## Before the first text

1. Confirm the production privacy and terms URLs above.
2. Submit and receive approval for the campaign on `MG60d4038bf54bffa0690cce85a6e49147`.
3. Associate the dedicated from number with that service.
4. Confirm default or Advanced Opt-Out on that service.
5. Record Mike and Jessica consent outside this repository.
6. Set the four website variables. Do not put the auth token in the voice Edge function or in git.
7. Place one controlled booking and confirm separate provider receipts for Jessica and Mike. An uncertain row is not success and is not resent automatically.
