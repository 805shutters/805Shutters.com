# Forwarded pickup incident — October 31, 2026

The owner reported repeated failure answering forwarded 805 calls and requested immediate repair.

## Evidence and change
Live voice-805 v37 in dedicated project evuxqsaucmvgyuvjpqlo matched the October 27 release. At 09:53 Pacific the staff answer reached the handler, followed by an empty Gather result and premature staff-declined termination. At 09:51 a press of 1 accepted Mike and both carrier legs joined the same conference; this does not prove audible two-way audio.

An empty Gather now repeats the staff prompt while the original confirmation deadline permits. It no longer immediately treats silence as a decline. The default # finish key is disabled, keeping single-key confirmation explicit. Expiration is recorded as staff-confirmation-timeout. Staff still press 1; customers have no keypad requirement. Authentication, one winning staff member, conference routing and voicemail protection remain intact.

## Plan and verification
- Complete: signed-handler regression reproduces empty callback followed by successful Press 1. Focused 11 tests and current-main phone suite 178 passed.
- Complete: rebuilt 0abe6884 baseline matches live v37 apart from trailing newline. Narrow deployment candidate includes only the staff-pickup change, excluding unrelated newer unreleased phone changes.
- Complete: typecheck, production build, 10,700 application tests (36 skipped), and 175 tests on the actual live baseline plus patch. Current-main phone tests: 178 passed.
- Complete: deployed Edge v38 ACTIVE; full 158,255-character source readback exactly matches candidate. Health ready=true, staffAcceptance=dtmf, Mike/Jessica ring list preserved. Unsigned form callback rejected 401.
- In progress: source publication.
- Remaining: owner confirms they answer, hear the prompt, press 1, and still hear ringing. The empty-Gather repair is deployed but does not establish that this reported symptom is resolved. Twilio carrier request/audio diagnosis requires restoring the logged-out Chrome session; sign-in requested. Real handset/two-way audio remains unverified; no test call placed.

Local rollback and candidate bundles: artifacts/phone-incident/. No schema, secret, incoming destination, SMS or website change is needed.
