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
BOOKING_EMAIL_FROM="805 Shutters <appointments@805shutters.com>"
BOOKING_EMAIL_REPLY_TO=805@805shutters.com
BOOKING_STAFF_EMAIL=805@805shutters.com
CRM_APPOINTMENT_ALERT_SMS_NUMBERS=<optional-comma-separated-admin-numbers>
JESSICA_805_SALES_SMS_NUMBER=<optional-jessica-sms-number>
MIKE_805_SALES_SMS_NUMBER=<optional-mike-sms-number>
CRM_SOLD_QUOTE_SMS_NUMBERS=805-806-9344
CRM_BOOKKEEPING_NOTE_SMS_NUMBERS=805-806-9344
TWILIO_ACCOUNT_SID=<twilio-account-sid>
TWILIO_AUTH_TOKEN=<twilio-auth-token>
TWILIO_FROM_PHONE=<twilio-from-number>
TWILIO_MESSAGING_SERVICE_SID=<optional-twilio-messaging-service>
RESEND_API_KEY=<resend-api-key>
GOOGLE_CALENDAR_ID=805@805shutters.com
GOOGLE_CALENDAR_TIME_ZONE=America/Los_Angeles
GOOGLE_CALENDAR_CLIENT_ID=<google-oauth-client-id>
GOOGLE_CALENDAR_CLIENT_SECRET=<google-oauth-client-secret>
GOOGLE_CALENDAR_REFRESH_TOKEN=<805-calendar-refresh-token>
INSTALLATION_INVOICE_MAILBOX=805@805shutters.com
INSTALLATION_INVOICE_GMAIL_QUERY='to:805@805shutters.com newer_than:30d (invoice OR "amount due" OR "balance due" OR "invoice total")'
INSTALLATION_INVOICE_GMAIL_MAX_RESULTS=50
INSTALLATION_INVOICE_CRON_SECRET=<optional-cron-secret>
GMAIL_805_CLIENT_ID=<google-oauth-client-id-with-gmail-readonly-scope>
GMAIL_805_CLIENT_SECRET=<google-oauth-client-secret>
GMAIL_805_REFRESH_TOKEN=<805-gmail-readonly-refresh-token>
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
- `crm_activity_events` for backend audit records when jobs, quotes, bookkeeping rows, and calendar events are created or updated.

## Backend readiness

The CRM backend runs through Next.js API routes under `/api/crm/*`. Browser code only sends the Supabase Google access token; the server verifies that token, checks the allow-list, and then uses the dedicated service-role key for database writes.

Use this local readiness check after adding environment values and migrations:

```bash
curl http://127.0.0.1:3000/api/crm/health/
```

The backend is ready when the response has:

- `authConfigured: true`
- `databaseConfigured: true`
- `googleProviderEnabled: true`
- `migrationsReady: true`
- `ready: true`

If `databaseConfigured` is false, `SUPABASE_SERVICE_ROLE_KEY` is missing or empty. Google login can start, but CRM data loading and booking writes will not work until the service-role key is present.

If `googleProviderEnabled` is false, the CRM login button will route back to `/crm?crmAuthError=google-provider-disabled` instead of sending the user to Supabase's raw validation error.

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
- Ken cut (with per-row override)
- job expenses
- net profit (Projected until final)
- Mike 50% / Jessica 50%
- sales owner
- installation invoice
- Jessica share paid and owed
- manufacturer, order reference, order link, and document link
- notes and status

## Profit rules

Implemented in `src/lib/crm/bookkeeping.ts` and covered by `npm test`:

- Net profit = sale total - COGS - Ken cut - installation invoice - job
  expenses (`crm_job_expenses` rows added via `POST /api/crm/expenses`).
- Every job's net profit splits 50/50 between Mike and Jessica, no matter who
  sold it. The assigned salesperson earns no extra commission; assignment is
  tracked for accountability and drives the Ken-cut exemption.
- Ken cut is 10% of the sale total. Jobs sold on or after 2026-06-10 that are
  assigned to Jessica are exempt. Rows sold before that date keep the
  historical 10% so imported sheet math never changes. `ken_cut_override` pins
  an explicit amount (use 0 to waive) when the default rule is wrong.
- Profit is "final" - and Jessica's 50% becomes owed - only once the
  installation invoice is settled (match status `matched`) and COGS is
  entered. Until then the ledger shows the row as Projected, though entered
  installation amounts are always deducted so projections are not overstated.
- Sold rows without a salesperson surface an "Assign salesperson" task in the
  accountability queue and a "Missing sales owner" count in totals.
- The bookkeeping totals strip mirrors the legacy MTS CRM cards: Total Sales,
  Open Balance, COGS, Installation, Ken Total Profit, Total Profit (gross,
  before Ken), Profit Margin, Net Profit (after Ken), Mike 50%, Jessica 50%,
  Jessica Paid, and Jessica Owed.

## Installation invoice email puller

MTS installation invoices should be sent to `805@805shutters.com`. The CRM can
pull that mailbox from the Bookkeeping tab or through the Vercel cron route at
`/api/cron/installation-invoices`.

The puller:

- searches the configured Gmail query for invoice-style messages;
- downloads PDF attachments from the Gmail message and extracts their text;
- extracts the customer full name from invoice text such as
  `Customer Name: ...`, and extracts the final invoice amount from the email
  body or invoice text;
- matches the customer name against sold bookkeeping rows and active sold
  quotes;
- writes the invoice amount into `installation_invoice_amount`, stores the
  Gmail URL, marks the install invoice as matched, and lets the existing profit
  rules recompute commissions;
- records every processed message in `crm_installation_invoice_emails`;
- leaves ambiguous names, missing amounts, job-only matches, and conflicting
  existing invoice amounts in `needs_review`.

Use this Gmail OAuth scope for `GMAIL_805_REFRESH_TOKEN`:

```text
https://www.googleapis.com/auth/gmail.readonly
```

Until `GMAIL_805_CLIENT_ID`, `GMAIL_805_CLIENT_SECRET`,
`GMAIL_805_REFRESH_TOKEN`, and `SUPABASE_SERVICE_ROLE_KEY` are populated
locally/Vercel-side, the puller can be deployed but cannot read the 805 mailbox
or write production matches.

## Importing the MTS CRM data

All numbers from the MTS CRM (mtsinstallationsandrepairs.lovable.app) migrate
into this backend with `scripts/import_mts_bookkeeping_to_805.mjs`. It needs
`.env.local` with `MTS_SUPABASE_URL`, `MTS_SUPABASE_SERVICE_ROLE_KEY`,
`NEXT_PUBLIC_SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`.

```bash
node scripts/import_mts_bookkeeping_to_805.mjs --dry-run   # row counts only
node scripts/import_mts_bookkeeping_to_805.mjs             # import + verify report
node scripts/import_mts_bookkeeping_to_805.mjs --verify    # compare without writing
```

The import is idempotent (rows carry `external_source`/`external_id` keys, so
re-runs update instead of duplicating). After importing - and any time the
sites look out of sync - run `--verify`: it totals both databases with the
same ledger rules as the CRM and prints a metric-by-metric MTS vs 805 table
(Total Sales, Open Balance, COGS, Installation, Ken, Total Profit, Net
Profit, rows missing COGS) with deltas, so a mismatch points at exactly what
is missing.

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
CONTRACT_PUBLIC_QUOTE_BASE_URL=https://www.805shutters.com/quote
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
Contract links are written to the new 805 quote route when a share token exists. To repoint already-imported contract rows without rereading MTS, run:

```bash
node scripts/import_mts_bookkeeping_to_805.mjs --repair-contract-urls
```

To create CRM job cards for already-imported bookkeeping rows that are missing a linked `crm_jobs` row, run:

```bash
node scripts/import_mts_bookkeeping_to_805.mjs --repair-entry-jobs
```

## Google login

In the dedicated Supabase project, enable Google under Authentication providers. The current 805 project URL is:

```text
https://evuxqsaucmvgyuvjpqlo.supabase.co
```

In Google Cloud, create an OAuth client for the Supabase callback URL:

```text
https://evuxqsaucmvgyuvjpqlo.supabase.co/auth/v1/callback
```

Then paste that Google client ID and client secret into Supabase Auth > Providers > Google and enable the provider.

Add these redirect URLs:

```text
https://www.805shutters.com/crm
https://805-one.vercel.app/crm
http://127.0.0.1:3000/crm
http://localhost:3000/crm
```

Set the Supabase Auth Site URL to:

```text
https://www.805shutters.com
```

After enabling Google, confirm the hosted provider is active:

```bash
curl http://127.0.0.1:3000/api/crm/health/
```

The response should show `googleProviderEnabled: true`.

The public site only exposes the CRM login block at the bottom of the homepage. The CRM itself lives at `/crm` and requires an allowed Google account.

## Google Calendar sync

When `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, and `GOOGLE_CALENDAR_REFRESH_TOKEN` are set, new website self-bookings and CRM-created calendar appointments are also created in the Google Calendar configured by `GOOGLE_CALENDAR_ID`.

Use the Google OAuth scope:

```text
https://www.googleapis.com/auth/calendar.events
```

Recommended calendar target:

```text
805@805shutters.com
```

The CRM stores the created Google event id and HTML link in `crm_calendar_events.meta` as `googleCalendarEventId` and `googleCalendarHtmlLink`. Google Calendar sync is intentionally non-blocking: if Google credentials are missing or the Calendar API rejects a request, the website booking and CRM event still save in Supabase and the sync outcome is recorded in CRM activity metadata.

## Public self-booking

The homepage button opens a date/time picker. Customers choose date and time first, then provide:

- name
- phone
- address
- number of windows
- optional email, product interest, and notes

When the dedicated service-role key is present, `/api/booking` creates:

- a booked `leads` row
- a scheduled `crm_jobs` row
- a scheduled `crm_calendar_events` row

After the CRM calendar event is saved, `/api/booking` attempts customer SMS confirmation when Twilio is configured, customer email confirmation when an email is supplied and Resend is configured, a staff email to `805@805shutters.com`, staff texts to Jessica and Mike, and the optional booking webhook alert. Notification failures are logged but do not cancel a successfully saved booking.

Unavailable dates and times are greyed out based on existing CRM calendar events. Sundays and past dates are not bookable by default.
