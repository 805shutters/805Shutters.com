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

  it("does not permit placed, ordered, or submitted queue states", () => {
    const check = migration.match(/check \(status in \(([^)]+)\)\)/)?.[1] || "";
    expect(check).toContain("'review_ready'");
    expect(check).not.toMatch(/'placed'|'ordered'|'submitted'/);
  });
});
