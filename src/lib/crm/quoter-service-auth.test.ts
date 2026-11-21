import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { isAllowedCrmEmail } from "@/lib/crm/allowed-users";
import { requireCrmUser, requireQuoteFrontDoorActor } from "@/lib/crm/auth";
import { runQuoterFrontDoorCall } from "@/lib/crm/quoter-service-client";
import {
  DEFAULT_QUOTER_SERVICE_ACTOR_EMAIL,
  QUOTER_ACTOR_UNAVAILABLE_MESSAGE,
  QUOTER_DRAFT_RPC,
  QUOTER_FRONT_DOOR_ROUTES,
  QUOTER_QUOTE_UPDATE_COLUMNS,
  QUOTER_SEQUENCE_WRITE_DENIED_MESSAGE,
  QUOTER_SERVICE_DENIED_MESSAGE,
  QuoterServiceAuthError,
  isQuoterFrontDoorRoute,
  quoterFrontDoorDb,
  quoterServiceActorEmail,
  quoterServiceGuard,
  quoterServiceTokenConfigured,
  quoterServiceTokenMatches,
  type QuoterDb,
} from "@/lib/crm/quoter-service-auth";
import { proxy } from "@/proxy";

const FIXTURE = "test-quoter-token-not-a-live-secret";
const ORIGINAL_TOKEN = process.env.QUOTER_SERVICE_TOKEN;
const ORIGINAL_ACTOR = process.env.QUOTER_SERVICE_ACTOR_EMAIL;
const ORIGINAL_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ORIGINAL_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const JESSICA_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MIKE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const QUOTE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const DROPPED_SIDE_TABLE = ["crm", "quote", "front", "door", "drafts"].join("_");

const state = vi.hoisted(() => ({ service: vi.fn() }));

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServiceClient: () => state.service(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: null }, error: { message: "invalid" } }),
    },
  }),
}));

import { GET as lookupCustomers } from "@/app/api/crm/quote-front-door/customers/route";
import { POST as saveDraft } from "@/app/api/crm/quote-front-door/draft/route";
import { POST as readBack } from "@/app/api/crm/quote-front-door/read-back/route";
import * as customersRoute from "@/app/api/crm/quote-front-door/customers/route";
import * as nextFieldRoute from "@/app/api/crm/quote-front-door/next-field/route";
import * as validateRoute from "@/app/api/crm/quote-front-door/validate/route";
import * as readBackRoute from "@/app/api/crm/quote-front-door/read-back/route";
import * as draftRoute from "@/app/api/crm/quote-front-door/draft/route";

const catalog = "order-form:norman:roller:v1";
const repo = process.cwd();

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterAll(() => {
  restoreEnv("QUOTER_SERVICE_TOKEN", ORIGINAL_TOKEN);
  restoreEnv("QUOTER_SERVICE_ACTOR_EMAIL", ORIGINAL_ACTOR);
  restoreEnv("NEXT_PUBLIC_SUPABASE_URL", ORIGINAL_URL);
  restoreEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", ORIGINAL_ANON);
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.QUOTER_SERVICE_TOKEN = FIXTURE;
  delete process.env.QUOTER_SERVICE_ACTOR_EMAIL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  state.service.mockReset();
});

function request(pathname: string, method = "GET") {
  return new NextRequest(`http://localhost${pathname}`, {
    method,
    headers: { authorization: `Bearer ${FIXTURE}` },
  });
}

function memoryDb(options: {
  profile?: { id: string; email: string; active: boolean } | null;
  profileError?: string;
} = {}) {
  const profile = options.profile === undefined
    ? { id: JESSICA_ID, email: DEFAULT_QUOTER_SERVICE_ACTOR_EMAIL, active: true }
    : options.profile;
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  const updates: Array<{ table: string; values: Record<string, unknown> }> = [];
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const tables: string[] = [];
  const client: QuoterDb = {
    async rpc(fn, args) {
      rpcCalls.push({ fn, args });
      if (fn === "quote_next_required_field") {
        return {
          data: {
            status: "complete",
            reason: null,
            field_key: null,
            input_kind: null,
            required: null,
            ask_order: null,
            choices: [],
            invalidated: [],
            kept: { room_location: "Office" },
            optional_field: null,
            catalog_version: catalog,
          },
          error: null,
        };
      }
      if (fn === "create_quote_v2_draft") {
        return {
          data: {
            quoteId: QUOTE_ID,
            quoteNumber: "805-0116",
            status: "draft",
            quoteV2Status: "draft",
            lineCount: 0,
          },
          error: null,
        };
      }
      return { data: null, error: { message: `unexpected rpc ${fn}` } };
    },
    from(table) {
      tables.push(table);
      return {
        select() {
          const filters: Array<{ column: string; value: string }> = [];
          const api = {
            eq(column: string, value: string) {
              filters.push({ column, value });
              return api;
            },
            is() { return api; },
            or() { return api; },
            in() { return api; },
            order() { return api; },
            async limit() {
              if (table !== "crm_profiles") return { data: [], error: null };
              if (options.profileError) return { data: null, error: { message: options.profileError } };
              if (!profile) return { data: [], error: null };
              const email = filters.find((filter) => filter.column === "email")?.value;
              if (email && email !== profile.email) return { data: [], error: null };
              return { data: [profile], error: null };
            },
          };
          return api;
        },
        insert(row) {
          inserts.push({ table, row });
          return { select: () => ({ single: async () => ({ data: { id: "inserted" }, error: null }) }) };
        },
        update(values) {
          const chain = {
            eq() { return chain; },
            async is() {
              updates.push({ table, values });
              return { error: null };
            },
          };
          return chain;
        },
      };
    },
  };
  return { client, inserts, updates, rpcCalls, tables };
}

function draftBody() {
  return {
    manufacturer: "Norman",
    category: "roller",
    spec: { answers: { room_location: "Office" }, multiplier: "2.5" },
    customer: { name: "New Person", phone: "805-555-0177", confirmNewCustomer: true },
  };
}

function post(pathname: string, body: unknown) {
  return new NextRequest(`http://localhost${pathname}`, {
    method: "POST",
    headers: { authorization: `Bearer ${FIXTURE}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.name === "route.ts" ? [full] : [];
  });
}

function routePath(file: string) {
  const relative = path.relative(path.join(repo, "src/app"), file).split(path.sep).join("/");
  return `/${relative.replace(/\/route\.ts$/, "")}`;
}

function concretePath(route: string) {
  return route.replace(/\[[^\]]+\]/g, "example");
}

function fileGuardsQuoter(file: string, seen = new Set<string>()): boolean {
  if (seen.has(file)) return false;
  seen.add(file);
  const source = readFileSync(file, "utf8");
  if (source.includes("requireCrmUser") || source.includes("requireQuoteFrontDoorActor") || source.includes("quoterServiceGuard")) {
    return true;
  }
  return [...source.matchAll(/from\s+["'](\.\/[^"']+)["']/g)].some((match) => {
    const base = path.resolve(path.dirname(file), match[1] ?? "");
    const candidates = [base, `${base}.ts`, `${base}.tsx`];
    return candidates.some((candidate) => existsSync(candidate) && fileGuardsQuoter(candidate, seen));
  });
}

describe("Quoter service token", () => {
  it("compares hashes and fails closed when the env var is unset, blank, or wrong", () => {
    expect(quoterServiceTokenMatches(FIXTURE)).toBe(true);
    expect(quoterServiceTokenMatches(`${FIXTURE}-extra`)).toBe(false);
    expect(quoterServiceTokenMatches(FIXTURE.slice(0, 8))).toBe(false);
    expect(quoterServiceTokenMatches("")).toBe(false);
    expect(quoterServiceTokenConfigured()).toBe(true);

    process.env.QUOTER_SERVICE_TOKEN = `  ${FIXTURE}  `;
    expect(quoterServiceTokenMatches(FIXTURE)).toBe(true);

    for (const value of [undefined, "", "   "]) {
      restoreEnv("QUOTER_SERVICE_TOKEN", value);
      expect(quoterServiceTokenConfigured()).toBe(false);
      expect(quoterServiceTokenMatches(FIXTURE)).toBe(false);
      expect(quoterServiceTokenMatches("anything")).toBe(false);
    }
  });

  it("defaults the draft actor to Jessica and ignores a blank override", () => {
    expect(DEFAULT_QUOTER_SERVICE_ACTOR_EMAIL).toBe("jessica@805shutters.com");
    expect(isAllowedCrmEmail(DEFAULT_QUOTER_SERVICE_ACTOR_EMAIL)).toBe(true);
    expect(quoterServiceActorEmail()).toBe(DEFAULT_QUOTER_SERVICE_ACTOR_EMAIL);
    process.env.QUOTER_SERVICE_ACTOR_EMAIL = "  ";
    expect(quoterServiceActorEmail()).toBe(DEFAULT_QUOTER_SERVICE_ACTOR_EMAIL);
    process.env.QUOTER_SERVICE_ACTOR_EMAIL = "  805shutters@gmail.com  ";
    expect(quoterServiceActorEmail()).toBe("805shutters@gmail.com");
    process.env.QUOTER_SERVICE_ACTOR_EMAIL = "not an email";
    expect(quoterServiceActorEmail()).toBeNull();
  });
});

describe("Quoter front-door allowlist", () => {
  const routeFiles = walk(path.join(repo, "src/app/api/crm"));

  it("is exactly the five quote front-door routes", () => {
    expect([...QUOTER_FRONT_DOOR_ROUTES]).toEqual([
      "/api/crm/quote-front-door/customers",
      "/api/crm/quote-front-door/next-field",
      "/api/crm/quote-front-door/validate",
      "/api/crm/quote-front-door/read-back",
      "/api/crm/quote-front-door/draft",
    ]);
    expect(new Set(QUOTER_FRONT_DOOR_ROUTES).size).toBe(5);
    for (const route of QUOTER_FRONT_DOOR_ROUTES) {
      expect(isQuoterFrontDoorRoute(route)).toBe(true);
      expect(isQuoterFrontDoorRoute(`${route}/`)).toBe(true);
    }
    for (const route of [
      "/api/crm/quote-front-door",
      "/api/crm/quote-front-door/draft/send",
      "/api/crm/quote-front-door/drafts",
      "/api/crm/quote-front-door/customers/extra",
      "/api/crm/quotes/example/send",
      "/api/crm/jobs",
    ]) {
      expect(isQuoterFrontDoorRoute(route)).toBe(false);
    }
  });

  it("allows the token through only those five route files", () => {
    const accepting = routeFiles.filter((file) => readFileSync(file, "utf8").includes("requireQuoteFrontDoorActor"));
    expect(accepting.map(routePath).sort()).toEqual([...QUOTER_FRONT_DOOR_ROUTES].sort());
    expect(readFileSync(path.join(repo, "src/proxy.ts"), "utf8")).toContain("quoterServiceGuard");
    const mtsRoute = "src/app/api/crm/admin/mts-805-sync/route.ts";
    const unguarded = routeFiles
      .map((file) => path.relative(repo, file).split(path.sep).join("/"))
      .filter((file) => file !== mtsRoute)
      .filter((file) => !fileGuardsQuoter(path.join(repo, file)));
    expect(unguarded).toEqual([]);
    expect(readFileSync(path.join(repo, mtsRoute), "utf8")).not.toContain("requireQuoteFrontDoorActor");
  });

  it("exports only the read or draft method on each front-door route", () => {
    expect(Object.keys(customersRoute).sort()).toEqual(["GET", "runtime"]);
    expect(Object.keys(nextFieldRoute).sort()).toEqual(["POST", "runtime"]);
    expect(Object.keys(validateRoute).sort()).toEqual(["POST", "runtime"]);
    expect(Object.keys(readBackRoute).sort()).toEqual(["POST", "runtime"]);
    expect(Object.keys(draftRoute).sort()).toEqual(["POST", "runtime"]);
  });

  it("denies every other CRM route path in the guard and the proxy", () => {
    const denied = routeFiles
      .map(routePath)
      .map(concretePath)
      .filter((route) => !isQuoterFrontDoorRoute(route));
    expect(denied.length).toBeGreaterThan(QUOTER_FRONT_DOOR_ROUTES.length);
    for (const route of denied) {
      const response = quoterServiceGuard(request(route, "POST"));
      expect(response?.status, route).toBe(403);
    }
    for (const route of QUOTER_FRONT_DOOR_ROUTES) {
      expect(quoterServiceGuard(request(route, "POST")), route).toBeNull();
      const response = proxy(request(route, "GET"));
      expect(response.headers.get("x-middleware-next")).toBe("1");
    }
    const blocked = proxy(request("/api/crm/quotes/example/send", "POST"));
    expect(blocked.status).toBe(403);
    expect(quoterServiceGuard(request("/api/crm/quote-front-door/drafts", "GET"))?.status).toBe(403);
    expect(proxy(request("/api/crm/admin/mts-805-sync", "POST")).status).toBe(403);
    expect(proxy(request("/api/leads", "POST")).status).toBe(403);

    delete process.env.QUOTER_SERVICE_TOKEN;
    expect(quoterServiceGuard(request("/api/crm/quotes/example/send", "POST"))).toBeNull();
    expect(proxy(request("/api/crm/jobs", "POST")).headers.get("x-middleware-next")).toBe("1");
  });
});

function draftWrites(db: ReturnType<typeof memoryDb>) {
  return {
    creates: db.rpcCalls.filter((call) => call.fn === QUOTER_DRAFT_RPC),
    updates: db.updates,
    inserts: db.inserts,
  };
}

describe("Quoter draft access", () => {
  it("creates a v2 draft attributed to Jessica and stores the read-back", async () => {
    const db = memoryDb();
    state.service.mockReturnValue(db.client);

    const probe = await lookupCustomers(request("/api/crm/quote-front-door/customers"));
    expect(probe.status).toBe(200);
    expect(await probe.json()).toEqual({ candidates: [], truncated: false, created: false });
    expect(db.tables).toEqual(["crm_profiles"]);
    expect(draftWrites(db)).toEqual({ creates: [], updates: [], inserts: [] });

    const saved = await saveDraft(post("/api/crm/quote-front-door/draft", draftBody()));
    expect(saved.status).toBe(200);
    const savedBody = await saved.json();
    expect(savedBody).toMatchObject({
      saved: true,
      sent: false,
      quote: { id: QUOTE_ID, quoteNumber: "805-0116", status: "draft", sent: false },
    });
    expect(savedBody.readBack.summary).toBe("Norman roller\nRoom: Office\nMultiplier: 2.5");
    const { creates, updates, inserts } = draftWrites(db);
    expect(creates).toHaveLength(1);
    expect(creates[0]?.args).toMatchObject({
      p_actor_id: JESSICA_ID,
      p_quote_patch: { customerName: "New Person" },
    });
    expect(String(creates[0]?.args.p_idempotency_key)).toMatch(/^fd\.[a-f0-9]{64}$/);
    expect(creates[0]?.args.p_quote_patch).not.toHaveProperty("installerNotes");
    expect(updates).toEqual([
      {
        table: "sales_quotes",
        values: {
          front_door_readback: expect.objectContaining({
            summary: savedBody.readBack.summary,
            customerId: null,
            jobId: null,
          }),
        },
      },
    ]);
    expect(inserts).toEqual([]);
    expect(db.tables).not.toContain(DROPPED_SIDE_TABLE);
    expect(db.rpcCalls.map((call) => call.fn)).not.toContain("quote_category_field_sequence_write");
    expect(db.rpcCalls.map((call) => call.fn)).not.toContain("mutate_quote_v2_structure");

    const spoken = await readBack(post("/api/crm/quote-front-door/read-back", draftBody()));
    expect(spoken.status).toBe(200);
    expect((await spoken.json()).summary).toBe(savedBody.readBack.summary);
  });

  it("uses the configured active profile id when the actor email is overridden", async () => {
    process.env.QUOTER_SERVICE_ACTOR_EMAIL = "805shutters@gmail.com";
    const db = memoryDb({ profile: { id: MIKE_ID, email: "805shutters@gmail.com", active: true } });
    state.service.mockReturnValue(db.client);
    const saved = await saveDraft(post("/api/crm/quote-front-door/draft", draftBody()));
    expect(saved.status).toBe(200);
    expect(draftWrites(db).creates[0]?.args.p_actor_id).toBe(MIKE_ID);
    const actor = await requireQuoteFrontDoorActor(request("/api/crm/quote-front-door/draft", "POST"));
    expect(actor).toMatchObject({ kind: "quoter-service", email: "805shutters@gmail.com", userId: MIKE_ID });
  });

  it("checks the token with one read before a write, retries once, then stops", async () => {
    const db = memoryDb();
    state.service.mockReturnValue(db.client);
    const report = await runQuoterFrontDoorCall({
      probe: async () => {
        const response = await lookupCustomers(request("/api/crm/quote-front-door/customers"));
        return { status: response.status, body: await response.json() };
      },
      write: async () => {
        const response = await saveDraft(post("/api/crm/quote-front-door/draft", draftBody()));
        return { status: response.status, body: await response.json() };
      },
    });
    expect(report).toMatchObject({ stopped: false, wrote: true, probeAttempts: 1, writeAttempts: 1, status: 200 });
    expect(draftWrites(db).creates).toHaveLength(1);
    expect(draftWrites(db).creates[0]?.args.p_actor_id).toBe(JESSICA_ID);

    let probes = 0;
    let writes = 0;
    const retried = await runQuoterFrontDoorCall({
      probe: async () => {
        probes += 1;
        return { status: probes === 1 ? 401 : 200 };
      },
      write: async () => {
        writes += 1;
        return { status: 200 };
      },
    });
    expect(retried).toMatchObject({ stopped: false, wrote: true, probeAttempts: 2, writeAttempts: 1 });
    expect(writes).toBe(1);

    writes = 0;
    const stopped = await runQuoterFrontDoorCall({
      probe: async () => ({ status: 403 }),
      write: async () => {
        writes += 1;
        return { status: 200 };
      },
    });
    expect(stopped.stopped).toBe(true);
    expect(stopped.wrote).toBe(false);
    expect(stopped.probeAttempts).toBe(2);
    expect(stopped.message).toBe("Quoter token check failed after one retry. No write was sent.");
    expect(writes).toBe(0);

    const writeRefused = await runQuoterFrontDoorCall({
      probe: async () => ({ status: 200 }),
      write: async () => ({ status: 401 }),
    });
    expect(writeRefused).toMatchObject({
      stopped: true,
      wrote: true,
      writeAttempts: 2,
      message: "Quoter write was refused after one retry.",
    });
  });

  it("fails closed on the draft route when the token is unset or the database is not configured", async () => {
    delete process.env.QUOTER_SERVICE_TOKEN;
    const db = memoryDb();
    state.service.mockReturnValue(db.client);
    let writes = 0;
    const report = await runQuoterFrontDoorCall({
      probe: async () => {
        const response = await lookupCustomers(request("/api/crm/quote-front-door/customers"));
        return { status: response.status };
      },
      write: async () => {
        writes += 1;
        const response = await saveDraft(post("/api/crm/quote-front-door/draft", draftBody()));
        return { status: response.status };
      },
    });
    expect(report.stopped).toBe(true);
    expect(report.wrote).toBe(false);
    expect(report.probeAttempts).toBe(2);
    expect(report.status).toBe(401);
    expect(writes).toBe(0);
    expect(draftWrites(db)).toEqual({ creates: [], updates: [], inserts: [] });
    expect(state.service).not.toHaveBeenCalled();

    process.env.QUOTER_SERVICE_TOKEN = "";
    const blank = await saveDraft(post("/api/crm/quote-front-door/draft", draftBody()));
    expect(blank.status).toBe(401);
    expect(draftWrites(db)).toEqual({ creates: [], updates: [], inserts: [] });

    process.env.QUOTER_SERVICE_TOKEN = FIXTURE;
    state.service.mockReturnValue(null);
    const unconfigured = await saveDraft(post("/api/crm/quote-front-door/draft", draftBody()));
    expect(unconfigured.status).toBe(503);
    expect(draftWrites(db)).toEqual({ creates: [], updates: [], inserts: [] });
  });

  it("fails closed with no write when the actor profile is missing or inactive", async () => {
    for (const profile of [null, { id: JESSICA_ID, email: DEFAULT_QUOTER_SERVICE_ACTOR_EMAIL, active: false }] as const) {
      const db = memoryDb({ profile });
      state.service.mockReturnValue(db.client);
      const saved = await saveDraft(post("/api/crm/quote-front-door/draft", draftBody()));
      expect(saved.status).toBe(503);
      expect(await saved.json()).toEqual({ message: QUOTER_ACTOR_UNAVAILABLE_MESSAGE });
      expect(draftWrites(db)).toEqual({ creates: [], updates: [], inserts: [] });
      expect(db.rpcCalls).toEqual([]);
      await expect(requireQuoteFrontDoorActor(request("/api/crm/quote-front-door/draft", "POST"))).rejects.toMatchObject({
        status: 503,
        message: QUOTER_ACTOR_UNAVAILABLE_MESSAGE,
      });
    }

    process.env.QUOTER_SERVICE_ACTOR_EMAIL = "missing@805shutters.com";
    const missingEmail = memoryDb();
    state.service.mockReturnValue(missingEmail.client);
    const named = await saveDraft(post("/api/crm/quote-front-door/draft", draftBody()));
    expect(named.status).toBe(503);
    expect(draftWrites(missingEmail)).toEqual({ creates: [], updates: [], inserts: [] });

    const broken = memoryDb({ profileError: "profile lookup failed" });
    state.service.mockReturnValue(broken.client);
    const errored = await saveDraft(post("/api/crm/quote-front-door/draft", draftBody()));
    expect(errored.status).toBe(503);
    expect(draftWrites(broken)).toEqual({ creates: [], updates: [], inserts: [] });
  });

  it("does not turn the service token into a staff CRM session", async () => {
    const db = memoryDb();
    state.service.mockReturnValue(db.client);
    await expect(requireCrmUser(request("/api/crm/quote-front-door/draft", "POST"))).rejects.toMatchObject({
      status: 403,
      message: QUOTER_SERVICE_DENIED_MESSAGE,
    });
    await expect(requireQuoteFrontDoorActor(request("/api/crm/jobs", "GET"))).rejects.toMatchObject({ status: 403 });
    const actor = await requireQuoteFrontDoorActor(request("/api/crm/quote-front-door/customers"));
    expect(actor).toMatchObject({
      kind: "quoter-service",
      email: DEFAULT_QUOTER_SERVICE_ACTOR_EMAIL,
      userId: JESSICA_ID,
    });
    expect(state.service).toHaveBeenCalledTimes(1);
    expect(draftWrites(db)).toEqual({ creates: [], updates: [], inserts: [] });
  });
});

describe("Quoter sequence writes", () => {
  it("refuses sequence writes, other routes' functions, and the dropped side table", async () => {
    const inner = { rpc: vi.fn(async () => ({ data: null, error: null })), from: vi.fn() };
    const db = quoterFrontDoorDb(inner as unknown as QuoterDb, JESSICA_ID);
    await expect(db.rpc("quote_category_field_sequence_write", { p_target: "sequence", p_row: {} })).rejects.toMatchObject({
      status: 403,
      message: QUOTER_SEQUENCE_WRITE_DENIED_MESSAGE,
    });
    await expect(db.rpc("mutate_quote_v2_structure", { p_actor_id: JESSICA_ID, p_operations: [] })).rejects.toMatchObject({
      status: 403,
    });
    await expect(db.rpc(QUOTER_DRAFT_RPC, { p_actor_id: MIKE_ID, p_quote_patch: {} })).rejects.toMatchObject({ status: 403 });
    expect(() => db.from("quote_category_field_sequence").insert({ status: "draft" })).toThrow(QuoterServiceAuthError);
    expect(() => db.from("quote_sequence_field_alias").insert({ status: "draft" })).toThrow(QuoterServiceAuthError);
    expect(() => db.from("quote_sequence_field_alias").select("saved_key")).toThrow(QuoterServiceAuthError);
    expect(() => db.from("crm_customers").insert({ status: "draft" })).toThrow(QuoterServiceAuthError);
    expect(() => db.from(DROPPED_SIDE_TABLE).select("id")).toThrow(QuoterServiceAuthError);
    expect(() => db.from(DROPPED_SIDE_TABLE).insert({ status: "draft" })).toThrow(QuoterServiceAuthError);
    expect(() => db.from("sales_quotes").update({ installer_notes: "no" })).toThrow(QuoterServiceAuthError);
    expect(() => db.from("sales_quotes").update({ front_door_readback: { summary: "x" } }).eq("created_by", MIKE_ID)).toThrow(QuoterServiceAuthError);
    expect(inner.rpc).not.toHaveBeenCalled();
    expect(inner.from).not.toHaveBeenCalled();

    await expect(db.rpc(QUOTER_DRAFT_RPC, { p_actor_id: JESSICA_ID, p_idempotency_key: "front-door-ok", p_quote_patch: {} })).resolves.toEqual({
      data: null,
      error: null,
    });
    expect(inner.rpc).toHaveBeenCalledTimes(1);
    expect([...QUOTER_QUOTE_UPDATE_COLUMNS]).toEqual(["front_door_readback", "created_job_id"]);

    const sql = readFileSync("supabase/migrations/20261121160000_quote_category_field_sequence.sql", "utf8");
    expect(sql).toContain("quote sequence writes require Mike or Jessica");
    expect(sql).toContain("revoke all on function public.quote_category_field_sequence_write(text, jsonb) from public, anon, service_role");
    expect(sql).not.toContain("QUOTER_SERVICE_TOKEN");
  });
});

describe("Quoter secret documentation", () => {
  it("tells operators to store the secret in Vercel or the Grok vault and leaves the example blank", () => {
    const example = readFileSync(".env.example", "utf8");
    expect(example).toMatch(/^QUOTER_SERVICE_TOKEN=\s*$/m);
    expect(example).toMatch(/^QUOTER_SERVICE_ACTOR_EMAIL=\s*$/m);
    const readme = readFileSync("README.md", "utf8");
    expect(readme).toContain("Vercel project environment");
    expect(readme).toContain("Grok vault");
    expect(readme).toContain("retry that same read once");
    expect(readme).toContain("crm_profiles");
    expect(readme).toContain(DEFAULT_QUOTER_SERVICE_ACTOR_EMAIL);
    expect(readme).toContain("create_quote_v2_draft");
    expect(readme).toContain("front_door_readback");
    expect(readme).not.toContain(FIXTURE);
    expect(readme).not.toContain(DROPPED_SIDE_TABLE);
  });

  it("keeps the dropped side table out of application code", () => {
    const allowed = new Set([
      "supabase/migrations/20261121233000_quote_front_door_drafts.sql",
      "supabase/migrations/20261122035000_drop_empty_front_door_side_table.sql",
    ]);
    const skipDir = new Set(["node_modules", ".git", ".next", "coverage", "playwright-report", "test-results"]);
    const textExt = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".sql", ".md", ".json", ".css", ".html", ".yml", ".yaml", ".toml", ".txt"]);
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (skipDir.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        const relative = path.relative(repo, full).split(path.sep).join("/");
        if (allowed.has(relative)) continue;
        const ext = path.extname(entry.name).toLowerCase();
        if (!textExt.has(ext) && entry.name !== ".env.example") continue;
        if (readFileSync(full, "utf8").includes(DROPPED_SIDE_TABLE)) hits.push(relative);
      }
    };
    walk(repo);
    expect(statSync(path.join(repo, "src")).isDirectory()).toBe(true);
    expect(hits).toEqual([]);
  });
});
