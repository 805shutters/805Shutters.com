# Supabase lead capture

The rebuild uses Supabase as the 805-owned lead database.

## Tables

Migration:

```text
supabase/migrations/20260602000000_create_lead_capture.sql
```

Tables:

- `public.leads`
- `public.lead_events`

RLS is enabled. Public anonymous clients cannot read or write lead data
directly. The Next.js API route inserts leads using the Supabase service-role
key on the server.

## API route

```text
POST /api/leads/
```

Required fields:

- `name`
- `phone`

Optional fields:

- `email`
- `city`
- `interest`
- `notes`
- `pagePath`
- UTM fields

The API stores the lead in Supabase, optionally forwards to `LEAD_WEBHOOK_URL`,
and can send a Meta Conversions API Lead event when Meta env vars are configured.

## Environment variables

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
LEAD_WEBHOOK_URL=
NEXT_PUBLIC_META_PIXEL_ID=
META_PIXEL_ID=
META_CAPI_ACCESS_TOKEN=
META_CAPI_TEST_EVENT_CODE=
```

`SUPABASE_SERVICE_ROLE_KEY` must be set only in server environments, such as
Vercel environment variables. It must never be committed or exposed in client
components.

`META_CAPI_ACCESS_TOKEN` must also remain server-only. `META_CAPI_TEST_EVENT_CODE`
is for Events Manager testing and should be removed for production traffic.

## Local verification

After linking or running local Supabase:

```bash
npx supabase db reset
npm run build
```

The seeded local row uses `805shutters@gmail.com` and is only for development
verification.
