import { readFileSync } from "node:fs";
import { Client } from "pg";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/20261121223000_line_event_queue.sql";
const migration = readFileSync(migrationPath, "utf8");
const db = new PGlite();
const id = (n: number) => `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

type Wake = {
  woken: boolean;
  reason: string;
  manufacturer: string;
  event_id: string;
  schema: string;
};

type LineEvent = {
  schema: string;
  duplicate: boolean;
  event_id: string;
  line_id: string;
  line_version: number | string;
  manufacturer: string;
  from_state: string;
  to_state: string;
  idempotency_key: string;
  payload: Record<string, unknown>;
  state: string;
  block_reason: string | null;
  cancel_reason: string | null;
  claimed_by: string | null;
  claimed_at: string | null;
  completed_at: string | null;
  wake: Wake | null;
};

function event(value: LineEvent | string): LineEvent {
  return typeof value === "string" ? JSON.parse(value) as LineEvent : value;
}

async function call<T>(sql: string, params: unknown[] = []) {
  const result = await db.query<{ result: T }>(sql, params);
  return result.rows[0].result;
}

function enqueue(line: number, version: number, manufacturer: string, payload: Record<string, unknown> = { room: "Living" }) {
  return call<LineEvent | string>(
    "select public.enqueue_line_event($1::uuid, $2::bigint, $3, $4::jsonb) as result",
    [id(line), version, manufacturer, JSON.stringify(payload)],
  ).then(event);
}

function claim(manufacturer: string, claimedBy?: string) {
  return call<LineEvent | string | null>(
    "select public.claim_next_line_event($1, $2) as result",
    [manufacturer, claimedBy ?? null],
  ).then((value) => value == null ? null : event(value));
}

beforeAll(async () => {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
  `);
  await db.exec(migration);
});

afterAll(() => db.close());

describe("line-event queue", () => {
  it("rejects an invalid transition", async () => {
    const queued = await enqueue(1, 1, "norman");
    expect(queued.state).toBe("queued");
    await expect(call(
      "select public.complete_line_event($1::uuid, 'norman', 'priced') as result",
      [queued.event_id],
    )).rejects.toThrow(/complete requires the claimer/);
    const claimed = await claim("norman");
    expect(claimed?.state).toBe("entering");
    await expect(call(
      "select public.complete_line_event($1::uuid, 'norman', 'priced') as result",
      [queued.event_id],
    )).rejects.toThrow(/invalid line transition from entering to priced/);
    await expect(call(
      "select public.block_line_event($1::uuid, 'norman', 'removed', 'cancelled') as result",
      [queued.event_id],
    )).rejects.toThrow(/invalid line transition from entering to cancelled/);
    const entered = event(await call<LineEvent | string>(
      "select public.complete_line_event($1::uuid, 'norman', 'entered') as result",
      [queued.event_id],
    ));
    expect(entered.state).toBe("entered");
    await expect(enqueue(1, 2, "norman")).rejects.toThrow(/invalid line transition from entered to queued/);
    await expect(call(
      "select public.enqueue_line_event($1::uuid, 1, 'mts', '{}'::jsonb) as result",
      [id(9)],
    )).rejects.toThrow(/manufacturer must be norman, onyx, sundance, or lotus/);
  });

  it("requires a reason to block or cancel", async () => {
    const queued = await enqueue(2, 1, "onyx");
    await expect(call(
      "select public.block_line_event($1::uuid, 'onyx', '   ') as result",
      [queued.event_id],
    )).rejects.toThrow(/blocked requires a reason/);
    const cancelled = event(await call<LineEvent | string>(
      "select public.block_line_event($1::uuid, 'onyx', ' customer removed the window ', 'cancelled') as result",
      [queued.event_id],
    ));
    expect(cancelled.state).toBe("cancelled");
    expect(cancelled.cancel_reason).toBe("customer removed the window");
    expect(cancelled.completed_at).toBeTruthy();
    expect(cancelled.claimed_at).toBeNull();
    await expect(enqueue(2, 2, "onyx")).rejects.toThrow(/invalid line transition from cancelled to queued/);

    const next = await enqueue(3, 1, "sundance");
    await claim("sundance", "sundance-worker");
    await expect(call(
      "select public.block_line_event($1::uuid, 'sundance', 'login failed', 'blocked', 'other-worker') as result",
      [next.event_id],
    )).rejects.toThrow(/claimed_by does not match this event/);
    const blocked = event(await call<LineEvent | string>(
      "select public.block_line_event($1::uuid, 'sundance', ' portal login failed ', 'blocked', 'sundance-worker') as result",
      [next.event_id],
    ));
    expect(blocked.state).toBe("blocked");
    expect(blocked.block_reason).toBe("portal login failed");
    expect(blocked.cancel_reason).toBeNull();
  });

  it("treats a duplicate idempotency key as a no-op", async () => {
    const first = await enqueue(4, 1, "lotus", { room: "Study", width: "36 1/8" });
    expect(first.duplicate).toBe(false);
    expect(first.schema).toBe("805-line-event/v1");
    expect(first.idempotency_key).toBe(`${id(4)}:1`);
    expect(first.from_state).toBe("ready");
    expect(first.to_state).toBe("queued");
    expect(first.wake).toMatchObject({
      woken: false,
      reason: "wake_disabled",
      manufacturer: "lotus",
      event_id: first.event_id,
      schema: "805-line-event/v1",
    });
    const claimed = await claim("lotus");
    expect(claimed?.state).toBe("entering");
    const again = await enqueue(4, 1, "lotus", { room: "Changed" });
    expect(again.duplicate).toBe(true);
    expect(again.event_id).toBe(first.event_id);
    expect(again.payload).toEqual({ room: "Study", width: "36 1/8" });
    expect(again.wake).toBeNull();
    expect(again.state).toBe("entering");
    const count = await db.query<{ n: number }>(
      "select count(*)::int as n from line_event.events where line_id = $1",
      [id(4)],
    );
    expect(count.rows[0].n).toBe(1);
  });

  it("claims only the matching manufacturer's unclaimed event", async () => {
    const norman = await enqueue(5, 1, " Norman ");
    const onyx = await enqueue(6, 1, "ONYX");
    expect(norman.manufacturer).toBe("norman");
    expect(onyx.manufacturer).toBe("onyx");
    expect(await claim("sundance")).toBeNull();
    expect(await claim("lotus")).toBeNull();
    const claimedNorman = await claim("norman");
    const claimedOnyx = await claim("onyx");
    expect(claimedNorman?.event_id).toBe(norman.event_id);
    expect(claimedNorman?.manufacturer).toBe("norman");
    expect(claimedOnyx?.event_id).toBe(onyx.event_id);
    expect(await claim("norman")).toBeNull();
    expect(await claim("onyx")).toBeNull();
  });

  it("does not claim the same event twice", async () => {
    const first = await enqueue(7, 1, "norman");
    const second = await enqueue(8, 1, "norman");
    const claimed = [await claim("norman", "worker-a"), await claim("norman", "worker-b")];
    expect(claimed.map((row) => row?.event_id).sort()).toEqual([first.event_id, second.event_id].sort());
    expect(new Set(claimed.map((row) => row?.event_id)).size).toBe(2);
    expect(await claim("norman", "worker-c")).toBeNull();
  });

  it("walks entered, priced, and built, then requeues a blocked or priced line", async () => {
    const queued = await enqueue(10, 1, "norman");
    await claim("norman");
    await call("select public.complete_line_event($1::uuid, 'norman', 'entered') as result", [queued.event_id]);
    const priced = event(await call<LineEvent | string>(
      "select public.complete_line_event($1::uuid, 'norman', 'priced') as result",
      [queued.event_id],
    ));
    expect(priced.state).toBe("priced");
    const built = event(await call<LineEvent | string>(
      "select public.complete_line_event($1::uuid, 'norman', 'built') as result",
      [queued.event_id],
    ));
    expect(built.state).toBe("built");
    await expect(enqueue(10, 2, "norman")).rejects.toThrow(/invalid line transition from built to queued/);

    const blockedLine = await enqueue(11, 1, "onyx");
    await claim("onyx");
    await call(
      "select public.block_line_event($1::uuid, 'onyx', 'no price label', 'blocked') as result",
      [blockedLine.event_id],
    );
    const requeued = await enqueue(11, 2, "onyx", { room: "Fixed" });
    expect(requeued.duplicate).toBe(false);
    expect(requeued.from_state).toBe("blocked");
    expect(requeued.state).toBe("queued");
    expect(requeued.block_reason).toBeNull();
    expect(requeued.idempotency_key).toBe(`${id(11)}:2`);

    const pricedLine = await enqueue(12, 1, "sundance");
    await claim("sundance");
    await call("select public.complete_line_event($1::uuid, 'sundance', 'entered') as result", [pricedLine.event_id]);
    await call("select public.complete_line_event($1::uuid, 'sundance', 'priced') as result", [pricedLine.event_id]);
    const edited = await enqueue(12, 2, "sundance");
    expect(edited.from_state).toBe("priced");
    expect(edited.state).toBe("queued");
    const replay = await enqueue(12, 2, "lotus");
    expect(replay.duplicate).toBe(true);
    expect(replay.manufacturer).toBe("sundance");
    expect(replay.state).toBe("queued");
  });

  it("lets a bot call the functions and blocks direct update or delete", async () => {
    const queued = await enqueue(13, 1, "norman");
    await expect(db.query(
      "update line_event.events set payload = '{\"tamper\":true}'::jsonb where id = $1",
      [queued.event_id],
    )).rejects.toThrow(/cannot be updated directly/);
    await expect(db.query("delete from line_event.events where id = $1", [queued.event_id])).rejects.toThrow(/append-only/);
    await db.exec("begin");
    try {
      await db.query("select set_config('line_event.via_function', 'on', true)");
      await expect(db.query(
        "update line_event.events set from_state = 'draft' where id = $1",
        [queued.event_id],
      )).rejects.toThrow(/only claim and complete fields can change/);
    } finally {
      await db.exec("rollback");
    }

    const grants = await db.query<{ routine: string }>(`
      select privilege_type || ' ' || routine_schema || '.' || routine_name as routine
      from information_schema.role_routine_grants
      where grantee = 'manufacturer_bot'
      order by routine_name
    `);
    expect(grants.rows.map((row) => row.routine)).toEqual([
      "EXECUTE public.block_line_event",
      "EXECUTE public.claim_next_line_event",
      "EXECUTE public.complete_line_event",
      "EXECUTE public.enqueue_line_event",
    ]);
    const tables = await db.query<{ n: number }>(`
      select count(*)::int as n from information_schema.role_table_grants where grantee = 'manufacturer_bot'
    `);
    expect(tables.rows[0].n).toBe(0);

    await db.exec("set role manufacturer_bot");
    try {
      const asBot = event(await call<LineEvent | string>(
        "select public.enqueue_line_event($1::uuid, 1, 'lotus', '{\"room\":\"Bot\"}'::jsonb) as result",
        [id(14)],
      ));
      expect(asBot.manufacturer).toBe("lotus");
      expect(asBot.state).toBe("queued");
      await expect(db.query("update line_event.events set payload = '{}'::jsonb")).rejects.toThrow(/permission denied/);
      await expect(db.query("delete from line_event.events")).rejects.toThrow(/permission denied/);
      await expect(db.query("delete from line_event.quote_lines")).rejects.toThrow(/permission denied/);
      await expect(db.query(
        "select public.wake_line_event_worker('lotus', $1::uuid) as result",
        [asBot.event_id],
      )).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("reset role");
    }
  });

  it("keeps the migration additive and the wake inert", () => {
    const executable = migration.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(executable).not.toMatch(/\bdrop\b/i);
    expect(executable).not.toMatch(/\btruncate\b/i);
    expect(executable).not.toMatch(/\bdelete\s+from\b/i);
    expect(executable.toLowerCase()).toContain("for update skip locked");
    const wake = migration.slice(
      migration.indexOf("create or replace function public.wake_line_event_worker"),
      migration.indexOf("create or replace function line_event.enqueue_line_event"),
    );
    expect(wake).not.toMatch(/http|pg_net|dblink|telegram|twilio|net\.http|fetch\(/i);
    expect(wake).toContain("wake_disabled");
    expect(executable.match(/v_wake := public\.wake_line_event_worker\s*\(/g)).toHaveLength(1);
  });
});

function sqlStatements(sql: string) {
  const statements: string[] = [];
  let current = "";
  let i = 0;
  let dollar: string | null = null;
  while (i < sql.length) {
    if (dollar) {
      if (sql.startsWith(dollar, i)) {
        current += dollar;
        i += dollar.length;
        dollar = null;
        continue;
      }
      current += sql[i++];
      continue;
    }
    if (sql[i] === "-" && sql[i + 1] === "-") {
      const end = sql.indexOf("\n", i);
      i = end === -1 ? sql.length : end;
      continue;
    }
    if (sql[i] === "'") {
      current += sql[i++];
      while (i < sql.length) {
        current += sql[i];
        if (sql[i] === "'" && sql[i + 1] === "'") {
          current += sql[++i];
          i++;
          continue;
        }
        if (sql[i] === "'") {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (sql[i] === "$") {
      const tag = /^\$[A-Za-z0-9_]*\$/.exec(sql.slice(i));
      if (tag) {
        dollar = tag[0];
        current += dollar;
        i += dollar.length;
        continue;
      }
    }
    if (sql[i] === ";") {
      if (current.trim()) statements.push(current.trim());
      current = "";
      i++;
      continue;
    }
    current += sql[i++];
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

const pgUrl = process.env.LINE_EVENT_DATABASE_URL;

describe.skipIf(!pgUrl && !process.env.CI)("concurrent line-event claims", () => {
  const url = pgUrl ?? "";

  beforeAll(async () => {
    const target = new URL(url);
    if (!["localhost", "127.0.0.1", "::1"].includes(target.hostname) || target.pathname !== "/line_event_queue") {
      throw new Error("LINE_EVENT_DATABASE_URL must be a local line_event_queue database");
    }
    const client = new Client({ connectionString: url });
    await client.connect();
    try {
      await client.query(`
        do $roles$
        begin
          if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
          if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
          if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role bypassrls; end if;
        end
        $roles$;
        drop schema if exists line_event cascade;
        drop function if exists public.enqueue_line_event(uuid, bigint, text, jsonb);
        drop function if exists public.claim_next_line_event(text, text);
        drop function if exists public.complete_line_event(uuid, text, text, text);
        drop function if exists public.block_line_event(uuid, text, text, text, text);
        drop function if exists public.wake_line_event_worker(text, uuid);
      `);
      for (const statement of sqlStatements(migration)) {
        await client.query(statement);
      }
    } finally {
      await client.end();
    }
  }, 30000);

  it("never lets two workers claim the same event", async () => {
    const setup = new Client({ connectionString: url });
    await setup.connect();
    const lineA = "31000000-0000-4000-8000-000000000001";
    const lineB = "31000000-0000-4000-8000-000000000002";
    const lineC = "31000000-0000-4000-8000-000000000003";
    await setup.query("select public.enqueue_line_event($1::uuid, 1, 'norman', '{\"room\":\"A\"}'::jsonb)", [lineA]);
    await setup.query("select public.enqueue_line_event($1::uuid, 1, 'norman', '{\"room\":\"B\"}'::jsonb)", [lineB]);
    await setup.query("select public.enqueue_line_event($1::uuid, 1, 'onyx', '{\"room\":\"C\"}'::jsonb)", [lineC]);
    await setup.end();

    const workerA = new Client({ connectionString: url });
    const workerB = new Client({ connectionString: url });
    await workerA.connect();
    await workerB.connect();
    try {
      await workerA.query("begin");
      await workerB.query("begin");
      const first = await workerA.query<{ result: LineEvent }>(
        "select public.claim_next_line_event('norman', 'worker-a') as result",
      );
      await workerB.query("set local statement_timeout = '1500ms'");
      const second = await workerB.query<{ result: LineEvent | null }>(
        "select public.claim_next_line_event('norman', 'worker-b') as result",
      );
      const claimedA = first.rows[0].result;
      const claimedB = second.rows[0].result;
      expect(claimedA.manufacturer).toBe("norman");
      expect(claimedB).not.toBeNull();
      expect(claimedB?.manufacturer).toBe("norman");
      expect(claimedA.event_id).not.toBe(claimedB?.event_id);
      expect([claimedA.line_id, claimedB?.line_id].sort()).toEqual([lineA, lineB].sort());
      await workerA.query("commit");
      await workerB.query("commit");
    } finally {
      await workerA.end();
      await workerB.end();
    }

    const after = new Client({ connectionString: url });
    await after.connect();
    try {
      const third = await after.query<{ result: LineEvent | null }>(
        "select public.claim_next_line_event('norman', 'worker-c') as result",
      );
      expect(third.rows[0].result).toBeNull();
      const onyx = await after.query<{ result: LineEvent }>(
        "select public.claim_next_line_event('onyx', 'onyx-worker') as result",
      );
      expect(onyx.rows[0].result.line_id).toBe(lineC);
      expect(onyx.rows[0].result.manufacturer).toBe("onyx");
    } finally {
      await after.end();
    }
  }, 15000);
});
