# Calendar availability production repair

The CRM was returning HTTP 503 because production lacked `booking_schedule_snapshot`. The earlier UI release correctly exposed the failure but could not restore availability without the missing database migration.

## Database repair and safety review

Verified project: `evuxqsaucmvgyuvjpqlo` (805 Shutters). Installed the existing `20260906145749_jessica_booking_authority` migration after its pure calendar-date helper prerequisites. The helper repair deliberately excludes the unrelated legacy mirror/backfill. Recorded the applied migrations in the Supabase ledger and reloaded the API schema cache.

A second defect was an expired legacy appointment whose end time preceded its start. Its null canonical end blocked every future booking date. The corrective view excludes only malformed legacy commitments on expired local dates. Source appointments remain untouched; malformed current/future appointments still block scheduling. Both mirrored and unmirrored legacy paths are covered.

Rehearsed each change inside a rollback transaction before applying. Verified service-role RPC access, denied anonymous RPC access, persistent booking-table RLS, and unchanged appointment fingerprint across installation. No customer bookings or outbound messages were created. The historical appointment remains stored unchanged.

The authority migration converted old open-time buttons to drafts. Reviewed all saved September hours and restored their exact union through the authenticated CRM: 166 overlapping buttons became 19 continuous published ranges, preserving gaps and days off. The live editor confirms publication.

## Validation

- TypeScript check, full suite (3,278 passed, 32 skipped), production build.
- Real PostgreSQL suite: five passed, including concurrent publication/booking safeguards and the new expired-legacy regression.
- Live SQL snapshot: 16 September commitments, no malformed future commitments, original historical source row preserved.
- Live CRM working-hours editor loads and confirms published ranges.

Main push and Vercel deployment evidence are reported separately by the release workflow.
