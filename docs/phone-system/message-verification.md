# Message-only phone verification — October 25, 2026

Owner direction replaces the phone booking feature with message taking. The exact no-answer request is in `receptionist.mjs`. Staff pickup, no caller ringback and the local-business welcome remain. No new caller audio recording is created. The web/manual calendar and historical appointments remain intact.

## Acceptance evidence

- Release checks: 154 native voice checks; 18 isolated database/CRM checks (including all ten real-provider captures); full website suite 10,621 passed, 36 skipped. TypeScript and the production build also passed.
- Native service tests cover one-question turns, volunteered information, caller ID/blocked numbers, short/long messages, corrections, complete readback, early/ambiguous/duplicate yes, VAD/history/final-caption ordering, noisy or stray output, staff pickup, caller hangup, disconnects, silence/decline, bounded persistence and no booking tools.
- Real provider tests stream fictional caller TTS through the actual production media class and Grok speech recognition. Every outgoing audio clip is independently transcribed and checked against the prepared line. Twilio playback acknowledgements are simulated using the actual clip duration. No Twilio calls, SMS, customer records, appointments or audio files are created.
- The initial long-message provider test exposed a real regression: natural sentence pauses triggered name questions before the message finished. Later details were lost. The repair accumulates the latest final caption for each audio segment and waits through a 1.6-second quiet boundary before advancing. A new regression explicitly checks all long-message details, not only successful output.
- Subsequent real audio exposed cumulative captions under different IDs and ASR quotation marks in a corrected message. Prefix/overlap merging now retains each detail once; replacement-message punctuation no longer blocks its spoken readback. The final [provider report](message-provider-verification-20261025.json) has **10 passing conversations and 41 independently checked output clips**, with zero added caller delay and 600 ms state latency. It covers short/long/volunteered messages, corrected message and phone number, blocked caller ID, appointment-as-message, duration, decline, unclear answers and hangup.
- `conversation.database.test.ts` executes the production call-state CAS and callback SQL in isolated PostgreSQL, including independent read-after-write verification. It exercises confirmed messages, long content, corrections, blocked caller ID, failed writes/reads, expired worker claims and incomplete hangup recovery. It restarts the state reader, fetches through the actual authenticated Next route and HMAC-verified Edge control endpoint, and renders the actual CRM PhoneDesk message, transcript and summary.
- `/api/voice-805/scheduling` tests verify all former actions return 410 without a database client. No calendar record is created by the message database scenarios.
- Staff transcript notifications cannot be claimed until the media message has a verified CRM save. Actual SQL failure/recovery tests establish that unverified messages retain pending notices with zero send attempts, then submit once per intended staff destination after recovery. Long SMS content is explicitly shortened with a full-transcript CRM pointer; CRM retains the complete message.
- Signed callback tests cover STOP for the exact staff destination, delivered/undelivered states in the actual CRM view, late callback ordering, repeated hangup and worker restart, and failed/uncertain submissions without automatic duplicate sends. Carrier submissions and delivery callbacks in these tests are simulated; no real SMS was sent or delivery established.

The ten captured provider results are also replayed through actual callback SQL, independent readback, duplicate-save protection, a fresh state reader, the signed CRM retrieval route and the rendered PhoneDesk. These remain controlled layers: they do not establish live PSTN handset quality or production message delivery. No speculative owner retest is required to run these independent checks.

## Provider contract

The media implementation uses the documented xAI [Realtime voice events](https://docs.x.ai/developers/rest-api-reference/inference/voice). Server VAD can split a speaker's sentences, and completed captions may be revised before the turn ends; the application therefore owns the final turn boundary and each spoken reply. A matching prepared/output transcript is required before audio is released.

## External delivery status

The dedicated 805 campaign was submitted as `CMaba6c0b6723563c5a514181126ab706c`; the latest Console check showed **In review**, with no assigned/registered number yet listed on the campaign. The Messaging Service contains the intended 805 number. Staff transcript SMS stays disabled until both carrier approval and number registration are verified. No delivered-SMS claim is made.
