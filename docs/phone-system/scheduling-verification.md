# Scheduling release verification

The Oct 25 handset failures exposed gaps in the event simulation. Successful
transcript parsing did not prove that the next spoken question reached the caller.
The original fixture generally delivered a final caption followed by an uninterrupted
scripted response. It missed audio-history captions preceding final captions,
duplicate final captions clearing the next question, and VAD speech-start signals
discarding a question without a completed replacement answer.

The 18:12 Pacific call on Edge v28 persisted an appointment request, October 30,
and 10:00, then produced no played address-question checkpoint. Caller input
was accepted; the output lifecycle failed. No appointment was saved. The exact
audio content and every intermediate event are unavailable because calls are not
recorded. Reproduced event failures support the repairs; they do not prove every
event that occurred on that handset call.

| Layer | Scenarios and evidence | Limits |
| --- | --- | --- |
| Media session | Eight natural scheduling requests crossed with four event orders: history before final, history after final, VAD during output, duplicate final during output. Relative/day-name dates, exact times, flexible windows and out-of-hours requests. Assert one question, persisted fields, audible media/mark lifecycle and no booking. | Simulated sockets/audio, not live ASR or handset sound. |
| Conversation/state | Invalid/past dates, weekday mismatch, time ambiguity, alternatives/rejection, date/time/address corrections, unclear/repeated replies, silence, interrupted/readback confirmation, staff takeover, stream replacement and recovery. | Deterministic parsing/state tests. |
| Availability/API | Actual scheduler functions with controlled calendar/travel inputs; signed API gating; exact slot, no fit, alternatives, flexible preference ranking, missing travel proof and stale availability. | Provider/calendar reads are controlled fixtures. |
| Isolated database | PGlite executes actual CRM schema and booking migrations. Published-slot success, unpublished/past days, before/after hours, off-grid time, simultaneous contenders, replay, confirmation and role checks. Rejections leave no partial leads/jobs/calendar/outbox rows. | Isolated database; no production customer booking, message, or outbound SMS. |
| Production | Exact deployed source/version, website SHA, service readiness, webhook authentication and watchdog. | These checks do not establish a successful phone conversation. |
| Handset | Owner-controlled call through Twilio and the actual transcription/voice provider. | Required after automated/provider-contract verification; still pending for the latest repair. |

Run `node --test services/voice-805/test/*.test.mjs` and `npm test` for the
matrix and database checks. Run typecheck/build and the documented release gates.
The event matrix varies ordering explicitly; repeated green deterministic runs
must never be presented as proof of real audio quality or model reliability.
Only an explicit yes after played readback may authorize a booking, and success
speech must follow verified durable CRM persistence. Staff transcript SMS remains
disabled until carrier approval and number registration are verified.
