import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

/**
 * Server-to-server identity for the Quoter bot.
 * The secret is QUOTER_SERVICE_TOKEN in the Vercel project environment or the
 * Grok vault. This module never creates a secret and never reads a crm_profiles row.
 * Comparison hashes both sides and fails closed when the environment value is missing.
 */

export const QUOTER_SERVICE_TOKEN_ENV = "QUOTER_SERVICE_TOKEN";

export const QUOTER_SERVICE_EMAIL = "quoter-service@805shutters.invalid";

export const QUOTER_SERVICE_DENIED_MESSAGE = "The Quoter service can only use the quote front door.";

export const QUOTER_SEQUENCE_WRITE_DENIED_MESSAGE = "The Quoter cannot change the quote field sequence.";

/** The only CRM routes a matching Quoter token may call. Exact paths, not a prefix. */
export const QUOTER_FRONT_DOOR_ROUTES = [
  "/api/crm/quote-front-door/customers",
  "/api/crm/quote-front-door/next-field",
  "/api/crm/quote-front-door/validate",
  "/api/crm/quote-front-door/read-back",
  "/api/crm/quote-front-door/draft",
] as const;

export type QuoterFrontDoorRoute = (typeof QUOTER_FRONT_DOOR_ROUTES)[number];

const QUOTER_READ_RPC = new Set(["quote_next_required_field", "quote_validate_tapped_value"]);

const QUOTER_READ_TABLES = new Set([
  "crm_customers",
  "crm_jobs",
  "sales_805_appointments",
  "crm_calendar_events",
  "quote_category_field_sequence",
  "crm_quote_front_door_drafts",
]);

const QUOTER_DRAFT_TABLE = "crm_quote_front_door_drafts";

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

export type QuoterDb = {
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }>;
  from(table: string): {
    select(columns: string): QuoterFilter;
    insert(row: Record<string, unknown>): {
      select(columns: string): {
        single(): Promise<{ data: { id: string } | null; error: { message: string } | null }>;
      };
    };
  };
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
 * Reads are limited to the front-door lookup. The only write is a draft insert.
 * quote_category_field_sequence_write and both sequence tables refuse with 403.
 */
export function quoterFrontDoorDb(inner: QuoterDb): QuoterDb {
  return {
    async rpc(fn, args) {
      assertQuoterRpc(fn);
      return inner.rpc(fn, args);
    },
    from(table) {
      return {
        select(columns) {
          assertQuoterRead(table);
          return readOnly(inner.from(table).select(columns));
        },
        insert(row) {
          assertQuoterInsert(table, row);
          const inserted = inner.from(table).insert(row);
          return {
            select(columns) {
              const selected = inserted.select(columns);
              return { single: () => selected.single() };
            },
          };
        },
      };
    },
  };
}

export function assertQuoterRpc(fn: string) {
  if (fn === SEQUENCE_WRITE_FUNCTION || QUOTE_SEQUENCE_TABLES.has(fn)) {
    throw new QuoterServiceAuthError(403, QUOTER_SEQUENCE_WRITE_DENIED_MESSAGE);
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

function assertQuoterInsert(table: string, row: Record<string, unknown>) {
  if (QUOTE_SEQUENCE_TABLES.has(table) || table === SEQUENCE_WRITE_FUNCTION) {
    throw new QuoterServiceAuthError(403, QUOTER_SEQUENCE_WRITE_DENIED_MESSAGE);
  }
  if (table !== QUOTER_DRAFT_TABLE) {
    throw new QuoterServiceAuthError(403, "The Quoter can only write front-door draft rows.");
  }
  if (row.status !== "draft") {
    throw new QuoterServiceAuthError(403, "The Quoter can only write a draft.");
  }
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
