import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CrmQuoteDesign, CrmQuoteLineItem } from "./types";
import * as publicQuote from "./public-quote";
import { InstallerFormClient } from "@/app/installer-form/[token]/InstallerFormClient";
import {
  buildInstallerLineSnapshots,
  buildInstallerFormEmail,
  buildInstallerFormPdf,
  ensureInstallerForm,
  loadInstallerFormByToken,
  type InstallerFormRow,
} from "./installer-forms";

afterEach(() => vi.restoreAllMocks());

function sourceLine(id: string, productId: string, manufacturer?: string): CrmQuoteLineItem {
  return {
    id, created_at: "", updated_at: "", quote_id: "quote", width_in: 36, height_in: 48, sort_order: 0, notes: null, room: id, quantity: 1, selected_design_id: `${id}-A`, discount_percent: 0,
    designs: [{
      created_at: "", updated_at: "", line_item_id: id, program_id: null, fabric: null,
      wholesale_unit_price: null, price_breakdown: {}, priced_at: null, notes: null,
      id: `${id}-A`, label: "A", sort_order: 0, product_id: productId,
      price_status: "ok", unit_price: 1234.56, surcharges: [], motorization: [],
      details: manufacturer ? { quote_v2_customer_configuration: { manufacturerId: manufacturer, selections: {} } } : {},
    } as unknown as CrmQuoteDesign],
  };
}
function publicLines(sources: CrmQuoteLineItem[], legacy = false) {
  return { lines: sources.flatMap((line) => publicQuote.expandPublicQuoteLine(publicQuote.projectLine(line, legacy))) };
}
function formWith(lines: InstallerFormRow["line_snapshot"]): InstallerFormRow {
  return {
    id: "form", quote_id: "quote", job_id: "job", public_token: "token", status: "sent",
    customer_snapshot: { name: "Sample Customer", address: "Sample address", phone: null, email: null, quoteNumber: "SAMPLE" },
    line_snapshot: lines, cod_original: 100, cod_adjusted: 100, cod_withheld: 0,
    issues: [], accepted: false, signer_name: null, signed_at: null,
    meta: { customer_balance: {
      schema: "805_installer_customer_balance_v1", contract_id: "contract", contract_total: 200,
      recorded_payments_total: 100, payment_record_count: 1, credits_in_total: 0, credits_out_total: 0,
      remaining_customer_balance: 100, contract_signed_at: "2026-10-23T12:00:00Z", calculated_at: "2026-10-23T12:00:00Z",
    } },
  };
}

describe("selected manufacturers in installer packets", () => {
  it("retains each selected V2 manufacturer, including Sundance and future suppliers", () => {
    const sources = ["Norman", "Onyx", "Lotus", "Sundance", "Polar", "Future Supplier"].map((name) => sourceLine(name, "roller", name));
    const pub = publicLines(sources);
    expect(pub.lines.every((line) => !line.options.some((option) => /manufacturer|supplier/i.test(option)))).toBe(true);
    expect(buildInstallerLineSnapshots(pub, sources).map((line) => line.manufacturerName))
      .toEqual(["Norman", "Onyx", "Lotus", "Sundance", "Polar", "Future Supplier"]);
  });

  it("uses the exact catalog product for original CRM designs and ignores unsold alternatives", () => {
    const sources = [sourceLine("a", "roller"), sourceLine("b", "onyx_shutters"), sourceLine("c", "lotus_mini_blinds")];
    sources[0].designs.push({ ...sources[1].designs[0], id: "unsold", label: "B" });
    expect(buildInstallerLineSnapshots(publicLines(sources), sources).map((line) => line.manufacturerName)).toEqual(["Norman", "Onyx", "Lotus"]);
  });

  it("uses legacy saved suppliers instead of generic Norman category mappings", () => {
    const source = sourceLine("legacy", "roller");
    source.designs[0].price_breakdown = {
      source: "mts_805_bookkeeping", details: [{ label: "Supplier", value: "Sundance" }],
    };
    expect(buildInstallerLineSnapshots(publicLines([source], true), [source])[0].manufacturerName).toBe("Sundance");
    source.designs[0].price_breakdown = { source: "mts_805_bookkeeping", details: [] };
    expect(buildInstallerLineSnapshots(publicLines([source], true), [source])[0].manufacturerName).toBeNull();
  });

  it("labels manufacturers per billed legacy design when a combined row has different suppliers", () => {
    const source = sourceLine("legacy", "roller");
    source.designs[0].price_breakdown = { source: "mts_805_bookkeeping", details: [{ label: "Supplier", value: "Lotus" }] };
    source.designs.push({ ...source.designs[0], id: "legacy-B", label: "B", sort_order: 1,
      price_breakdown: { source: "mts_805_bookkeeping", details: [{ label: "Supplier", value: "Onyx" }] } });
    expect(buildInstallerLineSnapshots(publicLines([source], true), [source])[0].manufacturerName).toBe("A: Lotus; B: Onyx");
  });

  it("keeps the manufacturer on each expanded opening and preserves customer money", () => {
    const source = sourceLine("a", "roller", "Sundance");
    source.quantity = 2;
    const pub = publicLines([source]);
    const snapshots = buildInstallerLineSnapshots(pub, [source]);
    expect(snapshots.map((line) => line.manufacturerName)).toEqual(["Sundance", "Sundance"]);
    expect(snapshots.map((line) => line.lineTotal)).toEqual(pub.lines.map((line) => line.lineTotal));
    expect(snapshots.map((line) => line.quantity)).toEqual([1, 1]);
  });

  it("persists manufacturers and carries them through the sent PDF, email and price-redacted token form", async () => {
    const sources = [sourceLine("Living room", "roller", "Norman"), sourceLine("Bedroom", "onyx_shutters", "Onyx"), sourceLine("Office", "roller", "Lotus"), sourceLine("Kitchen", "roller", "Sundance")];
    vi.spyOn(publicQuote, "ensureShareToken").mockResolvedValue({ token: "share" } as never);
    vi.spyOn(publicQuote, "loadPublicQuoteByToken").mockResolvedValue({ ...publicLines(sources), customerName: "Sample Customer", balanceDue: 100 } as publicQuote.PublicQuote);
    let saved: InstallerFormRow | null = null;
    const db = { from: (table: string) => {
      const query = {
        select: () => query, eq: () => query,
        maybeSingle: async () => ({ data: table === "crm_installer_forms" ? saved : { job_id: "job" } }),
        upsert: (row: InstallerFormRow) => { saved = { ...formWith(row.line_snapshot), ...row }; return query; },
        single: async () => ({ data: saved }),
        then: (resolve: (result: unknown) => unknown) => Promise.resolve({ data: sources }).then(resolve),
      };
      return query;
    } } as unknown as SupabaseClient;
    const savedForm = await ensureInstallerForm(db, "quote");
    expect(savedForm.line_snapshot.map((line) => line.manufacturerName)).toEqual(["Norman", "Onyx", "Lotus", "Sundance"]);
    const balanced = { ...savedForm, meta: formWith([]).meta };
    const pdf = buildInstallerFormPdf(balanced, "https://example.com/form").toString("latin1");
    const email = buildInstallerFormEmail(balanced, "https://example.com/form");
    const publicForm = await loadInstallerFormByToken(db, "token");
    const markup = renderToStaticMarkup(createElement(InstallerFormClient, { form: publicForm! }));
    for (const name of ["Norman", "Onyx", "Lotus", "Sundance"]) {
      expect(pdf).toContain(`Manufacturer: ${name}`);
      expect(email.text).toContain(`Manufacturer: ${name}`);
      expect(email.html).toContain(`Manufacturer: ${name}`);
      expect(markup).toContain(`<strong>Manufacturer:</strong> ${name}`);
    }
    expect(pdf).not.toContain("1234.56");
    expect(email.text).not.toContain("1234.56");
    expect(publicForm!.lines.every((line) => !("lineTotal" in line))).toBe(true);
  });

  it("leaves delivered snapshots intact instead of resending or rewriting older packets", async () => {
    const existing = formWith([]);
    const db = { from: () => {
      const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: existing }) };
      return query;
    } } as unknown as SupabaseClient;
    const load = vi.spyOn(publicQuote, "loadPublicQuoteByToken");
    expect(await ensureInstallerForm(db, "quote")).toBe(existing);
    expect(load).not.toHaveBeenCalled();
  });

  it("renders an explicit fallback for old snapshots and escapes manufacturer text in HTML", () => {
    const source = sourceLine("sample", "missing-product");
    const lines = buildInstallerLineSnapshots(publicLines([source]), [source]);
    const form = formWith(lines);
    expect(buildInstallerFormPdf(form, "url").toString("latin1")).toContain("Manufacturer: Not specified");
    lines[0].manufacturerName = "Supplier <special>";
    expect(buildInstallerFormEmail(form, "url").html).toContain("Supplier &lt;special&gt;");
    delete lines[0].manufacturerName;
    expect(buildInstallerFormEmail(form, "url").text).toContain("Manufacturer: Not specified");
  });
});
