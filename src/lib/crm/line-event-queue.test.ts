import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { enqueueManufacturerLineEvent, LINE_EVENT_MANUFACTURERS, LINE_EVENT_SCHEMA_ID } from "@/lib/crm/line-event-queue";

describe("manufacturer line-event wake", () => {
  it("calls enqueue once and does not wake by itself", async () => {
    const rpc = vi.fn(async () => ({ data: { duplicate: false, wake: { woken: false, reason: "wake_disabled" } }, error: null }));
    await enqueueManufacturerLineEvent({ rpc }, {
      lineId: "30000000-0000-4000-8000-000000000020",
      version: 3,
      manufacturer: "norman",
      payload: { room: "Living" },
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("enqueue_line_event", {
      p_line_id: "30000000-0000-4000-8000-000000000020",
      p_version: 3,
      p_manufacturer: "norman",
      p_payload: { room: "Living" },
    });
    expect(LINE_EVENT_SCHEMA_ID).toBe("805-line-event/v1");
    expect(LINE_EVENT_MANUFACTURERS).toEqual(["norman", "onyx", "sundance", "lotus"]);
  });

  it("is a documented no-op with no outbound call", () => {
    const source = readFileSync("src/lib/crm/line-event-queue.ts", "utf8");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(source).toContain("wake_line_event_worker");
    expect(source).toContain("documented no-op");
    expect(code).not.toMatch(/fetch\(|telegram|twilio|pg_net|https?:\/\//i);
    expect(code.match(/\.rpc\(/g)).toHaveLength(1);
  });
});
