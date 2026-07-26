import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const seed = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260726131000_seed_quote_v2_wholesale_phase1_review.sql",
  ),
  "utf8",
);
const lotusCatalog = JSON.parse(
  readFileSync(
    resolve(
      process.cwd(),
      "src/lib/quote/catalog/lotus-west-a26.catalog.json",
    ),
    "utf8",
  ),
) as {
  sources: Array<{ file: string; sha256: string }>;
  products: Array<{
    id: string;
    programs: Array<{
      id: string;
      grid?: { widths: number[]; heights: number[]; costs: Array<Array<number | null>> };
    }>;
  }>;
};

describe("Quote V2 Phase 1 wholesale review seed", () => {
  it("pins the exact Lotus source and preserves every priced and unavailable cell", () => {
    const source = lotusCatalog.sources.find((entry) => entry.file === "Lotus.pdf");
    expect(source?.sha256).toBe(
      "4e9aba91a601e1212a3e8a1531c361caf033c28ef6ca1fdac3ad6247502a982f",
    );
    const product = lotusCatalog.products.find(
      (entry) => entry.id === "lotus_faux_wood_blinds",
    );
    const program = product?.programs.find(
      (entry) => entry.id === "lotus_flx_2in_bright_white_custom",
    );
    expect(program?.grid).toBeDefined();
    const cells = program!.grid!.costs.flat();
    expect(program!.grid!.widths.length * program!.grid!.heights.length).toBe(
      119,
    );
    expect(cells).toHaveLength(119);
    expect(cells.filter((cost) => cost != null)).toHaveLength(111);
    expect(cells.filter((cost) => cost == null)).toHaveLength(8);

    const cellInsert = seed.match(
      /insert into public\.sales_quote_v2_wholesale_price_cells[\s\S]*?\) as generated\([\s\S]*?\)\non conflict \(program_id, width_ceiling, height_ceiling\)/i,
    )?.[0];
    expect(cellInsert).toBeDefined();
    expect(cellInsert?.match(/'[0-9a-f]{64}'/g)).toHaveLength(119);
    expect(cellInsert?.match(/\n  'priced',/g)).toHaveLength(111);
    expect(cellInsert?.match(/\n  'unavailable',/g)).toHaveLength(8);
  });

  it("keeps every Phase 1 version unpublished and every evidence gap explicit", () => {
    expect(seed).toContain(
      "'lotus-west-a26-v1-phase1-faux-wood',\n  'lotus_faux_wood_blinds',\n  'review'",
    );
    expect(seed).toContain(
      "'norman-805-faux-wood-phase1',\n  'faux_wood_blinds',\n  'draft'",
    );
    expect(seed).toContain("'documented_not_published'");
    expect(seed).toContain("'account_scope_unverified'");
    expect(
      seed.match(/current_805_product_factor_unverified/g),
    ).toHaveLength(2);
    expect(seed).toContain(
      "The source belongs to a different dealer account and cannot authorize current 805 wholesale cost.",
    );
    expect(seed).toContain(
      "The observed Soft White faux-wood cart price conflicts with the cost book",
    );
    expect(seed).toContain(
      "array['dealer_cost','options','freight','other_cost']::text[]",
    );
    expect(seed).not.toMatch(
      /(?:insert|update)[\s\S]{0,240}lifecycle\s*=\s*'published'/i,
    );
    expect(seed).toMatch(
      /set content_sha256 =\s*public\.compute_quote_v2_wholesale_version_content_sha256/i,
    );
  });

  it("does not seed Norman faux-wood cost cells from other-account or Roller factors", () => {
    const priceCellInsertCount = (
      seed.match(
        /insert into public\.sales_quote_v2_wholesale_price_cells/gi,
      ) ?? []
    ).length;
    expect(priceCellInsertCount).toBe(1);
    expect(seed).toContain(
      "'norman-dealer-pricing-snapshot-2026-07-20'",
    );
    expect(seed).toContain("'norman-805-live-roller-portal-2026-07-21'");
    expect(seed).toContain(
      "No exact current-805 dealer-cost fixture covers SmartPrivacy or Ultimate faux wood",
    );
    expect(seed).not.toContain("norman_continental_blinds_shades_freight");
    expect(seed).not.toMatch(
      /(?:smartprivacy|premium|ultimate)[\s\S]{0,320}(?:cost_cents|0\.3(?:0|3|297))/i,
    );
  });
});
