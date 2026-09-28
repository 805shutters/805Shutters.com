# Meta completed-booking owner SMS

Only a successfully committed appointment attributed to Facebook, Instagram, or Meta queues `meta_booking_sms` in the existing `booking_outbox`. Page views, clicks, and rejected booking attempts do not send this alert. The former public `/api/meta-booking-alerts/` endpoint is retired with HTTP 410 and no send, including calls from cached old clients. The click-tracking component has been removed.

The message begins `805 Shutters: New appointment booked via Facebook/Instagram.` and includes the customer name, appointment date/time in Los Angeles time, phone, and address. It goes to `MIKE_805_SALES_SMS_NUMBER` using existing Twilio configuration. The general staff booking text excludes that number for Meta bookings to prevent duplicate owner alerts. Customer confirmations and other staff delivery remain intact.

Campaign UTMs, external referrer, Meta click ID, and in-app browser signals qualify the source. First-touch attribution carries through internal navigation. Current campaign links hardcode `utm_source=facebook` for both placements: without a more specific signal, the source is honestly labeled Facebook/Instagram. Attribution stripped by browsers cannot be recovered.

The booking transaction queues the effect atomically with the saved appointment. Booking idempotency and a durable appointment-specific claim prevent duplicate SMS on retries. The worker verifies that the appointment still exists with matching times, is future, and is not canceled before attempting SMS. Synthetic verification bookings suppress normal delivery effects. Failed or ambiguous provider calls are retained for review and never automatically resent.

Production only (`VERCEL_ENV=production`); existing booking delivery must be enabled. `META_BOOKING_SMS_ENABLED=false` disables this owner notification. No database migration or credential change is needed.

Audit action: `meta_booking_sms`. New `metadata.trigger=appointment_booked` distinguishes completed-booking notifications from historical click alerts; it also contains calendarEventId, source and owner phone suffix. `after_data` records initial provider acceptance and SID. Signed callbacks to `/api/webhooks/meta-booking-sms/` record terminal delivery in `before_data`. Provider acceptance is not proof of delivery.

```sql
select created_at, id, metadata, after_data, before_data
from public.crm_activity_events
where action = 'meta_booking_sms'
order by created_at desc limit 10;
```

# Daily Telegram report

The existing `.github/workflows/visitor-digest.yml` schedule remains daily at 02:00 UTC. Visits are queued, never texted. The digest lists Facebook, Instagram, and Facebook/Instagram (placement unknown), including zero counts. New visit records retain `utm_source` and classified source along with the existing sanitized referrer. Historical records are classified from their saved referrer; previously discarded campaign tags cannot be reconstructed. Existing Google, Yelp, and other sources remain in the report.
