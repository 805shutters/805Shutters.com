# Staff transcript SMS

## Verified registration and authorization

On October 25, 2026, Twilio Console independently confirmed campaign `CMaba6c0b6723563c5a514181126ab706c` **Approved** for 805 Shutters — SNS Interiors, and `+18055908050` **REGISTERED** on that exact campaign. The dedicated Messaging Service is `MG60d4038bf54bffa0690cce85a6e49147`. Mike authorized activation and controlled staff delivery tests after reporting the approval email. Mike and Jessica both consented to automated caller-message transcript texts, with Jessica's consent explicitly reconfirmed by Mike.

This supersedes the earlier draft/in-review status. No MTS account, campaign, or number is used.

## Active workflow

- The phone agent takes messages only. Appointment booking and booking-alert SMS are retired from the phone flow; unrelated manual/web scheduling remains intact.
- A message is read back for confirmation. The complete caller transcript, message and factual summary remain in the CRM. A hangup can retain a clearly labeled unconfirmed draft. No audio is recorded.
- Media transcript notices wait for an independently verified CRM save. The worker then submits one notice per message to each configured, consenting staff SMS destination, Mike and Jessica.
- Every notice uses purpose `transcript`, both the exact Messaging Service and `From` above, and the footer `Reply STOP to unsubscribe; HELP for help.` Unconfirmed messages retain `UNCONFIRMED.`
- SMS bodies over the limit are explicitly shortened with `Message shortened; full transcript in CRM Message Center`; the CRM transcript is retained.
- Signed carrier callbacks update the CRM notification log. Accepted/queued/sent is not delivered. Terminal delivery states cannot be downgraded by late callbacks. Failed or uncertain submissions are not blindly resent.
- Staff STOP preferences suppress the exact destination. Advanced Opt-Out remains enabled, and the Messaging Service's inbound webhook uses the signed `/voice-805/twilio/text` handler.

## Boundaries

The verified registration constants enable transcript notices only. They do not enable booking alerts or customer SMS. The four `VOICE_805_STAFF_SMS_*` website booking-alert variables stay unset. Existing incoming call routing to Mike and Jessica is unchanged. Credentials remain server-side and are never committed.

The public `/terms/` and `/privacy-policy/` pages describe staff transcript notices and consent. A queued intent, a simulation, or provider acceptance is not delivery proof. See [message verification](message-verification.md) for layered test evidence and remaining live acceptance.
