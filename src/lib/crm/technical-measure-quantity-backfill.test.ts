import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("technical measure quantity backfill safeguards", () => {
  const source = readFileSync("src/lib/crm/technical-measure-quantity-backfill.ts", "utf8");
  const route = readFileSync("src/app/api/crm/technical-measures/quantity-backfill/route.ts", "utf8");

  it("limits mutation to draft forms without addendums or existing provenance", () => {
    expect(source).toContain('form.status !== "draft"');
    expect(source).toContain("addendums.length");
    expect(source).toContain("provenance.length");
    expect(source).toContain("quantitiesMatch");
  });

  it("records a rollback snapshot before inserting expanded lines", () => {
    const snapshotIndex = source.indexOf("technical_measure_quantity_backfill_rollback");
    const insertIndex = source.indexOf(".upsert(extraRows");
    expect(snapshotIndex).toBeGreaterThan(0);
    expect(insertIndex).toBeGreaterThan(snapshotIndex);
    expect(source).toContain("original_lines: item.formLines");
    expect(source).toContain("inserted_quote_line_item_ids");
  });

  it("requires authenticated CRM access and an exact mutation confirmation", () => {
    expect(route).toContain("requireCrmUser(request)");
    expect(route).toContain("EXPAND_DRAFT_TECHNICAL_MEASURE_QUANTITIES");
  });
});
