# 805 Shutters phone service

The active implementation uses the dedicated 805 Supabase project, Twilio Media Streams, and Grok Voice. The phone agent takes callback messages only. The phone scheduling POST returns 410; no availability, appointment preparation, or booking tool is exposed. Historical bookings and the separate manual/web CRM scheduling system are unchanged.

## Call behavior

The welcome thanks callers for supporting local business, offers to take a message if staff miss the call, and describes free in-home consultations for shutters, blinds, and shades. Incoming staff phones ring while the caller hears this spoken welcome, without customer ringback. Human pickup interrupts the agent. The configured incoming list remains Mike and Jessica; this release changes no routing secret.

When staff do not answer, the agent says exactly:

> I'm sorry, our team members are tied up at the moment. May I please take a message and we'll get back to you as soon as possible.

It takes one answer at a time: message, missing name, and missing callback number. Valid caller ID is reused; blocked/anonymous caller IDs require a number. Volunteered facts are retained. Appointment requests are message content for staff to call back about; they never create a calendar entry. A consultation-duration question receives the established one-hour answer.

The complete message and callback details are read back. Corrections invalidate the previous confirmation. Only a clear yes after the readback plays confirms a message. The agent announces success only after an idempotent CRM write and an independent database read verify the saved content. Database timeouts are bounded. Failed/interrupted writes remain recoverable through the durable worker. Partial messages survive disconnects and are clearly marked unconfirmed.

Audio captions wait through a 1.6-second quiet period and merge adjacent speech segments before the next question, preventing a short sentence pause from dropping later details. Captions and message content are stored as text; no new caller audio recording is made. Messages over 2,000 characters prompt the caller for a shorter readback; their received captions remain available without silently shortening the transcript.

The CRM Messages view shows the saved message, caller transcript and factual call summary. Unknown or ambiguous caller IDs do not establish a customer identity or write customer/job activity. Reading does not resolve a message. Resolve/reopen retains the shared follow-up state.

## Delivery and recovery

The PostgreSQL call-state document uses compare-and-swap transactions. Carrier submissions are claimed before network IO; uncertain carrier outcomes are never blindly retried. CRM message and summary writes are idempotent and can retry after interrupted claims. The watchdog handles recovery.

Staff transcript notices are prepared for Mike and Jessica but remain disabled pending carrier approval and verification that the sender is registered. Dedicated campaign `CMaba6c0b6723563c5a514181126ab706c` was submitted and still showed **In review** on October 25. Service `MG60d4038bf54bffa0690cce85a6e49147` contains +18055908050. This is not SMS-delivery proof. No booking-alert SMS is enabled.

The dedicated number's emergency backup is non-recording TwiML Bin `EH99ed28ca457fca8ced72259f99ec6973`. It says the call could not continue and asks the caller to call back to leave a message. It makes no saved-message claim and has no scheduling offer. The old recording Function remains unselected. Carrier execution of the emergency bin is not proven by a Console readback.

The call-state document has a 16 MiB ceiling. No automatic deletion is enabled. A separately reviewed retention/archive policy is needed before treating it as an unlimited archive.

## Verification and deployment

See [message verification](../../docs/phone-system/message-verification.md) for test layers and remaining handset limits. Earlier scheduling reports are historical and do not describe the current agent.

```sh
npm run typecheck
npm test
npm run build
node --test services/voice-805/test/*.test.mjs
```

Use the repository main-release procedure for the website and deploy the bundled `supabase/functions/voice-805/index.ts` to the dedicated 805 Edge function. Preserve Twilio signature checks, staff authentication, secret values, and the independent SMS gate. Verify exact deployed source and website commit; a passing simulation is not handset or SMS delivery evidence. Temporary provider test functions must be retired after testing.
