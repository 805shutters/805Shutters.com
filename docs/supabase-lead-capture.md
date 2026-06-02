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

The API stores the lead in Supabase and optionally forwards to
`LEAD_WEBHOOK_URL` if configured.

## Environment variables

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
LEAD_WEBHOOK_URL=
```

`SUPABASE_SERVICE_ROLE_KEY` must be set only in server environments, such as
Vercel environment variables. It must never be committed or exposed in client
components.

## Local verification

After linking or running local Supabase:

```bash
npx supabase db reset
npm run build
```

The seeded local row uses `805shutters@gmail.com` and is only for development
verification.
