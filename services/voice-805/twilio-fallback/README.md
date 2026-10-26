# Dedicated 805 voice fallback

This is the backup on the dedicated 805 Twilio number, not the Edge route `/twilio/fallback.xml`.

Configured backup, saved and reloaded in the dedicated 805 account:

- Number SID: `PNaafffce88dd92efd78345e2967637931` (US1)
- Backup: TwiML Bin `EH99ed28ca457fca8ced72259f99ec6973`, the 805 non-recording emergency fallback
- Body: `<Say>` then `<Hangup/>`, with no `<Record>`
- Spoken line: "Our team members are tied up at the moment. We could not continue this call, and no recording was made. Please call back to leave a message."
- Console save and reload succeeded. The persisted SID is `EH99ed28ca457fca8ced72259f99ec6973`.
- Primary inbound POST and status POST were not changed.
- Carrier execution was not tested.

The old recording Function is retained and is no longer selected:

- Function service: `ZS85a203f4cf8accf080ac48195e3801ed`
- Function URL: `https://voice-805-fallback-9089-prod.twil.io/fallback`
- A read-only GET of that Function URL can still return `<Response><Record maxLength="120" playBeep="true" timeout="5"/><Hangup/></Response>`

`fallback.js` is the reviewed source that matches the bin. It says "Our team members are tied up at the moment." then says the call could not continue and that no recording was made, then hangs up. It does not record, transcribe, or claim that a message was saved.

## Routing remains unchanged

The message-only release updates only the existing bin wording. No Function deployment, number handler, primary inbound POST, or status POST change is required. The bin remains the selected backup. The Function remains only as a retained, unselected recording handler.
