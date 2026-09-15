// Exercises the production QuoteBuilder and pricing effects with a local database.
import { setMeasurementDatabase } from "./measurement-client";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, QueryCache } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { QuoteBuilder } from "@mts/components/crm/quote-builder/QuoteBuilder";
import { QuoteBuilderDatabaseProvider, type QuoteBuilderDatabase } from "@mts/integrations/supabase/quoteBuilderDatabase";
import { useQuoteBuilderStore } from "@mts/stores/quoteBuilderStore";
import { PortalContainerContext } from "@mts/lib/portal-container";
import "../../src/app/globals.css";
import "../../src/mts-quote/mts-quote.css";

type Row = Record<string, any>;
const params = new URLSearchParams(location.search);
const initial = {
  sales_quotes: [{ id: "measurement-quote", account_id: "fixture", customer_name: "Measurement regression", status: "draft", total_amount: 0, quote_letter: "A", quote_v2_backend: false }],
  sales_quote_line_items: [{ id: "measurement-line", quote_id: "measurement-quote", room_name: "Kitchen", product_type: "Mini Blinds", width_whole: 0, width_fraction: "0", height_whole: 0, height_fraction: "0", quantity: 1, sort_order: 0, selected_design_id: "measurement-design" }],
  sales_quote_designs: [{ id: "measurement-design", line_item_id: "measurement-line", variant: "A", supplier: "Norman", product_type: "Mini Blinds", material: "CityLights Cordless Aluminum Blinds", unit_price: 0, options_json: { catalog_product_id: "citylights_aluminum", catalog_program_id: "citylights_aluminum_1in_slats_cordless_pgusa", catalog_manufacturer: "Norman", catalog_product_type: "Mini Blinds", quote_lab_product_id: "citylights_aluminum", quote_lab_program_id: "citylights_aluminum_1in_slats_cordless_pgusa", base_price: 0, surcharge_total: 0, pricing_method: "none", pricing_block_reason: "invalid_dimensions", pricing_calculation_status: "invalid", pricing_input_width_whole: 0, pricing_input_width_fraction: "0", pricing_input_height_whole: 0, pricing_input_height_fraction: "0" } }],
};
if (params.get("stale") === "1") {
  Object.assign(initial.sales_quote_line_items[0], { width_whole: 36, height_whole: 60 });
  Object.assign(initial.sales_quote_designs[0].options_json, { slat_size: '1"' });
}
const storageKey = `measurement-fixture-${params.get("case") || "default"}`;
const tables: Record<string, Row[]> = JSON.parse(localStorage.getItem(storageKey) || "null") || structuredClone(initial);
let failNext = params.get("fail") === "1";
let notify = () => {};
const database = {
  auth: { getSession: async () => ({ data: { session: null }, error: null }) },
  from(table: string) {
    const filters: Array<(row: Row) => boolean> = [];
    let operation = "select", patch: Row = {}, one = false;
    const query = {
      select: (_columns?: string) => query,
      eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
      in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return query; },
      order: () => query,
      single: () => { one = true; return query; },
      update: (value: Row) => { operation = "update"; patch = value; return query; },
      upsert: (value: Row) => { operation = "upsert"; patch = value; return query; },
      async then(resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) {
        try {
          await new Promise(r => setTimeout(r, 80));
          let rows = (tables[table] || []).filter(row => filters.every(filter => filter(row)));
          if (operation === "update" && "width_whole" in patch && failNext) {
            failNext = false;
            return resolve({ data: null, error: new Error("Test save interrupted") });
          }
          if (operation === "upsert") {
            rows = tables[table].filter(row => row.line_item_id === patch.line_item_id && row.variant === patch.variant);
          }
          if (operation !== "select") {
            rows.forEach(row => Object.assign(row, structuredClone(patch)));
            localStorage.setItem(storageKey, JSON.stringify(tables));
            notify();
          }
          return resolve({ data: structuredClone(one ? rows[0] : rows), error: one && !rows[0] ? new Error("No saved row returned") : null });
        } catch (error) { return reject?.(error); }
      },
    };
    return query;
  },
} as unknown as QuoteBuilderDatabase;
setMeasurementDatabase(database);
// Catalog is unrelated to the existing-line save. No production requests leave this fixture.
window.fetch = async () => new Response(JSON.stringify({ products: [] }), { headers: { "Content-Type": "application/json" } });
useQuoteBuilderStore.getState().setActiveQuote("measurement-quote");
const client = new QueryClient({ queryCache: new QueryCache({ onError: (error) => console.error(error) }), defaultOptions: { queries: { retry: false } } });
function Fixture() {
  const [, update] = useState(0);
  const [scope, setScope] = useState<HTMLDivElement | null>(null);
  notify = () => update(n => n + 1);
  return <QuoteBuilderDatabaseProvider database={database} isolated authoritativeV2={false}>
    <QueryClientProvider client={client}><PortalContainerContext.Provider value={scope}>
      <div ref={setScope} className="mts-quote-scope"><QuoteBuilder /><Toaster />
        <pre data-testid="persisted-state">{JSON.stringify(tables)}</pre>
      </div>
    </PortalContainerContext.Provider></QueryClientProvider>
  </QuoteBuilderDatabaseProvider>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
