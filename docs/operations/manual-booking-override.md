# Manual booking override

Staff can book a Jessica consultation that the 15-minute driving buffer or the route recheck would refuse. The override runs through the normal consultation commit, so the lead, job card, calendar event, draft quote, and Google Calendar sync are still created together.

Overlap, the four-appointment daily limit, published working hours, the Jessica assignment, and the ban on unguarded public inserts stay in force. A normal booking is unchanged. A flag placed in the public booking JSON, a blank who or why, or a missing flag does not open the exception.

The public form `POST /api/booking` rejects any of these fields: `manual_override`, `override_by`, `override_reason`.

## Call

Authenticated 805 CRM session, `POST /api/crm/booking/override`.

Monday, November 16, 2026, 9:00–10:00 AM Pacific, consultation, assigned to Jessica:

```http
POST /api/crm/booking/override
Authorization: Bearer <crm-access-token>
Content-Type: application/json

{
  "manual_override": true,
  "override_by": "Mike Shepard",
  "override_reason": "Owner ordered this consultation despite the route recheck.",
  "idempotencyKey": "7c2b1a4e-6f0d-4a1b-9c3e-1d5a8b2f4c60",
  "revision": "<revision from booking_schedule_snapshot for 2026-11>",
  "variant": "standard",
  "date": "2026-11-16",
  "time": "09:00",
  "name": "Steve Geldman",
  "phone": "<customer phone>",
  "address": "<service address>",
  "productTypes": ["Shutters"]
}
```

`manual_override` must be boolean `true`. `override_by` and `override_reason` must be non-blank. `revision` is the current `booking_schedule_snapshot` revision for `2026-11`. Use a new `idempotencyKey` for each distinct request. Phone and service address are required because this is the normal consultation booking. The server saves a 60-minute `sales_consult` for Jessica from 9:00 to 10:00 AM America/Los_Angeles, creates the job card, and queues Google Calendar sync with the other booking effects.

The route calls:

```sql
select public.booking_commit_manual_override(
  p_key := '<idempotency uuid>',
  p_hash := '<sha256 of the booking payload including who and why>',
  p_revision := '<booking_schedule_snapshot revision>',
  p_lead := '<lead jsonb>',
  p_job := '<job jsonb>',
  p_event := '<sales_consult jsonb, assigned to Jessica, 2026-11-16 09:00-10:00 America/Los_Angeles>',
  p_proofs := '<route proofs, or a fresh signature proof when driving time cannot be rechecked>',
  p_effects := '[{"kind":"google_calendar","payload":{}}, ...]',
  p_manual_override := true,
  p_override_by := 'Mike Shepard',
  p_override_reason := 'Owner ordered this consultation despite the route recheck.'
);
```

Each accepted override inserts one row in `booking_manual_override_log` (`event_id`, `override_by`, `override_reason`, `created_at`) in the same transaction as the job and calendar event.

Apply `supabase/migrations/20261112182519_manual_booking_protection_override.sql` before using the call. This document does not apply that migration.
