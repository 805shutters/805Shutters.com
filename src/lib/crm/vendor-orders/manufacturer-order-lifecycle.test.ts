import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const route = fs.readFileSync(
  path.join(root, "src/app/api/crm/vendor-order-tasks/[id]/route.ts"),
  "utf8",
);
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/20260727153000_harden_manufacturer_order_queue.sql"),
  "utf8",
);

describe("manufacturer order lifecycle safety", () => {
  it("requires review-ready state and a manufacturer confirmation number", () => {
    expect(route).toContain('confirm: { from: ["review_ready"], to: "order_confirmed" }');
    expect(route).toContain("manufacturer order or confirmation number");
    expect(route).toContain("manufacturer_order_ref");
  });

  it("audits a manual ordered-state bypass without inventing manufacturer confirmation evidence", () => {
    expect(route).toContain(
      'bypass: { from: ["needs_input", "queued", "processing", "review_ready", "failed"], to: "cancelled" }',
    );
    expect(route).toContain('jobResult.data?.status !== "ordered" && quoteResult.data?.status !== "ordered"');
    expect(route).toContain("Mark the job or quote ordered before bypassing the packet workflow");
    expect(route).toContain("packet workflow was bypassed because the job is already marked ordered");
    expect(route).toContain("action: `vendor_order.${action}`");
  });

  it("never exposes an agent action that places or submits an order", () => {
    expect(route).toContain('auto_order: { from: ["needs_input", "queued", "failed"], to: "queued" }');
    expect(route).toContain("review-only agent will validate the packet before entering a saved draft");
    expect(route).not.toMatch(/action === ["'](?:place|submit|checkout)["']/);
    expect(migration).toContain("'order_confirmed'");
    expect(migration).not.toContain("'order_placed'");
  });

  it("supersedes older source revisions without deleting their audit history", () => {
    expect(migration).toContain("'superseded'");
    expect(migration).toContain("superseded_at");
    expect(migration).toContain("source_revision");
  });
});
