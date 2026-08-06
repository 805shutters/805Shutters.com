import { describe, expect, it } from "vitest";
import { loadCrmActivitySnapshot } from "./backend";

type QueryResult = { data: unknown[] | null; error: { message: string } | null };

class SnapshotQuery {
  calls: string[] = [];

  constructor(private result: QueryResult) {}

  select(columns: string) {
    this.calls.push(`select:${columns}`);
    return this;
  }

  order(column: string, options: { ascending: boolean; nullsFirst?: boolean }) {
    this.calls.push(`order:${column}:${String(options.ascending)}`);
    return this;
  }

  not(column: string, operator: string, value: unknown) {
    this.calls.push(`not:${column}:${operator}:${String(value)}`);
    return this;
  }

  limit(limit: number) {
    this.calls.push(`limit:${limit}`);
    return Promise.resolve(this.result);
  }
}

describe("CRM activity snapshot loader", () => {
  it("loads bounded newest-first audit and payment streams", async () => {
    const events = [{ id: "event-1" }];
    const payments = [{ id: "payment-1" }];
    const signedContracts = [{ id: "quote-1", signed_at: "2026-08-05T20:00:00.000Z" }];
    const eventQuery = new SnapshotQuery({ data: events, error: null });
    const paymentQuery = new SnapshotQuery({ data: payments, error: null });
    const signedContractsQuery = new SnapshotQuery({ data: signedContracts, error: null });
    const supabase = {
      from(table: string) {
        return table === "crm_activity_events" ? eventQuery : table === "crm_quotes" ? signedContractsQuery : paymentQuery;
      }
    };

    const snapshot = await loadCrmActivitySnapshot(supabase as never);

    expect(snapshot).toEqual({ activityEvents: events, payments, signedContracts, warnings: [] });
    expect(eventQuery.calls).toContain("order:created_at:false");
    expect(eventQuery.calls).toContain("limit:1000");
    expect(paymentQuery.calls).toContain("order:paid_at:false");
    expect(paymentQuery.calls).toContain("limit:800");
    expect(signedContractsQuery.calls).toContain("not:signed_at:is:null");
    expect(signedContractsQuery.calls).toContain("order:signed_at:false");
  });

  it("preserves the available stream when one source fails", async () => {
    const supabase = {
      from(table: string) {
        return table === "crm_activity_events"
          ? new SnapshotQuery({ data: null, error: { message: "audit unavailable" } })
          : table === "crm_quotes"
            ? new SnapshotQuery({ data: [], error: null })
            : new SnapshotQuery({ data: [{ id: "payment-1" }], error: null });
      }
    };

    await expect(loadCrmActivitySnapshot(supabase as never)).resolves.toEqual({
      activityEvents: [],
      payments: [{ id: "payment-1" }],
      signedContracts: [],
      warnings: ["CRM updates are temporarily unavailable."]
    });
  });

  it("fails when neither source can be loaded", async () => {
    const supabase = {
      from() {
        return new SnapshotQuery({ data: null, error: { message: "unavailable" } });
      }
    };

    await expect(loadCrmActivitySnapshot(supabase as never)).rejects.toMatchObject({ status: 502 });
  });
});
