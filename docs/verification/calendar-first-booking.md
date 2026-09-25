# Calendar-first consultation verification

Implementation branch: `codex/simple-consultation-booking` (isolated from the canonical dirty checkout).

Selected design: option 4, Bold availability. Available dates use solid black squares on the public site's platinum surface; the selected date uses a white fill and black outline. Times appear only after a day is chosen, with large serif labels in two columns and a one-hour subtitle. Change date returns to the calendar without clearing customer input. The confirmation layout remains unchanged.

## QA inventory

- Initial page and popup: calendar only before a day is chosen; compact heading; small logo; public-site black/white palette, Didot display type, Helvetica body, and square borders; no horizontal clipping at desktop, iPad, and 390px mobile.
- Selecting a day mounts its times below the calendar and automatically scrolls/focuses that region after render; reselecting a day scrolls again; background refreshes never move focus. Reduced-motion preferences disable animation.
- Date/month/time controls: published availability; no past-month navigation; empty month explanation; date/time selection reveals contact form.
- Contact: name, phone, address required; email optional; address autocomplete usable inside modal; manual address accepted and checked on blur.
- Optional project section: collapsed by default; selections and unknown count preserved; changing count never changes duration or time.
- Booking: exactly one submission button; fixed 60 minutes; date/time/address visible on success; no unsupported delivery claim.
- Failure handling: travel conflict, stale revision, provider outage/recovery, and retry preserve contact/optional answers; idempotency prevents duplicates.
- Accessibility: keyboard date/time/submit controls, native modal focus containment, Escape closes and restores trigger focus.
- Database: migrate isolated fixture first; old commercial/legacy policy still valid; marked residential counts may be null; route protections and atomic write retained.
- Concurrency: real PostgreSQL simultaneous overlapping bookings and same-key retry tests.

## Preview isolation

The local review preview uses an in-memory PGlite database with synthetic working ranges, simulated Places/Routes responses, and `BOOKING_DELIVERY_ENABLED=false`. It contains no production credentials. No real appointments or notifications are created. Production hours were inspected read-only on September 25: four upcoming published ranges, ending September 30; none in October.

## Release order

The user requested preview before a separate production publication step. Apply `20260925233000_calendar_first_consultations.sql` before releasing the frontend/API. The replacement retains the existing RPC signature, invoker security, grants, locking, route proofs, outbox, and legacy duration rules. The new duration marker is added by the server, never copied from an arbitrary request field. Rollback the app first if needed; the migration is backward-compatible and existing appointment records are not rewritten.

## Verified in the isolated preview

- Full suite before the design refinement: 9,158 tests passed; six real PostgreSQL concurrency tests passed.
- Calendar-only refinement: 73 focused UI/API/database/SEO tests passed. Calendar UI tests cover hidden initial times, day selection, scrolling/focus, repeated selection, no focus theft on refresh, empty months, and retained input after conflicts.
- Desktop 1440×1000, mobile 390×844, and tablet 820×1180 checked through the real page and popup controls. Calendar-only initial state and no horizontal clipping verified; page time selection scrolls its heading to the viewport. Popup times are brought into view within the dialog. Enter/Tab navigation, address suggestions inside the modal, and Escape/focus restoration checked.
- Two synthetic bookings completed through the browser, with external delivery suppressed: omitted optional answers stored null window count; 31+ windows stored 31. Both calendar event durations and CRM/confirmation metadata are 60 minutes. A travel conflict retained name, address, and window count while offering a valid alternative.
- Confirmation now receives focus and scrolls into view after submission so the collapsed form cannot leave mobile visitors below the success message.

No production migration, push, or deployment has been performed. The preview uses synthetic hours; the production scheduling decision for October remains separate.

## Final selected-design validation

- Final full suite: 726 files / 9,160 tests passed; five files / 29 tests skipped. Production build and standalone typecheck passed.
- Option 4 verified on desktop and mobile: solid-black available days, white outlined selected day, two-column large time controls, no initial time controls, and scroll/focus on date selection.
- Completed another synthetic mobile booking with all optional answers blank: exactly one lead, one job, one 60-minute event, and eight queued local outbox effects; no external delivery. Confirmation came into view with the correct date, time, address, and duration.
- Fixed the mobile Change date button width and made address suggestions open above the field when the visible viewport has insufficient room below; suggestions remain anchored during scrolling, keyboard viewport changes, and dialog use.
