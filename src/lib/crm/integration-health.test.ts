import { describe, expect, it, vi } from "vitest";
import { observeIntegration, loadIntegrationHealth } from "./integration-health";

describe("integration processing evidence", () => {
  it("records attempts and successful completion with one correlation ID", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const result = await observeIntegration({ from: () => ({ insert }) } as never, "order-cogs", async () => ({ processed: 0 }));
    expect(result).toEqual({ processed: 0 });
    const events = insert.mock.calls.map(([event]) => event);
    expect(events.map(event => event.metadata.state)).toEqual(["running", "succeeded"]);
    expect(events[0].entity_id).toBe(events[1].entity_id);
  });
  it("retains the processor failure without persisting arbitrary provider text", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const failure = new Error("synthetic-provider-secret");
    await expect(observeIntegration({ from: () => ({ insert }) } as never, "completed-report-filing", async () => { throw failure; })).rejects.toBe(failure);
    expect(insert.mock.calls[1][0].metadata.state).toBe("failed");
    expect(JSON.stringify(insert.mock.calls)).not.toContain("synthetic-provider-secret");
  });
  it("reports health-store outages as unavailable, never zero or success", async () => {
    const health = await loadIntegrationHealth({ from: () => { throw new Error("offline"); } } as never);
    expect(health).toHaveLength(3);
    expect(health.every(source => source.state === "unavailable" && source.lastSuccessAt === null)).toBe(true);
  });
});
