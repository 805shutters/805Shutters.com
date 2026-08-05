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

  limit(limit: number) {
    this.calls.push(`limit:${limit}`);
    return Promise.resolve(this.result);
  }
}

describe("CRM activity snapshot loader", () => {
  it("loads bounded newest-first audit and payment streams", async () => {
    const events = [{ id: "event-1" }];
    const payments = [{ id: "payment-1" }];
    const eventQuery = new SnapshotQuery({ data: events, error: null });
    const paymentQuery = new SnapshotQuery({ data: payments, error: null });
    const supabase = {
      from(table: string) {
        return table === "crm_activity_events" ? eventQuery : paymentQuery;
      }
    };

    const snapshot = await loadCrmActivitySnapshot(supabase as never);

    expect(snapshot).toEqual({ activityEvents: events, payments, warnings: [] });
    expect(eventQuery.calls).toContain("order:created_at:false");
    expect(eventQuery.calls).toContain("limit:1000");
    expect(paymentQuery.calls).toContain("order:paid_at:false");
    expect(paymentQuery.calls).toContain("limit:800");
  });

  it("preserves the available stream when one source fails", async () => {
    const supabase = {
      from(table: string) {
        return table === "crm_activity_events"
          ? new SnapshotQuery({ data: null, error: { message: "audit unavailable" } })
          : new SnapshotQuery({ data: [{ id: "payment-1" }], error: null });
      }
    };

    await expect(loadCrmActivitySnapshot(supabase as never)).resolves.toEqual({
      activityEvents: [],
      payments: [{ id: "payment-1" }],
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
