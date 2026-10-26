# Staff text notices

This checklist is not authorization to send, to set live secrets, to deploy the voice function, or to publish the website. Audited live Edge for this patch was voice-805 v25, matching `dd55b405`. This later commit is not deployed. Call `5a39f34c-7053-499a-afb0-b0f80c84eb55` reached voice v24 (`94444563`) at `2026-10-20T21:05:26Z`. Runtime logs show welcome speaking at `21:05:28.118` and the Twilio playback mark played at `21:05:46.364`, so welcome carrier playback is confirmed. Opening speech started at `21:05:46.902`. The carrier disconnected at `21:05:53.172` during opening playback. The call captured no scheduling intent and created no CRM booking. A stored `greetingPlayed=false` is the listening-welcome flag and is not, by itself, evidence that the welcome did not play. There is no v25 complete handset booking proof. The latest real call before the 2026-10-25 check was October 22, before the v25 release. The callback table was empty. The watchdog was active every 5 seconds, with 17204 succeeded runs in the last 24 hours.

## Caller-message transcripts

This is the only texting setup authorized for this branch. Booking-alert SMS stays out of scope.

Campaign `BU542a67b844388f5192a84c79d6a86cb9` is draft. Messaging service `MG60d4038bf54bffa0690cce85a6e49147` has one sender, `+18055908050`. No campaign on that service is submitted. The same draft is being prepared through a recovered Persona form. Provider approval stays outside this repository. `transcriptSmsSendingEnabled()` returns false while that campaign status is draft, so a live secret cannot start these texts. The voice service queues one pending notice per saved or unconfirmed caller message for Mike and one for Jessica, with purpose `transcript`. It does not call Twilio. A queued or pending row is not delivered. An unconfirmed message includes the marker `UNCONFIRMED.` The CRM message keeps the captured transcript, up to 2000 characters. A text that does not fit in 1600 characters keeps that status marker, then `Message shortened; full transcript in CRM Message Center`, then `Reply STOP to unsubscribe; HELP for help.` The shortened text does not say the full transcript is in the SMS. A text that fits has no shortening line. Each body ends with `Reply STOP to unsubscribe; HELP for help.`

After the campaign is approved, the voice worker can send purpose `transcript` through the existing notification path. That path records `accepted` or `queued` separately from `delivered`, leaves a timeout or a response without a Message SID as `uncertain`, and does not retry an uncertain send. A STOP preference blocks the send. Booking-alert SMS stays off. `provider.send` posts both `MessagingServiceSid` `MG60d4038bf54bffa0690cce85a6e49147` and `From` `+18055908050`. [Twilio's Messaging Services guide](https://www.twilio.com/docs/messaging/services) requires both when a specific sender must be used together with Advanced Opt-Out. Keyword copy on the service is being handled separately and is not changed here.

On 2026-10-25 Mike verbally confirmed that both he and Jessica consented to these transcript texts. A direct reply from Mike reconfirmed Jessica's consent. That is Mike's confirmation. It is not a signed form and it is not keyword proof. A Twilio check that did not submit the campaign confirmed that production `/terms/` still returns 404.

Live `ringStaff` is `["mike","jessica"]`. That list was restored through the dashboard on 2026-10-25 and checked on `/health`. Do not change `VOICE_805_RING_STAFF_JSON` from this branch.

## Booking alerts

Booking alerts are not this campaign and are not activated. Do not enable `sendAgentStaffBookingSms`. Leave the four `VOICE_805_STAFF_SMS_*` website variables unset. The earlier description of one text to Jessica and one text to Mike after an agent-confirmed consultation remains the unused booking-alert program. Jessica is on the live incoming ring list with Mike.

## Sender rules for a later approved send

These rules describe the dedicated 805 sender. They do not authorize a send now.

- `VOICE_805_STAFF_SMS_ACCOUNT_SID` — the verified 805 account. Any other account fails closed. Do not commit that SID. Its SHA-256 is `1516fe83fa4addc9bcac21f94a4b82e69b1715156cefbc3b134049139230cec0`.
- `VOICE_805_STAFF_SMS_AUTH_TOKEN` — auth token for that account. Do not commit or log it.
- `VOICE_805_STAFF_SMS_MESSAGING_SERVICE_SID` — must be `MG60d4038bf54bffa0690cce85a6e49147`.
- `VOICE_805_STAFF_SMS_FROM` — must be `+18055908050`. Any other from number, including `+18057931853`, fails closed.

If any value is missing, or the account, service, or from number is not the verified 805 identifier above, the booking-alert notice fails and Twilio is not called. The outbox status is `failed`, not `sent`. Customer SMS, MTS SMS, calendar assignment SMS, and other owner alerts keep their existing `TWILIO_*` route and may still pin Mike to `+18057931853`.

Every agent staff alert ends with this line: `Reply STOP to unsubscribe; HELP for help.`

Provider acceptance and handset delivery stay different. Twilio status `queued` or `accepted` stores outbox status `sent` and `noticePhase` `accepted`. That is not delivery. `noticePhase` `delivered` is stored only when the provider status is `delivered`. The booking result reports `staffNotice` `sent` for acceptance and `delivered` only when both staff rows have `noticePhase` `delivered`. A timeout, a 5xx response, or a 2xx response without a Message SID stays `uncertain` and is not retried automatically. A later outbox pass does not send that row again. Do not describe an accepted send as delivered.

## Opt-out

Advanced Opt-Out on `MG60d4038bf54bffa0690cce85a6e49147` is enabled and was verified after reload. The saved STOP, START, and HELP replies are branded 805 Shutters (SNS Interiors) and include frequency, rates, and the help contacts. Do not add an application STOP webhook. The four website variables stay unset. Transcript sending stays off while the campaign is draft.

## Published URLs

The branch has the public copy. Production does not. `https://www.805shutters.com/terms/` still returns 404, and the live privacy policy does not yet include the SMS section. Do not give a preview or session URL to the campaign reviewer. Do not publish the website from this change.

On the branch:

- `/terms/` is the canonical Terms & Conditions page. Its SMS Terms section names SNS Interiors dba 805 Shutters, staff notices of caller message transcripts, “Message frequency varies.”, “Message and data rates may apply.”, **STOP**, **HELP**, `805@805shutters.com`, `805-590-8050`, the carrier delay notice, and “These notices go only to 805 Shutters staff who have verbally agreed to receive them.” It includes “We do not sell or share your SMS opt-in data or personal information with third parties for marketing purposes”. It does not say the opt-in is a signed form or a keyword.
- `/staff-booking-sms/` re-exports that page.
- The privacy policy section “Staff text messages” uses the same transcript description, the same no-sharing sentence, and links to `/terms/`. The Google and Meta analytics section is unchanged.

After a later website publish, open `https://www.805shutters.com/terms/` and `https://www.805shutters.com/privacy-policy/` with no login and confirm HTTP 200 before anyone submits the campaign. Use those two production URLs in the campaign. Do not submit the campaign from this change.

## Before any transcript text is sent

1. Publish the production privacy and terms URLs above. They are not live yet.
2. Receive provider approval for campaign `BU542a67b844388f5192a84c79d6a86cb9` on `MG60d4038bf54bffa0690cce85a6e49147`. Approval is external. The campaign is still draft.
3. Keep `+18055908050` as the sole sender. Do not add another.
4. Leave Advanced Opt-Out on.
5. A separate authorization has to turn sending on. This branch does not. Do not place a synthetic production send, recording, or call from this change.
