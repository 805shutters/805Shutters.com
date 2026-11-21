# Line-event wake

`public.wake_line_event_worker(text, uuid)` reads each maker's gate, worker URL, and bearer secret from Supabase Vault (`vault.decrypted_secrets`, column `decrypted_secret`, matched on `name`). When that secret row is absent, it uses the existing database setting (`current_setting`). The function is `SECURITY DEFINER` with a fixed empty `search_path`. `service_role` and `manufacturer_bot` can run the wake they already had; they are not granted Vault.

Hosted Supabase cannot turn this on with `ALTER DATABASE postgres SET line_event.*`. The `postgres` role is not a superuser, and that statement fails with `42501` permission denied.

The migration does not create these secrets and does not set any gate to `on`.

Lotus is not in this function. Do not create Lotus wake secrets for this change.

## Secret names

| Maker | Gate | URL | Bearer | Fallback settings |
| --- | --- | --- | --- | --- |
| Norman | `line_event_wake_http` | `line_event_worker_url` | `line_event_worker_secret` | `line_event.wake_http`, `line_event.worker_url`, `line_event.worker_secret` |
| Onyx | `line_event_onyx_wake_http` | `line_event_onyx_worker_url` | `line_event_onyx_worker_secret` | `line_event.onyx_wake_http`, `line_event.onyx_worker_url`, `line_event.onyx_worker_secret` |
| Sundance | `line_event_sundance_wake_http` | `line_event_sundance_worker_url` | `line_event_sundance_worker_secret` | `line_event.sundance_wake_http`, `line_event.sundance_worker_url`, `line_event.sundance_worker_secret` |

The gate value is exactly `on` or `off`. A present Vault row wins over `current_setting`, including when the Vault value is `off` or blank.

Create each name once. A second `vault.create_secret` with the same name adds another row. The wake reads the newest row (`updated_at`, then `created_at`, then `id`). Prefer `vault.update_secret` after the first create.

## Worker URL

Use the `www` host and the trailing slash:

- Norman: `https://www.805shutters.com/api/crm/norman-line-event-worker/`
- Onyx: `https://www.805shutters.com/api/crm/onyx-line-event-worker/`
- Sundance: `https://www.805shutters.com/api/crm/sundance-line-event-worker/`

The apex host (`https://805shutters.com/...`) answers with a 308 redirect. pg_net does not follow redirects, so a wake posted at the apex never reaches the worker. Keep the trailing slash for the same reason.

The URL must start with `https://`. Any other scheme is refused and nothing is posted.

The route still has its own flag and bearer env. This note does not set them.

- Norman: `NORMAN_LINE_EVENT_WAKE_ENABLED` and `NORMAN_LINE_EVENT_WORKER_SECRET`
- Onyx: `ONYX_LINE_EVENT_WAKE_ENABLED` and `ONYX_LINE_EVENT_WORKER_SECRET`
- Sundance: `SUNDANCE_LINE_EVENT_WAKE_ENABLED` and `SUNDANCE_LINE_EVENT_WORKER_SECRET`

Put the same bearer value in the Vault secret and in the route env.

## Turn on

Run this in the SQL editor as a role that can write Vault. Replace the bearer placeholders with the route's worker secret. Do not commit those values.

Norman:

```sql
select vault.create_secret(
  'on',
  'line_event_wake_http',
  'Norman line-event wake. Value is exactly on or off.'
);

select vault.create_secret(
  'https://www.805shutters.com/api/crm/norman-line-event-worker/',
  'line_event_worker_url',
  'Norman line-event worker URL.'
);

select vault.create_secret(
  '<NORMAN_LINE_EVENT_WORKER_SECRET>',
  'line_event_worker_secret',
  'Norman line-event worker bearer.'
);
```

Onyx:

```sql
select vault.create_secret(
  'on',
  'line_event_onyx_wake_http',
  'Onyx line-event wake. Value is exactly on or off.'
);

select vault.create_secret(
  'https://www.805shutters.com/api/crm/onyx-line-event-worker/',
  'line_event_onyx_worker_url',
  'Onyx line-event worker URL.'
);

select vault.create_secret(
  '<ONYX_LINE_EVENT_WORKER_SECRET>',
  'line_event_onyx_worker_secret',
  'Onyx line-event worker bearer.'
);
```

Sundance:

```sql
select vault.create_secret(
  'on',
  'line_event_sundance_wake_http',
  'Sundance line-event wake. Value is exactly on or off.'
);

select vault.create_secret(
  'https://www.805shutters.com/api/crm/sundance-line-event-worker/',
  'line_event_sundance_worker_url',
  'Sundance line-event worker URL.'
);

select vault.create_secret(
  '<SUNDANCE_LINE_EVENT_WORKER_SECRET>',
  'line_event_sundance_worker_secret',
  'Sundance line-event worker bearer.'
);
```

When the secret already exists, update that row instead of creating a second one:

```sql
select vault.update_secret(
  (select id from vault.secrets where name = 'line_event_wake_http'),
  'on',
  'line_event_wake_http',
  'Norman line-event wake. Value is exactly on or off.'
);
```

Use the same shape for the other eight names. List ids without decrypting them first if a name might already exist:

```sql
select id, name, updated_at
from vault.secrets
where name like 'line_event%'
order by name, updated_at desc;
```

## Roll back

Set that maker's gate secret to `off`. Leave the URL and bearer in place.

```sql
select vault.update_secret(
  (select id from vault.secrets where name = 'line_event_wake_http'),
  'off',
  'line_event_wake_http',
  'Norman line-event wake. Value is exactly on or off.'
);

select vault.update_secret(
  (select id from vault.secrets where name = 'line_event_onyx_wake_http'),
  'off',
  'line_event_onyx_wake_http',
  'Onyx line-event wake. Value is exactly on or off.'
);

select vault.update_secret(
  (select id from vault.secrets where name = 'line_event_sundance_wake_http'),
  'off',
  'line_event_sundance_wake_http',
  'Sundance line-event wake. Value is exactly on or off.'
);
```

`off` is not `on`, so the wake returns `wake_disabled` and does not post.
