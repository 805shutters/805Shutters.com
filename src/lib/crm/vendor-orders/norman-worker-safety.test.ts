import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const worker = fs.readFileSync(path.join(root, "scripts/run-norman-roller-order-draft.mjs"), "utf8");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/20260722132000_create_vendor_order_drafts.sql"), "utf8");

describe("Norman order worker safety boundary", () => {
  it("blocks all known final-order controls and only completes at review-ready", () => {
    expect(worker).toMatch(/check\\s\*out\|checkout/);
    expect(worker).toContain("submit\\s+order");
    expect(worker).toContain("place\\s+order");
    expect(worker).toContain('status: "review_ready"');
    expect(worker).toContain('safety: "saved_draft_only"');
  });

  it("uses the protected 805 worker endpoint rather than a direct database credential", () => {
    expect(worker).toContain("https://www.805shutters.com/api/crm/manufacturer-order-worker");
    expect(worker).toContain("805-norman-worker-secret");
    expect(worker).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(worker).not.toContain("djduaqegxwjnmjlzjdor");
    expect(worker).not.toContain('from("crm_vendor_order_drafts")');
  });

  it("attaches to the user's authenticated Chrome session without reading portal credentials or cookies", () => {
    expect(worker).toContain("chromium.connectOverCDP");
    expect(worker).toContain("authenticatedManufacturerContext");
    expect(worker).not.toContain("chromium.launch");
    expect(worker).not.toContain("NORMAN_USERNAME");
    expect(worker).not.toContain("NORMAN_PASSWORD");
    expect(worker).not.toContain("context.cookies");
    expect(worker.indexOf("const context = await authenticatedManufacturerContext(requestedManufacturer)")).toBeLessThan(
      worker.indexOf("const task = await claimTask(taskId, requestedManufacturer)")
    );
  });

  it("provides a loopback-only deliberate launch bridge", () => {
    expect(worker).toContain('"127.0.0.1"');
    expect(worker).toContain('url.pathname !== "/start"');
    expect(worker).toContain("isLoopbackAddress");
    expect(worker).toContain("Review-only safety is enforced");
    expect(worker).toContain("a-zA-Z0-9:_-");
  });

  it("stores approved queues and prompts for login before claiming portal work", () => {
    expect(worker).toContain('Onyx: "https://admin.onyxshutters.com/OrderList.aspx"');
    expect(worker).toContain('Lotus: "https://www.lotusblind.com/"');
    expect(worker).toContain('Polar: "https://polarshades.picbusiness.com/"');
    expect(worker).toContain("LOGIN_REQUIRED");
    expect(worker).toContain("I signed in — retry");
  });

  it("supports verified Onyx packets while blocking unknown material mappings", () => {
    expect(worker).toContain("prepareOnyxPortalDraft");
    expect(worker).toContain('packet.allowedAction !== "draft_entry_only"');
    expect(worker).toContain("!packet.portalMaterial");
    expect(worker).toContain("An Onyx draft already exists");
    expect(worker).toContain('"ctl00_mainCopy_dwnShape"');
    expect(worker).toContain('"ctl00_mainCopy_dwnFrameNum"');
    expect(worker).toContain('"ctl00$mainCopy$rdWidthType"');
    expect(worker).toContain('"ctl00$mainCopy$rdHingeColor"');
    expect(worker).toContain('"ctl00_mainCopy_txtItemNote"');
    expect(worker).toContain("French-door, specialty-shape, and extension Onyx lines require");
  });

  it("does not permit placed, ordered, or submitted queue states", () => {
    const check = migration.match(/check \(status in \(([^)]+)\)\)/)?.[1] || "";
    expect(check).toContain("'review_ready'");
    expect(check).not.toMatch(/'placed'|'ordered'|'submitted'/);
  });
});
