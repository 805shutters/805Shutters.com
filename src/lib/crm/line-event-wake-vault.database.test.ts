import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/20261122060000_line_event_wake_vault.sql";
const migration = readFileSync(migrationPath, "utf8");
const db = new PGlite();
const id = (n: number) => `61000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

type Json = Record<string, unknown>;

type Maker = {
  manufacturer: "norman" | "onyx" | "sundance";
  gate: string;
  urlName: string;
  secretName: string;
  settingGate: string;
  settingUrl: string;
  settingSecret: string;
  url: string;
};

const makers: Maker[] = [
  {
    manufacturer: "norman",
    gate: "line_event_wake_http",
    urlName: "line_event_worker_url",
    secretName: "line_event_worker_secret",
    settingGate: "line_event.wake_http",
    settingUrl: "line_event.worker_url",
    settingSecret: "line_event.worker_secret",
    url: "https://www.805shutters.com/api/crm/norman-line-event-worker/",
  },
  {
    manufacturer: "onyx",
    gate: "line_event_onyx_wake_http",
    urlName: "line_event_onyx_worker_url",
    secretName: "line_event_onyx_worker_secret",
    settingGate: "line_event.onyx_wake_http",
    settingUrl: "line_event.onyx_worker_url",
    settingSecret: "line_event.onyx_worker_secret",
    url: "https://www.805shutters.com/api/crm/onyx-line-event-worker/",
  },
  {
    manufacturer: "sundance",
    gate: "line_event_sundance_wake_http",
    urlName: "line_event_sundance_worker_url",
    secretName: "line_event_sundance_worker_secret",
    settingGate: "line_event.sundance_wake_http",
    settingUrl: "line_event.sundance_worker_url",
    settingSecret: "line_event.sundance_worker_secret",
    url: "https://www.805shutters.com/api/crm/sundance-line-event-worker/",
  },
];

const settings = makers.flatMap((maker) => [maker.settingGate, maker.settingUrl, maker.settingSecret]);
let line = 1;

async function call<T>(sql: string, params: unknown[] = []) {
  const result = await db.query<{ result: T }>(sql, params);
  return result.rows[0].result;
}

function wake(manufacturer: string, eventId: string) {
  return call<Json>("select public.wake_line_event_worker($1, $2::uuid) as result", [manufacturer, eventId]);
}

async function enqueue(manufacturer: string) {
  const lineId = id(line++);
  const queued = await call<Json>(
    "select public.enqueue_line_event($1::uuid, 1, $2, '{\"room\":\"Living\"}'::jsonb) as result",
    [lineId, manufacturer],
  );
  return String(queued.event_id);
}

async function clearSettings() {
  for (const name of settings) {
    await db.query("select set_config($1, '', false)", [name]);
  }
}

async function clearVault() {
  await db.exec("delete from vault.secrets");
}

async function clearHttp() {
  await db.exec("delete from net.http_calls");
}

async function createSecret(value: string, name: string) {
  const row = await db.query<{ id: string }>(
    "select vault.create_secret($1, $2, $3) as id",
    [value, name, `${name} test`],
  );
  return row.rows[0].id;
}

async function httpCalls() {
  const rows = await db.query<{
    url: string;
    body: Json;
    params: Json;
    headers: Json;
    timeout_milliseconds: number;
  }>("select url, body, params, headers, timeout_milliseconds from net.http_calls order by id");
  return rows.rows;
}

beforeAll(async () => {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
  `);
  await db.exec(readFileSync("supabase/migrations/20261121223000_line_event_queue.sql", "utf8"));
  await db.exec(migration);
  await db.exec(`
    create schema if not exists net;
    create table net.http_calls (
      id bigint generated always as identity primary key,
      url text,
      body jsonb,
      params jsonb,
      headers jsonb,
      timeout_milliseconds integer
    );
    create function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer)
    returns bigint
    language plpgsql
    as $http$
    declare
      v_id bigint;
    begin
      insert into net.http_calls (url, body, params, headers, timeout_milliseconds)
      values (url, body, params, headers, timeout_milliseconds)
      returning id into v_id;
      return v_id;
    end
    $http$;

    create schema if not exists vault;
    create table vault.secrets (
      id uuid primary key default gen_random_uuid(),
      name text,
      description text not null default '',
      secret text,
      decrypted_secret text,
      key_id uuid,
      nonce bytea,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create view vault.decrypted_secrets as
      select id, name, description, secret, decrypted_secret, key_id, nonce, created_at, updated_at
      from vault.secrets;
    create function vault.create_secret(
      new_secret text,
      new_name text default null,
      new_description text default '',
      new_key_id uuid default null
    ) returns uuid
    language plpgsql
    as $vault$
    declare
      v_id uuid;
    begin
      insert into vault.secrets (name, description, secret, decrypted_secret, key_id)
      values (new_name, new_description, new_secret, new_secret, new_key_id)
      returning id into v_id;
      return v_id;
    end
    $vault$;
    create function vault.update_secret(
      secret_id uuid,
      new_secret text default null,
      new_name text default null,
      new_description text default null,
      new_key_id uuid default null
    ) returns void
    language plpgsql
    as $vault$
    begin
      update vault.secrets
      set secret = coalesce(new_secret, secret),
          decrypted_secret = coalesce(new_secret, decrypted_secret),
          name = coalesce(new_name, name),
          description = coalesce(new_description, description),
          key_id = coalesce(new_key_id, key_id),
          updated_at = clock_timestamp()
      where id = secret_id;
      if not found then
        raise exception 'secret % not found', secret_id;
      end if;
    end
    $vault$;
    revoke all on schema vault from public, anon, authenticated, service_role, manufacturer_bot;
    revoke all on table vault.secrets from public, anon, authenticated, service_role, manufacturer_bot;
    revoke all on table vault.decrypted_secrets from public, anon, authenticated, service_role, manufacturer_bot;
  `);
});

afterAll(() => db.close());

describe("line-event wake vault", () => {
  it("keeps the migration additive and does not create secrets", () => {
    const executable = migration.replace(/--.*$/gm, "");
    expect(executable).not.toMatch(/\bdrop\b/i);
    expect(executable).not.toMatch(/\btruncate\b/i);
    expect(executable).not.toMatch(/\bdelete\s+from\b/i);
    expect(executable).not.toMatch(/\bcron\b/i);
    expect(executable).not.toMatch(/vault\.create_secret|vault\.update_secret/i);
    expect(executable).not.toMatch(/alter\s+database/i);
    expect(executable).not.toContain("line_event_lotus_");
    expect(executable).not.toContain("line_event.lotus_");
    expect(executable).toContain("security definer");
    expect(executable).toContain("set search_path = ''");
    expect(executable).toContain("vault.decrypted_secrets");
    expect(executable).toContain("v_enabled is distinct from 'on'");
    expect(executable).toContain("v_url !~ '^https://'");
    expect(executable).toContain("execute 'select net.http_post($1, $2, $3::jsonb, $4, $5)'");
    expect(executable).toContain("using v_url, v_body, '{}'::jsonb, v_headers, 5000");
    for (const maker of makers) {
      expect(executable).toContain(maker.gate);
      expect(executable).toContain(maker.urlName);
      expect(executable).toContain(maker.secretName);
      expect(executable).toContain(maker.settingGate);
    }
  });

  it("returns wake_disabled for every maker when no secrets are set", async () => {
    await clearVault();
    await clearSettings();
    await clearHttp();
    for (const manufacturer of ["norman", "onyx", "sundance", "lotus"]) {
      const eventId = await enqueue(manufacturer);
      const result = await wake(manufacturer, eventId);
      expect(result).toMatchObject({
        woken: false,
        reason: "wake_disabled",
        manufacturer,
        event_id: eventId,
        schema: "805-line-event/v1",
      });
    }
    expect(await httpCalls()).toEqual([]);
  });

  it("posts from Vault when the gate is on, then rolls the request back", async () => {
    await clearVault();
    await clearSettings();
    await clearHttp();
    const events = new Map<string, string>();
    for (const maker of makers) {
      events.set(maker.manufacturer, await enqueue(maker.manufacturer));
      await createSecret("on", maker.gate);
      await createSecret(maker.url, maker.urlName);
      await createSecret(`vault-secret-${maker.manufacturer}`, maker.secretName);
    }

    await db.exec("begin");
    try {
      for (const maker of makers) {
        const eventId = events.get(maker.manufacturer)!;
        const result = await wake(maker.manufacturer, eventId);
        expect(result).toEqual({
          woken: true,
          reason: "http",
          manufacturer: maker.manufacturer,
          event_id: eventId,
          schema: "805-line-event/v1",
        });
        expect(JSON.stringify(result)).not.toContain(`vault-secret-${maker.manufacturer}`);
      }
      expect(await httpCalls()).toEqual(makers.map((maker) => ({
        url: maker.url,
        body: {
          manufacturer: maker.manufacturer,
          event_id: events.get(maker.manufacturer),
          idempotency_key: expect.any(String),
        },
        params: {},
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer vault-secret-${maker.manufacturer}`,
        },
        timeout_milliseconds: 5000,
      })));
      const keys = await db.query<{ idempotency_key: string; id: string }>(
        "select id::text, idempotency_key from line_event.events where id = any($1::uuid[])",
        [makers.map((maker) => events.get(maker.manufacturer))],
      );
      const keyById = new Map(keys.rows.map((row) => [row.id, row.idempotency_key]));
      const posted = await httpCalls();
      for (const maker of makers) {
        const eventId = events.get(maker.manufacturer)!;
        expect(posted.find((row) => row.url === maker.url)?.body).toEqual({
          manufacturer: maker.manufacturer,
          event_id: eventId,
          idempotency_key: keyById.get(eventId),
        });
      }
    } finally {
      await db.exec("rollback");
    }

    expect(await httpCalls()).toEqual([]);
  });

  it("lets the Vault value win over current_setting", async () => {
    await clearVault();
    await clearSettings();
    await clearHttp();
    for (const maker of makers) {
      const eventId = await enqueue(maker.manufacturer);
      await db.query("select set_config($1, 'off', false)", [maker.settingGate]);
      await db.query("select set_config($1, 'https://settings.example/wrong/', false)", [maker.settingUrl]);
      await db.query("select set_config($1, 'setting-secret', false)", [maker.settingSecret]);
      await createSecret("on", maker.gate);
      await createSecret(maker.url, maker.urlName);
      await createSecret(`vault-secret-${maker.manufacturer}`, maker.secretName);

      const posted = await wake(maker.manufacturer, eventId);
      expect(posted).toMatchObject({ woken: true, reason: "http", manufacturer: maker.manufacturer });
      const calls = await httpCalls();
      expect(calls.at(-1)).toMatchObject({
        url: maker.url,
        headers: { Authorization: `Bearer vault-secret-${maker.manufacturer}` },
      });
      expect(calls.at(-1)?.url).not.toBe("https://settings.example/wrong/");

      const gateId = await db.query<{ id: string }>(
        "select id::text from vault.secrets where name = $1",
        [maker.gate],
      );
      await db.query("select vault.update_secret($1::uuid, 'off', $2, $3)", [
        gateId.rows[0].id,
        maker.gate,
        "rolled back in the test",
      ]);
      await db.query("select set_config($1, 'on', false)", [maker.settingGate]);
      const disabled = await wake(maker.manufacturer, eventId);
      expect(disabled).toMatchObject({ woken: false, reason: "wake_disabled", manufacturer: maker.manufacturer });
      expect(await httpCalls()).toHaveLength(calls.length);
    }
  });

  it("refuses a non-https URL from Vault", async () => {
    await clearVault();
    await clearSettings();
    await clearHttp();
    for (const maker of makers) {
      const eventId = await enqueue(maker.manufacturer);
      await createSecret("on", maker.gate);
      await createSecret(maker.url.replace("https://", "http://"), maker.urlName);
      await createSecret(`vault-secret-${maker.manufacturer}`, maker.secretName);
      await db.query("select set_config($1, 'on', false)", [maker.settingGate]);
      await db.query("select set_config($1, $2, false)", [maker.settingUrl, maker.url]);
      await db.query("select set_config($1, 'setting-secret', false)", [maker.settingSecret]);

      const refused = await wake(maker.manufacturer, eventId);
      expect(refused).toMatchObject({
        woken: false,
        reason: "wake_unconfigured",
        manufacturer: maker.manufacturer,
        event_id: eventId,
        schema: "805-line-event/v1",
      });
    }
    expect(await httpCalls()).toEqual([]);
  });

  it("falls back to current_setting when the Vault secret is absent", async () => {
    await clearVault();
    await clearSettings();
    await clearHttp();
    for (const maker of makers) {
      const eventId = await enqueue(maker.manufacturer);
      await db.query("select set_config($1, 'on', false)", [maker.settingGate]);
      await db.query("select set_config($1, $2, false)", [maker.settingUrl, maker.url]);
      await db.query("select set_config($1, $2, false)", [maker.settingSecret, `setting-secret-${maker.manufacturer}`]);
      const posted = await wake(maker.manufacturer, eventId);
      expect(posted).toMatchObject({ woken: true, reason: "http", manufacturer: maker.manufacturer });
      expect((await httpCalls()).at(-1)).toMatchObject({
        url: maker.url,
        headers: { Authorization: `Bearer setting-secret-${maker.manufacturer}` },
        timeout_milliseconds: 5000,
      });
      await clearSettings();
    }
  });

  it("falls back to current_setting when Vault is not installed", async () => {
    await clearSettings();
    await clearHttp();
    const eventId = await enqueue("norman");
    await db.exec("drop schema vault cascade");
    try {
      await db.query("select set_config('line_event.wake_http', 'on', false)");
      await db.query("select set_config('line_event.worker_url', 'https://www.805shutters.com/api/crm/norman-line-event-worker/', false)");
      await db.query("select set_config('line_event.worker_secret', 'setting-secret-norman', false)");
      const posted = await wake("norman", eventId);
      expect(posted).toMatchObject({ woken: true, reason: "http", manufacturer: "norman" });
      expect(await httpCalls()).toHaveLength(1);
    } finally {
      await db.exec(`
        create schema vault;
        create table vault.secrets (
          id uuid primary key default gen_random_uuid(),
          name text,
          description text not null default '',
          secret text,
          decrypted_secret text,
          key_id uuid,
          nonce bytea,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        );
        create view vault.decrypted_secrets as
          select id, name, description, secret, decrypted_secret, key_id, nonce, created_at, updated_at
          from vault.secrets;
        create function vault.create_secret(
          new_secret text,
          new_name text default null,
          new_description text default '',
          new_key_id uuid default null
        ) returns uuid
        language plpgsql
        as $vault$
        declare
          v_id uuid;
        begin
          insert into vault.secrets (name, description, secret, decrypted_secret, key_id)
          values (new_name, new_description, new_secret, new_secret, new_key_id)
          returning id into v_id;
          return v_id;
        end
        $vault$;
        create function vault.update_secret(
          secret_id uuid,
          new_secret text default null,
          new_name text default null,
          new_description text default null,
          new_key_id uuid default null
        ) returns void
        language plpgsql
        as $vault$
        begin
          update vault.secrets
          set secret = coalesce(new_secret, secret),
              decrypted_secret = coalesce(new_secret, decrypted_secret),
              name = coalesce(new_name, name),
              description = coalesce(new_description, description),
              key_id = coalesce(new_key_id, key_id),
              updated_at = clock_timestamp()
          where id = secret_id;
          if not found then
            raise exception 'secret % not found', secret_id;
          end if;
        end
        $vault$;
        revoke all on schema vault from public, anon, authenticated, service_role, manufacturer_bot;
        revoke all on table vault.secrets from public, anon, authenticated, service_role, manufacturer_bot;
        revoke all on table vault.decrypted_secrets from public, anon, authenticated, service_role, manufacturer_bot;
      `);
      await clearSettings();
    }
  });

  it("keeps Vault closed to service_role and manufacturer_bot", async () => {
    await clearVault();
    await clearSettings();
    await clearHttp();
    const eventId = await enqueue("norman");
    await createSecret("on", "line_event_wake_http");
    await createSecret("https://www.805shutters.com/api/crm/norman-line-event-worker/", "line_event_worker_url");
    await createSecret("vault-secret-norman", "line_event_worker_secret");

    const locked = await db.query<{
      prosecdef: boolean;
      proconfig: string[] | null;
    }>(`
      select prosecdef, proconfig
      from pg_proc
      where oid = 'public.wake_line_event_worker(text, uuid)'::regprocedure
    `);
    expect(locked.rows[0].prosecdef).toBe(true);
    expect(locked.rows[0].proconfig).toEqual(["search_path=\"\""]);
    const helper = await db.query<{ prosecdef: boolean; proconfig: string[] | null }>(`
      select prosecdef, proconfig
      from pg_proc
      where oid = 'line_event.wake_setting(text, text)'::regprocedure
    `);
    expect(helper.rows[0].prosecdef).toBe(true);
    expect(helper.rows[0].proconfig).toEqual(["search_path=\"\""]);

    const privileges = await db.query<{ who: string; fn: string; ok: boolean }>(`
      select who, fn, has_function_privilege(who, fn, 'execute') as ok
      from (values
        ('service_role', 'public.wake_line_event_worker(text, uuid)'),
        ('manufacturer_bot', 'public.wake_line_event_worker(text, uuid)'),
        ('service_role', 'line_event.wake_setting(text, text)'),
        ('manufacturer_bot', 'line_event.wake_setting(text, text)'),
        ('anon', 'line_event.wake_setting(text, text)'),
        ('authenticated', 'line_event.wake_setting(text, text)')
      ) as grants(who, fn)
    `);
    const privilege = Object.fromEntries(privileges.rows.map((row) => [`${row.who} ${row.fn}`, row.ok]));
    expect(privilege["service_role public.wake_line_event_worker(text, uuid)"]).toBe(true);
    expect(privilege["manufacturer_bot public.wake_line_event_worker(text, uuid)"]).toBe(false);
    expect(privilege["service_role line_event.wake_setting(text, text)"]).toBe(false);
    expect(privilege["manufacturer_bot line_event.wake_setting(text, text)"]).toBe(false);
    expect(privilege["anon line_event.wake_setting(text, text)"]).toBe(false);
    expect(privilege["authenticated line_event.wake_setting(text, text)"]).toBe(false);

    const vaultSelect = await db.query<{ who: string; ok: boolean }>(`
      select who, has_table_privilege(who, 'vault.decrypted_secrets', 'select') as ok
      from (values ('service_role'), ('manufacturer_bot'), ('anon'), ('authenticated')) as roles(who)
    `);
    for (const row of vaultSelect.rows) expect(row.ok).toBe(false);

    await db.exec("set role service_role");
    try {
      const posted = await wake("norman", eventId);
      expect(posted).toMatchObject({ woken: true, reason: "http", manufacturer: "norman" });
      await expect(db.query("select decrypted_secret from vault.decrypted_secrets")).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("reset role");
    }

    await clearHttp();
    await db.exec("set role manufacturer_bot");
    try {
      await expect(wake("norman", eventId)).rejects.toThrow(/permission denied/);
      await expect(db.query("select decrypted_secret from vault.decrypted_secrets")).rejects.toThrow(/permission denied/);
      const queued = await call<Json>(
        "select public.enqueue_line_event($1::uuid, 1, 'norman', '{\"room\":\"Bot\"}'::jsonb) as result",
        [id(line++)],
      );
      expect(queued.wake).toMatchObject({ woken: true, reason: "http", manufacturer: "norman" });
      expect(JSON.stringify(queued.wake)).not.toContain("vault-secret-norman");
    } finally {
      await db.exec("reset role");
    }
    const calls = await httpCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      url: "https://www.805shutters.com/api/crm/norman-line-event-worker/",
      headers: { Authorization: "Bearer vault-secret-norman" },
      timeout_milliseconds: 5000,
    });
  });
});
