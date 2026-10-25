# Dedicated 805 voice fallback

This is the backup on the dedicated 805 Twilio number, not the Edge route `/twilio/fallback.xml`.

Live, unchanged by this branch:

- Number SID: `PNaafffce88dd92efd78345e2967637931`
- Function service: `ZS85a203f4cf8accf080ac48195e3801ed`
- Backup URL: `https://voice-805-fallback-9089-prod.twil.io/fallback`
- Read-only GET today: `<Response><Record maxLength="120" playBeep="true" timeout="5"/><Hangup/></Response>`

`fallback.js` is the reviewed replacement. It says "Our team members are tied up at the moment." then says the call could not continue and that no recording was made, then hangs up. It does not record, transcribe, or claim that a message was saved.

## Do not deploy from this change

Do not run `twilio serverless:deploy`, edit the function in the Twilio console, or change the number's voice fallback URL. Provider approval and a separate release have to come first.

When that release is authorized:

1. Open service `ZS85a203f4cf8accf080ac48195e3801ed` and replace the `/fallback` function with `fallback.js`.
2. Deploy that service only. Leave the number's fallback URL on `https://voice-805-fallback-9089-prod.twil.io/fallback`.
3. Read the URL back with GET. The body must contain `<Say>` and `<Hangup/>` and must not contain `<Record`.
4. Place no test call from this repository. A later handset check has to confirm the spoken line.
