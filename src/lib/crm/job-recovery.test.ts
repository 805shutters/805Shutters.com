import { describe, expect, it } from "vitest";
import { listDeletedCrmJobs, restoreDeletedCrmJob } from "./backend";

const actor = { email: "805@805shutters.com", userId: "user-1" };

describe("CRM job recovery", () => {
  it("lists the minimal recovery fields for recent job-delete tombstones", async () => {
    const filters: Array<[string, unknown]> = [];
    const row = {
      id: "job-1",
      customer_name: "Mike Shepherd",
      product_interest: "Shutters",
      meta: { deleted_at: "2026-09-06T17:00:00.000Z", delete_source: "job_delete", private_note: "retained" }
    };
    const query = {
      select() { return this; },
      eq(column: string, value: unknown) { filters.push([column, value]); return this; },
      gte(column: string, value: unknown) { filters.push([column, value]); return this; },
      order() { return this; },
      then<TResult1 = unknown>(onfulfilled?: ((value: { data: typeof row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null) {
        return Promise.resolve({ data: [row], error: null }).then(onfulfilled);
      }
    };
    const supabase = { from: () => query } as unknown as Parameters<typeof listDeletedCrmJobs>[0];

    const jobs = await listDeletedCrmJobs(supabase);

    expect(filters).toContainEqual(["meta->>delete_source", "job_delete"]);
    expect(filters.some(([column]) => column === "meta->>deleted_at")).toBe(true);
    expect(jobs).toEqual([{
      id: row.id,
      customer_name: row.customer_name,
      product_interest: row.product_interest,
      deleted_at: row.meta.deleted_at
    }]);
  });

  it("removes only job-delete metadata with a timestamp concurrency guard and records before/after activity", async () => {
    const deletedAt = "2026-09-06T17:00:00.000Z";
    const existing = {
      id: "job-1",
      customer_name: "Mike Shepherd",
      product_interest: "Shutters",
      meta: {
        deleted_at: deletedAt,
        deleted_by: "805@805shutters.com",
        deleted_by_user_id: "user-1",
        delete_source: "job_delete",
        retained_key: "keep me"
      }
    };
    let updatePayload: Record<string, unknown> | null = null;
    const updateFilters: Array<[string, unknown]> = [];
    const activity: Array<Record<string, unknown>> = [];

    class Query {
      private operation: "select" | "update" | "insert" = "select";
      constructor(private table: string) {}
      select() { return this; }
      eq(column: string, value: unknown) {
        if (this.operation === "update") updateFilters.push([column, value]);
        return this;
      }
      update(payload: Record<string, unknown>) { this.operation = "update"; updatePayload = payload; return this; }
      insert(payload: Record<string, unknown>) { this.operation = "insert"; activity.push(payload); return this; }
      async maybeSingle() {
        if (this.operation === "select") return { data: existing, error: null };
        return { data: { ...existing, ...(updatePayload || {}) }, error: null };
      }
      then<TResult1 = unknown>(onfulfilled?: ((value: { error: null }) => TResult1 | PromiseLike<TResult1>) | null) {
        return Promise.resolve({ error: null }).then(onfulfilled);
      }
    }
    const supabase = { from: (table: string) => new Query(table) } as unknown as Parameters<typeof restoreDeletedCrmJob>[0];

    const result = await restoreDeletedCrmJob(supabase, existing.id, deletedAt, actor);

    expect(updatePayload).toEqual({ meta: { retained_key: "keep me" } });
    expect(updateFilters).toContainEqual(["id", existing.id]);
    expect(updateFilters).toContainEqual(["meta->>delete_source", "job_delete"]);
    expect(updateFilters).toContainEqual(["meta->>deleted_at", deletedAt]);
    expect(updateFilters).toContainEqual(["meta", JSON.stringify(existing.meta)]);
    expect(result.job.meta).toEqual({ retained_key: "keep me" });
    expect(activity[0]).toMatchObject({ entity_type: "job", entity_id: existing.id, action: "restore" });
    expect(activity[0].before_data).toEqual(existing);
    expect(activity[0].after_data).toMatchObject({ meta: { retained_key: "keep me" } });
  });

  it("refuses tombstones created by any other deletion workflow", async () => {
    const query = {
      select() { return this; },
      eq() { return this; },
      async maybeSingle() {
        return { data: { id: "job-1", meta: { deleted_at: "2026-09-06T17:00:00.000Z", delete_source: "customer_file_delete" } }, error: null };
      }
    };
    const supabase = { from: () => query } as unknown as Parameters<typeof restoreDeletedCrmJob>[0];

    await expect(restoreDeletedCrmJob(supabase, "job-1", "2026-09-06T17:00:00.000Z", actor))
      .rejects.toThrow("cannot be restored here");
  });

  it("does not overwrite metadata changed concurrently after the tombstone was read", async () => {
    const deletedAt = "2026-09-06T17:00:00.000Z";
    const existing = {
      id: "job-1",
      meta: { deleted_at: deletedAt, delete_source: "job_delete", retained_key: "original" }
    };
    let operation: "select" | "update" | "insert" = "select";
    const activity: Array<Record<string, unknown>> = [];
    const query = {
      select() { return this; },
      eq() { return this; },
      update() { operation = "update"; return this; },
      insert(payload: Record<string, unknown>) { operation = "insert"; activity.push(payload); return this; },
      async maybeSingle() {
        return operation === "select" ? { data: existing, error: null } : { data: null, error: null };
      },
      then<TResult1 = unknown>(onfulfilled?: ((value: { error: null }) => TResult1 | PromiseLike<TResult1>) | null) {
        return Promise.resolve({ error: null }).then(onfulfilled);
      }
    };
    const supabase = { from: () => query } as unknown as Parameters<typeof restoreDeletedCrmJob>[0];

    await expect(restoreDeletedCrmJob(supabase, existing.id, deletedAt, actor))
      .rejects.toThrow("changed before it could be restored");
    expect(activity).toEqual([]);
  });
});
