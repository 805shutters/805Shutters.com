# 805 CRM Supabase setup

The 805 CRM is built for a dedicated 805 Shutters Supabase project. Do not link it to the MTS Supabase project.

## Required environment

Create `.env.local` with the dedicated 805 project values:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<805-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<805-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<805-service-role-key>
CRM_ALLOWED_EMAILS=805shutters@gmail.com,hello@805shutters.com,805@805shutters.com,jessica@805shutters.com
CRM_ALLOWED_DOMAINS=805shutters.com
BOOKING_ALERT_WEBHOOK_URL=<optional-alert-webhook>
```

## Database

After linking the dedicated project:

```bash
npx supabase link --project-ref <805-project-ref>
npx supabase db push
```

This applies:

- `leads` and `lead_events` for website lead capture.
- `crm_profiles` for Google-authenticated CRM users.
- `crm_jobs` for the sales job organizer.
- `crm_quotes` and `crm_quote_items` for quote/bookkeeping work.
- `crm_quote_bookkeeping_entries` for the transferred bookkeeping spreadsheet rows.
- `crm_quote_bookkeeping_payments` for deposits, balance payments, and payment method tracking.
- `crm_quote_bookkeeping_credits` for credits moved between jobs.
- `crm_accountability_tasks` for durable job-management follow-up work.
- `crm_calendar_events` for sales calendar appointments.
- Public self-booking reads `crm_calendar_events` for unavailable slots and writes booked appointments through the server API.

The 805 bookkeeping ledger mirrors the MTS CRM spreadsheet fields:

- customer / quote
- sold date
- total
- deposit due
- deposit paid
- balance paid
- paid total
- credit in / credit out
- payment type
- COGS
- open balance
- Ken cut
- Mike profit
- sales owner
- installation invoice
- Jessica commission, paid, and owed
- manufacturer, order reference, order link, and document link
- notes and status

## Customer file transfer

Every bookkeeping customer is represented in the CRM as a customer file. The customer file view combines:

- customer contact details
- jobs and quote status
- bookkeeping row history
- products by room/window when quote line items exist
- manufacturer/order details
- contract links from quote share tokens
- uploaded manufacturer or installation document links when present
- notes and open balances

Before importing live MTS data, apply all migrations to the dedicated 805 project. Then add these values to `.env.local`:

```bash
MTS_SUPABASE_URL=<mts-project-url>
MTS_SUPABASE_SERVICE_ROLE_KEY=<mts-service-role-key>
MTS_805_ACCOUNT_ID=72ccf12a-11c0-4261-8ad0-31af8ad0bbfb
MTS_PUBLIC_QUOTE_BASE_URL=https://mtsinstallationsandrepairs.lovable.app/quote
```

Run a count-only dry run first:

```bash
node scripts/import_mts_bookkeeping_to_805.mjs --dry-run
```

Then run the import:

```bash
node scripts/import_mts_bookkeeping_to_805.mjs
```

The import is keyed by the original MTS ids, so it can be rerun without duplicating imported jobs, quotes, bookkeeping rows, products, or contracts.

## Google login

In the dedicated Supabase project, enable Google under Authentication providers.

Add these redirect URLs:

```text
http://127.0.0.1:3000/crm
http://localhost:3000/crm
https://www.805shutters.com/crm
```

The public site only exposes the CRM login block at the bottom of the homepage. The CRM itself lives at `/crm` and requires an allowed Google account.

## Public self-booking

The homepage button opens a date/time picker. Customers choose date and time first, then provide:

- name
- phone
- address
- number of windows
- optional email and notes

When the dedicated service-role key is present, `/api/booking` creates:

- a booked `leads` row
- a scheduled `crm_jobs` row
- a scheduled `crm_calendar_events` row

Unavailable dates and times are greyed out based on existing CRM calendar events. Sundays and past dates are not bookable by default.
