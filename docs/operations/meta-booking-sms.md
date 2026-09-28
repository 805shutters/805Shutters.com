# Meta booking-page owner SMS

`MetaBookingAlertTracking` posts a visible booking-page visit to `/api/meta-booking-alerts/` when the current link has Meta attribution, a Meta referrer, or a Meta in-app browser user agent. Current campaign links use `utm_source=facebook` for both placements, so ambiguous visits are labeled Facebook/Instagram. This measures a loaded booking page, not every ad click; blocked scripts, stripped attribution, or a page that never loads may not alert.

The SMS says: `805 Shutters: Someone opened the booking page from Facebook/Instagram. No appointment has been submitted yet.` It goes only to `MIKE_805_SALES_SMS_NUMBER` using the existing Twilio configuration. It does not create a lead or appointment. General Telegram visitor digests and completed-booking notifications remain separate.

Production only (`VERCEL_ENV=production`). Set `META_BOOKING_SMS_ENABLED=false` and redeploy to disable. Missing owner/SMS/database configuration fails closed. No new database schema or production credentials are needed.

A browser session lasts 30 minutes. A deterministic, keyed UUID claim in `crm_activity_events` prevents retries and refreshes from sending twice across server instances. A shared IP/minute claim and atomic numbered hourly claims cap sends at one per IP/minute and 120/hour. These limits may suppress separate visitors sharing an IP or exceptionally busy hours. IPs and click IDs are not stored. Failed/uncertain sends keep their claim and are never automatically retried.

Audit action: `meta_booking_sms`. `metadata` holds attribution and owner phone suffix. `after_data` records initial provider acceptance/failure and SID. Signed callbacks to `/api/webhooks/meta-booking-sms/` record intermediate delivery state in `metadata` and terminal state in `before_data`, separate from acceptance so late callbacks cannot erase delivery evidence. A reserved record without acceptance indicates suppression, interruption, or a pre-send database failure; it is not delivery proof.

Read-only verification:

```sql
select created_at, id, metadata, after_data, before_data
from public.crm_activity_events
where action = 'meta_booking_sms'
order by created_at desc limit 10;
```

An accepted/queued SID is not delivery confirmation. Confirm `before_data.delivery_status = 'delivered'` (carrier report), or inspect the exact Twilio Message resource. Only the recipient can confirm seeing it.

Implementation references: [Vercel IP headers](https://vercel.com/docs/headers/request-headers), [Twilio delivery callbacks](https://www.twilio.com/docs/messaging/guides/track-outbound-message-status).
