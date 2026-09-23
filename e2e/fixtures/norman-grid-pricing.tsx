// Exercises the production QuoteBuilder and pricing effects with a local database.
import { calculateQuoteDesignSubtotal } from "@mts/lib/quoteTotals";
import { projectPersistedDesignSelections } from "@/lib/quote-v2/selected-design";
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
  sales_quotes: [{ id: "norman-grid-quote", account_id: "fixture", customer_name: "Norman grid regression", status: "draft", total_amount: 0, quote_letter: "A", quote_v2_backend: false }],
  sales_quote_line_items: [{ id: "norman-grid-line", quote_id: "norman-grid-quote", room_name: "Kitchen", product_type: "Roller Shades", width_whole: 0, width_fraction: "0", height_whole: 0, height_fraction: "0", quantity: 1, sort_order: 0, selected_design_id: "norman-grid-design" }],
  sales_quote_designs: [{ id: "norman-grid-design", line_item_id: "norman-grid-line", variant: "A", supplier: "Norman", product_type: "Roller Shades", material: "Soluna Roller Shades", unit_price: 0, mount_type:"Inside Mount", shade_type:"Single", lift_system:"Cordless",valance:"No Valance",fabric:"Amelia", options_json: { fabric_color_code:"F1484",fabric_collection:"Amelia",roller_application:"Single",roller_top_treatment:"No Top Treatment",roller_tube:"All Tubes",roller_region_scope:"ca_ma",catalog_product_id: "roller", catalog_program_id: "roller_cordless_fabric_price_group_2_pg2", catalog_manufacturer: "Norman", catalog_product_type: "Roller Shades", quote_lab_product_id: "roller", quote_lab_program_id: "roller_cordless_fabric_price_group_2_pg2", base_price: 0, surcharge_total: 0, pricing_method: "none", pricing_block_reason: "invalid_dimensions", pricing_calculation_status: "invalid", pricing_input_width_whole: 0, pricing_input_width_fraction: "0", pricing_input_height_whole: 0, pricing_input_height_fraction: "0" } }],
};
if (params.get("stale") === "1") {
  Object.assign(initial.sales_quote_line_items[0], { width_whole: 36, height_whole: 60 });
  Object.assign(initial.sales_quote_designs[0].options_json, { slat_size: '1"' });
}
const storageKey = `norman-grid-fixture-${params.get("case") || "default"}`;
const tables: Record<string, Row[]> = JSON.parse(localStorage.getItem(storageKey) || "null") || structuredClone(initial);
let failNext = params.get("fail") === "1";
let notify = () => {};
let pricingRequests=0;
const persist=()=>{localStorage.setItem(storageKey,JSON.stringify(tables));notify();};
const database = {
  auth: { getSession: async () => ({ data: { session: {access_token:"local-fixture-token"} }, error: null }) },
  from(table: string) {
    const filters: Array<(row: Row) => boolean> = [];
    let operation = "select", patch: Row = {}, one = false;
    const query = {
      select: (_columns?: string) => query,
      eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
      is: (key:string,value:unknown)=>{filters.push(row=>value===null?row[key]==null:row[key]===value);return query;},
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
const fixtureFetch = window.fetch.bind(window);
window.fetch = async (input,init) => {
 const path=String(input);const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});
 if(path.includes('/norman-price')){
  if(new Headers(init?.headers).get('Authorization')!=='Bearer local-fixture-token'||init?.body!=='{}')return response({message:'Expected authenticated empty request'},400);
  pricingRequests++;notify();
  if(params.get("conflict")==="1"&&pricingRequests===1)return response({message:"Concurrent selections changed; retry"},409);
  await new Promise(resolve=>setTimeout(resolve,100));
  const active=tables.sales_quote_line_items.filter(line=>!line.archived_at);
  const preparedResponse=await fixtureFetch('/__fixture/price',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({quote:tables.sales_quotes[0],lines:active,designs:tables.sales_quote_designs})});
  if(!preparedResponse.ok)throw new Error(await preparedResponse.text());
  const prepared=await preparedResponse.json();
  for(const entry of prepared){
   const row=tables.sales_quote_designs.find(row=>row.id===entry.designId)!;
   const r=entry.rpcResult as any,retail=r.authoritativeSnapshot?.retail;
   row.unit_price=retail?.unitPrice??0;
   row.options_json={...row.options_json,norman_grid_pricing:true,authoritative_price_status:r.priceStatus,authoritative_price_error:r.staffPricingError,
    authoritative_price_breakdown:retail??null,authoritative_v2_snapshot:r.authoritativeSnapshot,authoritative_once_total:retail?.onceTotal??0,priced_catalog_version:r.catalogVersion,priced_selection_fingerprint:r.selectionFingerprint};
   active.find(line=>line.id===entry.lineItemId)!.selected_design_id=entry.designId;
  }
  tables.sales_quotes[0].total_amount=calculateQuoteDesignSubtotal(active as any,projectPersistedDesignSelections(tables.sales_quote_designs as any,active as any));persist();
  return response({quoteId:tables.sales_quotes[0].id,pricedDesignCount:prepared.filter((row:Row)=>row.priceStatus==='authoritative').length,blockedDesignCount:prepared.filter((row:Row)=>row.priceStatus!=='authoritative').length,total:tables.sales_quotes[0].total_amount});
 }
 if(path.includes('/line-price/')){
  const body=JSON.parse(String(init?.body));const row=tables.sales_quote_designs.find(row=>row.line_item_id===body.lineItemId&&row.variant===body.variant)!;
  row.unit_price=body.unitPrice+39;row.options_json={...row.options_json,manual_price_override:true,manual_merchandise_unit_price:body.unitPrice,manual_customer_charge_policy:'blind-shade-install-ship-v1',authoritative_once_total:0,authoritative_price_status:'authoritative',authoritative_price_error:null};
  const active=tables.sales_quote_line_items.filter(line=>!line.archived_at);
  tables.sales_quotes[0].total_amount=calculateQuoteDesignSubtotal(active as any,projectPersistedDesignSelections(tables.sales_quote_designs as any,active as any));persist();
  return response({designId:row.id,unitPrice:row.unit_price,merchandiseUnitPrice:body.unitPrice,total:tables.sales_quotes[0].total_amount,revision:1,quoteStatus:'priced'});
 }
 if(path.startsWith('/api/quote-lab/catalog'))return response({products:[]});
 throw new Error(`Unexpected fixture network request: ${path}`);
};
useQuoteBuilderStore.getState().setActiveQuote("norman-grid-quote");
const client = new QueryClient({ queryCache: new QueryCache({ onError: (error) => console.error(error) }), defaultOptions: { queries: { retry: false } } });
function Fixture() {
  const [, update] = useState(0);
  const [scope, setScope] = useState<HTMLDivElement | null>(null);
  notify = () => update(n => n + 1);
  return <QuoteBuilderDatabaseProvider database={database} isolated={false} authoritativeV2={false}>
    <QueryClientProvider client={client}><PortalContainerContext.Provider value={scope}>
      <div ref={setScope} className="mts-quote-scope"><QuoteBuilder /><Toaster />
        <span data-testid="pricing-request-count">{pricingRequests}</span><pre data-testid="persisted-state" style={{display:"none"}}>{JSON.stringify(tables)}</pre>
      </div>
    </PortalContainerContext.Provider></QueryClientProvider>
  </QuoteBuilderDatabaseProvider>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
