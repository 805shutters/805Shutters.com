// 805 PORT of the MTS Supabase browser client.
//
// Quote-builder table access, the quote-number RPC, and quote edge functions
// are proxied through the 805 Next.js API. The API verifies the 805 CRM session
// and uses the MTS service role key server-side so the browser never writes to
// MTS production directly.
import { createClient } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import type { Database } from "./types";

const DEFAULT_MTS_SUPABASE_URL = "https://djduaqegxwjnmjlzjdor.supabase.co";

// Public default, overridable via env. Non-quote MTS reads still use this anon
// client; the bridge keeps quote-builder authorization on the server.
const FALLBACK_MTS_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqZHVhcWVneHdqbm1qbHpqZG9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5ODkwMjYsImV4cCI6MjA4MzU2NTAyNn0.If7mgQqI-O4adZmnxJGhhhtDqD9rOh_eZ_jXO3woVk4";

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_MTS_SUPABASE_URL?.trim() || DEFAULT_MTS_SUPABASE_URL;
export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_MTS_SUPABASE_ANON_KEY?.trim() || FALLBACK_MTS_SUPABASE_ANON_KEY;

const browserStorage =
  typeof window !== "undefined" &&
  window.localStorage &&
  typeof window.localStorage.getItem === "function"
    ? window.localStorage
    : undefined;

const mtsReadClient = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: browserStorage,
    persistSession: !!browserStorage,
    autoRefreshToken: !!browserStorage,
  },
});

const bridgedTables = new Set([
  "sales_quotes",
  "sales_quote_line_items",
  "sales_quote_designs",
  "sales_quote_media",
  "sales_805_appointments",
  "quote_order_agent_queue",
  "crm_users",
]);

type Filter =
  | { method: "eq" | "neq"; column: string; value: unknown }
  | { method: "in"; column: string; value: unknown[] }
  | { method: "not"; column: string; operator: string; value: unknown };

type Order = {
  column: string;
  options?: {
    ascending?: boolean;
    nullsFirst?: boolean;
    foreignTable?: string;
    referencedTable?: string;
  };
};

type BridgeRequest =
  | {
      kind: "query";
      table: string;
      action: "select" | "insert" | "update" | "upsert" | "delete";
      values?: unknown;
      options?: Record<string, unknown>;
      select?: string;
      filters?: Filter[];
      orders?: Order[];
      limit?: number;
      single?: boolean;
      maybeSingle?: boolean;
    }
  | { kind: "rpc"; name: string; args?: Record<string, unknown> }
  | { kind: "function"; name: string; body?: Record<string, unknown> };

type BridgeResult<T = unknown> = {
  data: T | null;
  error: Error | null;
  count?: number | null;
  status?: number;
  statusText?: string;
};

type QueryAction = Extract<BridgeRequest, { kind: "query" }>["action"];

function errorFromPayload(value: unknown): Error | null {
  if (!value) return null;
  if (value instanceof Error) return value;
  const message =
    typeof value === "object" && value && "message" in value
      ? String((value as { message?: unknown }).message || "MTS quote request failed.")
      : String(value);
  const error = new Error(message);
  if (typeof value === "object" && value) Object.assign(error, value);
  return error;
}

async function crmAccessToken() {
  const crmClient = getSupabaseBrowserClient();
  const { data } = crmClient ? await crmClient.auth.getSession() : { data: { session: null } };
  return data.session?.access_token || null;
}

async function bridgeRequest<T = unknown>(body: BridgeRequest): Promise<BridgeResult<T>> {
  const token = await crmAccessToken();
  if (!token) {
    return { data: null, error: new Error("CRM session is required for MTS quote changes.") };
  }

  const response = await fetch("/api/crm/mts-quote", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      data: null,
      error: new Error(payload.message || payload.error?.message || "MTS quote request failed."),
      status: response.status,
      statusText: response.statusText,
    };
  }

  return {
    data: (payload.data ?? null) as T | null,
    error: errorFromPayload(payload.error),
    count: payload.count,
    status: payload.status,
    statusText: payload.statusText,
  };
}

class BridgeQuery<T = unknown> implements PromiseLike<BridgeResult<T>> {
  private request: Extract<BridgeRequest, { kind: "query" }>;

  constructor(table: string, action: QueryAction, values?: unknown, options?: Record<string, unknown>) {
    this.request = { kind: "query", table, action, values, filters: [], orders: [] };
    if (options) this.request.options = options;
  }

  select(columns = "*") {
    this.request.select = columns;
    return this;
  }

  eq(column: string, value: unknown) {
    this.request.filters?.push({ method: "eq", column, value });
    return this;
  }

  neq(column: string, value: unknown) {
    this.request.filters?.push({ method: "neq", column, value });
    return this;
  }

  in(column: string, value: unknown[]) {
    this.request.filters?.push({ method: "in", column, value });
    return this;
  }

  not(column: string, operator: string, value: unknown) {
    this.request.filters?.push({ method: "not", column, operator, value });
    return this;
  }

  order(column: string, options?: Order["options"]) {
    this.request.orders?.push({ column, options });
    return this;
  }

  limit(count: number) {
    this.request.limit = count;
    return this;
  }

  single() {
    this.request.single = true;
    return this;
  }

  maybeSingle() {
    this.request.maybeSingle = true;
    return this;
  }

  then<TResult1 = BridgeResult<T>, TResult2 = never>(
    onfulfilled?: ((value: BridgeResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return bridgeRequest<T>(this.request).then(onfulfilled, onrejected);
  }
}

class BridgeTable {
  constructor(private table: string) {}

  select(columns = "*") {
    return new BridgeQuery(this.table, "select").select(columns);
  }

  insert(values: unknown) {
    return new BridgeQuery(this.table, "insert", values);
  }

  update(values: unknown) {
    return new BridgeQuery(this.table, "update", values);
  }

  upsert(values: unknown, options?: Record<string, unknown>) {
    return new BridgeQuery(this.table, "upsert", values, options);
  }

  delete() {
    return new BridgeQuery(this.table, "delete");
  }
}

export const supabase = {
  auth: mtsReadClient.auth,
  from(table: string) {
    if (bridgedTables.has(table)) return new BridgeTable(table);
    return mtsReadClient.from(table as never);
  },
  rpc(name: string, args?: Record<string, unknown>) {
    if (name === "next_quote_number") {
      return bridgeRequest({ kind: "rpc", name, args });
    }
    return mtsReadClient.rpc(name as never, args as never);
  },
  functions: {
    invoke(name: string, options?: { body?: Record<string, unknown> }) {
      if (
        name === "send-quote-email" ||
        name === "send-quote-sms" ||
        name === "send-sms" ||
        name === "r2-upload"
      ) {
        return bridgeRequest({ kind: "function", name, body: options?.body });
      }
      return mtsReadClient.functions.invoke(name, options);
    },
  },
};
