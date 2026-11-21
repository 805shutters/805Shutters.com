import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

/**
 * Server-to-server identity for the Quoter bot.
 * The secret is QUOTER_SERVICE_TOKEN in the Vercel project environment or the
 * Grok vault. This module never creates a secret.
 * Comparison hashes both sides and fails closed when the environment value is missing.
 * A matching token is not a staff login. Draft writes use one active crm_profiles
 * row, named by QUOTER_SERVICE_ACTOR_EMAIL and defaulting to Jessica.
 */

export const QUOTER_SERVICE_TOKEN_ENV = "QUOTER_SERVICE_TOKEN";

export const QUOTER_SERVICE_ACTOR_EMAIL_ENV = "QUOTER_SERVICE_ACTOR_EMAIL";

export const DEFAULT_QUOTER_SERVICE_ACTOR_EMAIL = "jessica@805shutters.com";

export const QUOTER_SERVICE_EMAIL = "quoter-service@805shutters.invalid";

export const QUOTER_SERVICE_DENIED_MESSAGE = "The Quoter service can only use the quote front door.";

export const QUOTER_SEQUENCE_WRITE_DENIED_MESSAGE = "The Quoter cannot change the quote field sequence.";

export const QUOTER_ACTOR_UNAVAILABLE_MESSAGE = "The Quoter staff actor is not an active CRM profile.";

/** The only CRM routes a matching Quoter token may call. Exact paths, not a prefix. */
export const QUOTER_FRONT_DOOR_ROUTES = [
  "/api/crm/quote-front-door/customers",
  "/api/crm/quote-front-door/next-field",
  "/api/crm/quote-front-door/validate",
  "/api/crm/quote-front-door/read-back",
  "/api/crm/quote-front-door/draft",
  "/api/crm/quote-front-door/batch-next-field",
  "/api/crm/quote-front-door/batch-validate",
] as const;

export type QuoterFrontDoorRoute = (typeof QUOTER_FRONT_DOOR_ROUTES)[number];

const QUOTER_READ_RPC = new Set(["quote_next_required_field", "quote_validate_tapped_value"]);

export const QUOTER_DRAFT_RPC = "create_quote_v2_draft";

const QUOTER_READ_TABLES = new Set([
  "crm_customers",
  "crm_jobs",
  "sales_805_appointments",
  "crm_calendar_events",
  "quote_category_field_sequence",
  "quote_catalog_field_choice",
]);

const QUOTER_QUOTE_UPDATE_TABLE = "sales_quotes";

const QUOTER_QUOTE_UPDATE_COLUMNS = new Set(["front_door_readback", "created_job_id"]);

const STAFF_ACTOR_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ACTOR_EMAIL = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

const QUOTE_SEQUENCE_TABLES = new Set(["quote_category_field_sequence", "quote_sequence_field_alias"]);

const SEQUENCE_WRITE_FUNCTION = "quote_category_field_sequence_write";

export class QuoterServiceAuthError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "QuoterServiceAuthError";
    this.status = status;
  }
}

type QuoterFilter = {
  eq(column: string, value: string): QuoterFilter;
  is(column: string, value: null): QuoterFilter;
  or(filters: string): QuoterFilter;
  in(column: string, values: string[]): QuoterFilter;
  order(column: string, options: { ascending: boolean }): QuoterFilter;
  limit(count: number): Promise<{ data: unknown[] | null; error: { message: string } | null }>;
};

export type QuoterUpdate = {
  eq(column: string, value: string): QuoterUpdate;
  is(column: string, value: null): Promise<{ error: { message: string } | null }>;
};

export type QuoterDb = {
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }>;
  from(table: string): {
    select(columns: string): QuoterFilter;
    insert(row: Record<string, unknown>): {
      select(columns: string): {
        single(): Promise<{ data: { id: string } | null; error: { message: string } | null }>;
      };
    };
    update(values: Record<string, unknown>): QuoterUpdate;
  };
};

export type QuoterProfileClient = {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        limit(count: number): Promise<{ data: unknown[] | null; error: { message: string } | null }>;
      };
    };
  };
};

export type QuoterStaffActor = {
  id: string;
  email: string;
};

export function normalizeQuoterPath(pathname: string) {
  const path = pathname.split("?")[0]?.split("#")[0] ?? "";
  if (path.length > 1 && path.endsWith("/")) return path.replace(/\/+$/, "");
  return path;
}

export function isQuoterFrontDoorRoute(pathname: string): pathname is QuoterFrontDoorRoute {
  const path = normalizeQuoterPath(pathname);
  return (QUOTER_FRONT_DOOR_ROUTES as readonly string[]).includes(path);
}

export function quoterServiceTokenConfigured() {
  return configuredTokenDigest() !== null;
}

export function quoterServiceTokenMatches(presented: string) {
  if (!presented) return false;
  const expected = configuredTokenDigest();
  if (!expected) return false;
  const actual = createHash("sha256").update(presented, "utf8").digest();
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function quoterServiceActorEmail() {
  const raw = process.env[QUOTER_SERVICE_ACTOR_EMAIL_ENV];
  const trimmed = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  const email = trimmed || DEFAULT_QUOTER_SERVICE_ACTOR_EMAIL;
  return ACTOR_EMAIL.test(email) ? email : null;
}

export async function resolveQuoterStaffActor(db: QuoterProfileClient): Promise<QuoterStaffActor> {
  const email = quoterServiceActorEmail();
  if (!email) throw new QuoterServiceAuthError(503, QUOTER_ACTOR_UNAVAILABLE_MESSAGE);
  const { data, error } = await db.from("crm_profiles").select("id, email, active").eq("email", email).limit(1);
  if (error || !Array.isArray(data) || data.length !== 1) {
    throw new QuoterServiceAuthError(503, QUOTER_ACTOR_UNAVAILABLE_MESSAGE);
  }
  const row = data[0];
  const record = row && typeof row === "object" ? row as Record<string, unknown> : {};
  const id = typeof record.id === "string" ? record.id.trim() : "";
  const rowEmail = typeof record.email === "string" ? record.email.trim().toLowerCase() : "";
  if (record.active !== true || rowEmail !== email || !STAFF_ACTOR_ID.test(id)) {
    throw new QuoterServiceAuthError(503, QUOTER_ACTOR_UNAVAILABLE_MESSAGE);
  }
  return { id, email: rowEmail };
}

export function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  const [scheme, token] = authorization.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

export function quoterServiceGuard(request: NextRequest) {
  const token = bearerToken(request);
  if (!token || !quoterServiceTokenMatches(token)) return null;
  if (isQuoterFrontDoorRoute(request.nextUrl.pathname)) return null;
  return NextResponse.json(
    { message: QUOTER_SERVICE_DENIED_MESSAGE },
    { status: 403, headers: { "Cache-Control": "private, no-store" } },
  );
}

/**
 * Database handle for a verified Quoter request.
 * Reads are the front-door lookup. The draft write is create_quote_v2_draft
 * for the resolved staff actor, then the front-door read-back on that quote.
 * quote_category_field_sequence_write and both sequence tables refuse with 403.
 */
export function quoterFrontDoorDb(inner: QuoterDb, actorId: string): QuoterDb {
  return {
    async rpc(fn, args) {
      assertQuoterRpc(fn, args, actorId);
      return inner.rpc(fn, args);
    },
    from(table) {
      return {
        select(columns) {
          assertQuoterRead(table);
          return readOnly(inner.from(table).select(columns));
        },
        insert() {
          assertQuoterInsert(table);
        },
        update(values) {
          assertQuoterUpdate(table, values);
          return guardUpdate(() => inner.from(table).update(values), actorId);
        },
      };
    },
  };
}

export function assertQuoterRpc(fn: string, args: Record<string, unknown> = {}, actorId?: string) {
  if (fn === SEQUENCE_WRITE_FUNCTION || QUOTE_SEQUENCE_TABLES.has(fn)) {
    throw new QuoterServiceAuthError(403, QUOTER_SEQUENCE_WRITE_DENIED_MESSAGE);
  }
  if (fn === QUOTER_DRAFT_RPC) {
    if (!actorId || !STAFF_ACTOR_ID.test(actorId) || args.p_actor_id !== actorId) {
      throw new QuoterServiceAuthError(403, "The Quoter can only save a draft for its staff actor.");
    }
    return;
  }
  if (!QUOTER_READ_RPC.has(fn)) {
    throw new QuoterServiceAuthError(403, "The Quoter cannot call that database function.");
  }
}

function assertQuoterRead(table: string) {
  if (QUOTE_SEQUENCE_TABLES.has(table) && table !== "quote_category_field_sequence") {
    throw new QuoterServiceAuthError(403, QUOTER_SEQUENCE_WRITE_DENIED_MESSAGE);
  }
  if (!QUOTER_READ_TABLES.has(table)) {
    throw new QuoterServiceAuthError(403, "The Quoter cannot read that table.");
  }
}

function assertQuoterInsert(table: string): never {
  if (QUOTE_SEQUENCE_TABLES.has(table) || table === SEQUENCE_WRITE_FUNCTION) {
    throw new QuoterServiceAuthError(403, QUOTER_SEQUENCE_WRITE_DENIED_MESSAGE);
  }
  throw new QuoterServiceAuthError(403, "The Quoter can only write a front-door draft through create_quote_v2_draft.");
}

function assertQuoterUpdate(table: string, values: Record<string, unknown>) {
  if (QUOTE_SEQUENCE_TABLES.has(table) || table === SEQUENCE_WRITE_FUNCTION) {
    throw new QuoterServiceAuthError(403, QUOTER_SEQUENCE_WRITE_DENIED_MESSAGE);
  }
  const keys = Object.keys(values);
  if (table !== QUOTER_QUOTE_UPDATE_TABLE || keys.length === 0 || keys.some((key) => !QUOTER_QUOTE_UPDATE_COLUMNS.has(key))) {
    throw new QuoterServiceAuthError(403, "The Quoter can only write a front-door read-back on its draft quote.");
  }
}

function guardUpdate(open: () => QuoterUpdate, actorId: string): QuoterUpdate {
  const filters: Array<{ column: string; value: string }> = [];
  const chain: QuoterUpdate = {
    eq(column, value) {
      if (column === "created_by" && value !== actorId) {
        throw new QuoterServiceAuthError(403, "The Quoter can only update a draft saved for its staff actor.");
      }
      filters.push({ column, value });
      return chain;
    },
    is(column, value) {
      if (!filters.some((filter) => filter.column === "created_by" && filter.value === actorId)) {
        throw new QuoterServiceAuthError(403, "The Quoter can only update a draft saved for its staff actor.");
      }
      let query = open();
      for (const filter of filters) query = query.eq(filter.column, filter.value);
      return query.is(column, value);
    },
  };
  return chain;
}

function readOnly(query: QuoterFilter): QuoterFilter {
  return {
    eq: (column, value) => readOnly(query.eq(column, value)),
    is: (column, value) => readOnly(query.is(column, value)),
    or: (filters) => readOnly(query.or(filters)),
    in: (column, values) => readOnly(query.in(column, values)),
    order: (column, options) => readOnly(query.order(column, options)),
    limit: (count) => query.limit(count),
  };
}

function configuredTokenDigest() {
  const secret = process.env[QUOTER_SERVICE_TOKEN_ENV];
  if (typeof secret !== "string") return null;
  const trimmed = secret.trim();
  if (!trimmed) return null;
  return createHash("sha256").update(trimmed, "utf8").digest();
}
