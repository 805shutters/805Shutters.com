-- Accept the headers the CFO ledger webhook already checks.
-- Additive only: replace cfo_ledger.enqueue. No drops, no trigger edits,
-- no table edits, and no webhook URL or shared secret in this file.
-- Not applied to any database by the pull request that adds this file.
--
-- The previous function signed the body but sent x-ledger-secret and
-- x-ledger-signature. The receiver accepts Authorization: Bearer <secret>
-- or X-Hub-Signature-256: sha256=<hex HMAC of the raw body>.
-- Those two headers are added. Content-Type, x-ledger-secret, and
-- x-ledger-signature stay.
--
-- net.http_post stores convert_to(body::text, 'UTF8'). v_body is that same
-- p_payload::text, and the HMAC is over v_body, so the signed bytes and the
-- posted body are identical.

create or replace function cfo_ledger.enqueue(p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_url text;
  v_secret text;
  v_body text;
  v_sig text;
  v_headers jsonb;
begin
  begin
    select ds.decrypted_secret
      into v_url
    from vault.decrypted_secrets ds
    where ds.name = 'cfo_ledger_webhook_url'
    order by ds.updated_at desc nulls last, ds.created_at desc nulls last, ds.id desc
    limit 1;

    select ds.decrypted_secret
      into v_secret
    from vault.decrypted_secrets ds
    where ds.name = 'cfo_ledger_webhook_secret'
    order by ds.updated_at desc nulls last, ds.created_at desc nulls last, ds.id desc
    limit 1;

    if nullif(btrim(coalesce(v_url, '')), '') is null
       or nullif(btrim(coalesce(v_secret, '')), '') is null then
      return;
    end if;

    -- One text value. pg_net posts convert_to(p_payload::text, 'UTF8').
    v_body := p_payload::text;

    begin
      v_sig := encode(
        extensions.hmac(
          convert_to(v_body, 'utf8'),
          convert_to(v_secret, 'utf8'),
          'sha256'
        ),
        'hex'
      );
    exception
      when undefined_function or invalid_schema_name then
        v_sig := encode(
          public.hmac(
            convert_to(v_body, 'utf8'),
            convert_to(v_secret, 'utf8'),
            'sha256'
          ),
          'hex'
        );
    end;

    v_headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-ledger-secret', v_secret,
      'x-ledger-signature', v_sig,
      'X-Hub-Signature-256', 'sha256=' || v_sig,
      'Authorization', 'Bearer ' || v_secret
    );

    -- pg_net queues the request and returns. The HTTP call happens after commit.
    execute 'select net.http_post($1, $2, $3::jsonb, $4, $5)'
      using v_url, p_payload, '{}'::jsonb, v_headers, 5000;
  exception
    when undefined_table or invalid_schema_name then
      return;
    when others then
      raise warning 'cfo_ledger_enqueue_failed sqlstate=%', sqlstate;
  end;
end
$fn$;

comment on function cfo_ledger.enqueue(jsonb) is
  'Enqueue one ledger POST via net.http_post. URL and secret come from vault.decrypted_secrets (cfo_ledger_webhook_url, cfo_ledger_webhook_secret). Missing Vault or a missing value returns. Any other failure logs sqlstate and does not raise. HMAC-SHA256 covers the exact posted jsonb text. Headers: Content-Type, x-ledger-secret, x-ledger-signature, Authorization Bearer, and X-Hub-Signature-256 sha256=.';

revoke all on function cfo_ledger.enqueue(jsonb) from public;

do $revoke$
declare
  target text;
begin
  foreach target in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_catalog.pg_roles where rolname = target) then
      execute format('revoke all on function cfo_ledger.enqueue(jsonb) from %I', target);
    end if;
  end loop;
end
$revoke$;
