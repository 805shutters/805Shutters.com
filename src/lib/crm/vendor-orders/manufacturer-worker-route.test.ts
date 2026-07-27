import fs from "node:fs";
import { describe, expect, it } from "vitest";

const route = fs.readFileSync(
  "src/app/api/crm/manufacturer-order-worker/route.ts",
  "utf8",
);

describe("manufacturer ordering worker route", () => {
  it("claims only the requested queued task and preserves manufacturer identity", () => {
    expect(route).toContain('"crm_vendor_order_drafts"');
    expect(route).toContain('"external_task_id"');
    expect(route).toContain("record_id: durable.id");
    expect(route).toContain('current.status !== "queued"');
    expect(route).toContain("requestedManufacturer");
    expect(route).toContain("manufacturer.toLowerCase() !== requestedManufacturer.toLowerCase()");
    expect(route).toContain('status: "processing"');
  });

  it("enriches Onyx tasks from their customer-file packets", () => {
    expect(route).toContain('manufacturer === "Onyx"');
    expect(route).toContain("onyxPackets");
    expect(route).toContain('"manufacturer_order_packet"');
  });

  it("only completes as review-ready or failed", () => {
    expect(route).toContain('body.status === "review_ready" || body.status === "failed"');
    expect(route).toContain("(!recordId && !formId)");
    expect(route).not.toMatch(/status\s*===\s*["'](?:placed|ordered|submitted)["']/);
  });
});
