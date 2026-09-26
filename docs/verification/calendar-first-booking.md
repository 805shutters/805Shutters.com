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

## Contact-step follow-up, September 25

- Time selection now immediately replaces the calendar/time chooser with Complete your booking and focuses the form. The selected appointment remains visible with Change date or time; changing the slot preserves customer and optional answers.
- Desktop and iPad show name, address, phone, and optional email on the left, with visible optional covering choices, window count, and notes on the right. Mobile stacks the same sections.
- Verified page and native popup at 1440×1000, 820×1180, and 390×844. The details heading is immediately visible after selection; no horizontal overflow. Keyboard order starts with name then address; Escape restores popup trigger focus.
- Seven focused UI tests pass, including retained optional answers across slot changes. Another isolated mobile booking with all optional fields blank created one additional lead, job, 60-minute event, and eight local outbox effects. A travel conflict preserved information and an alternative time booked successfully. External delivery stayed suppressed.

## September 26: customer details layout and appointment notes

- Adopted the selected layout: contact details left, optional covering buttons and window quantity buttons side by side on the right, and a shared booking footer. Smaller screens stack the sections.
- Added a visible, optional appointment-notes textarea with gate-code and parking guidance. Uses the existing notes payload and server processing; appointment duration and scheduling are unchanged.
- Focused UI coverage verifies multi-select coverings, a single quantity, notes retained through a failed request, and identical payload/idempotency key on retry.
- Browser checks covered desktop (1440), tablet (1024/768), mobile (390/320), the page and mobile popup, keyboard checkbox/radio controls, more-covering disclosure, and notes retained after changing time. No horizontal overflow or browser runtime errors. Local availability was supplied from a saved fixture because the isolated checkout has no scheduling credentials; live availability must be checked separately after release. No real booking was submitted.

## September 26: calendar-style day view

- Replaced the morning/afternoon time-button groups with a chronological day timeline, labeled hour/half-hour grid lines, and sage one-hour appointment blocks. The timeline covers the day's available openings, with blank gaps for unavailable times.
- Overlapping alternative start times occupy separate lanes; all available starts remain selectable, including exceptional published hours. Selecting an opening immediately focuses the existing details form, preserving optional answers and notes when changing the appointment.
- Focused tests cover chronological positions, one-hour end labels across noon, overlapping lanes including quarter-hour openings, unavailable gaps, failed-refresh disabling, and unchanged daypart badges on the month calendar.
- Browser checks passed at 1440, 1024, 768, 390, and 320px, including keyboard selection and the mobile popup. Local QA used isolated availability fixtures, produced no browser runtime errors, and submitted no real appointment. Live verification is performed separately after deployment.
