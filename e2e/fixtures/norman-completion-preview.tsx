import { catalog } from "@/lib/quote/catalog";
import { projectPersistedDesignSelections } from "@/lib/quote-v2/selected-design";
// Local-only UI harness for the real CRM DesignCard; no API or customer records.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { DesignCard as CurrentDesignCard } from "@mts/components/crm/quote-builder/DesignCard";
import { DesignCard as V1DesignCard } from "@mts-v1/components/crm/quote-builder/DesignCard";
import { getQuoteDesignDetails as getV1QuoteDesignDetails } from "@mts-v1/lib/quoteDesignDetails";
import { buildCopiedDesignRows as buildV1CopiedDesignRows } from "@mts-v1/lib/quoteDesignCopy";
import { calculateLineItemDesignTotal } from "@mts/lib/quoteTotals";
import { calculateLineItemDesignTotal as calculateV1LineItemDesignTotal } from "@mts-v1/lib/quoteTotals";
import { buildCopiedDesignRows } from "@mts/lib/quoteDesignCopy";
import { getQuoteDesignDetails } from "@mts/lib/quoteDesignDetails";
import type { SalesQuoteDesign, SalesQuoteLineItem } from "@mts/types/quote";
import "../../src/app/globals.css";
import "../../src/mts-quote/mts-quote.css";

const initial: SalesQuoteDesign = {
  id: "fixture-design", line_item_id: "fixture-line", variant: "A", product_type: "Honeycomb Shades",
  supplier: "Norman", material: null, louver_size: null, tilt_type: null, hinge_color: null,
  panel_config: null, mount_type: "Inside Mount", shade_type: "Single Shade", lift_system: "Woven Cordless",
  valance: null, fabric: null, motor_type: null, remote_type: null,
  hard_surface_install: false, ladder_over_15ft: false, requires_takedown: false,
  unit_price: 0, notes: "Keep these notes", created_at: "",
  options_json: { cell_size: '3/4" Single Cell', light_control: "Woven", honeycomb_application: "Standard Horizontal", control_side: "Left" },
};
const item: SalesQuoteLineItem = { id: "fixture-line", quote_id: "fixture-quote", room_name: "Living Room", product_type: "Honeycomb Shades", width_whole: 36, width_fraction: "0", height_whole: 60, height_fraction: "0", quantity: 1, sort_order: 0, created_at: "" };

const engine = new URLSearchParams(location.search).get("engine") === "v1" ? "v1" : "current";
const DesignCard = engine === "v1" ? V1DesignCard : CurrentDesignCard;
const copyDesigns = engine === "v1" ? buildV1CopiedDesignRows : buildCopiedDesignRows;
const lineTotal = engine === "v1" ? calculateV1LineItemDesignTotal : calculateLineItemDesignTotal;
const detailReader = engine === "v1" ? getV1QuoteDesignDetails : getQuoteDesignDetails;
const storageKey = `norman-completion-fixture-${engine}`;
const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
function Preview() {
  const [designs, setDesigns] = useState<SalesQuoteDesign[]>(() => saved?.designs || [saved?.design || initial]);
  const [line, setLine] = useState<SalesQuoteLineItem>(saved?.line || item);
  const design = designs.find(candidate => candidate.id === line.selected_design_id) || designs[0];
  const projectedDesigns = projectPersistedDesignSelections(designs, [line]);
  const setDesign = (updater: (old: SalesQuoteDesign) => SalesQuoteDesign) => setDesigns(old => old.map(candidate => candidate.id === design.id ? updater(candidate) : candidate));
  const [locked, setLocked] = useState(saved?.locked || false);
  const [updateCount, setUpdateCount] = useState(0);
  const [message, setMessage] = useState("");
  const [copy, setCopy] = useState<ReturnType<typeof buildCopiedDesignRows>[number] | null>(null);
  return <main className="mts-quote-scope" style={{ padding: 16, maxWidth: 1400, margin: "auto" }}>
    <h1 style={{ fontSize: 20 }}>Norman completion regression fixture</h1>
    <label>Product fixture <select aria-label="Product fixture" value={design.product_type || ""} onChange={event => {
      const product = event.target.value;
      const selectedCatalog = catalog.products.find(p => ({ "Honeycomb Shades":"honeycomb", "Roller Shades":"roller", "Roman Shades":"roman", "SmartFold Shades":"smartfold", "Smart Drapes":"smartdrape", "Sheer Shades":"perfectsheer", "Mini Blinds":"citylights_aluminum", "Wood Blinds":"wood_blinds", "Palladian Shelf":"palladian_shelf" } as Record<string,string>)[product] === p.id)!;
      const options = product === "Mini Blinds" ? { slat_size: '1"', control_side: "Left" } : product === "Wood Blinds" ? { slat_size: '2"', control_side: "Left" } : {};
      setDesigns([{ ...initial, product_type: product, lift_system: product === "Smart Drapes" ? null : "Continuous Cord Loop", mount_type: product === "Smart Drapes" ? "Outside Mount" : "Inside Mount", options_json: { ...options, quote_v2_backend:true, catalog_product_id: selectedCatalog.id, quote_lab_product_id: selectedCatalog.id, catalog_program_id:selectedCatalog.programs[0].id, quote_lab_program_id:selectedCatalog.programs[0].id, catalog_manufacturer:"Norman" } }]);
      setLine(old => ({ ...old, product_type: product, selected_design_id: "fixture-design" }));
    }}>{["Honeycomb Shades", "Roller Shades", "Roman Shades", "SmartFold Shades", "Smart Drapes", "Sheer Shades", "Mini Blinds", "Wood Blinds", "Palladian Shelf"].map(p => <option key={p}>{p}</option>)}</select></label>
    <button onClick={() => {
      setDesigns([{...initial, product_type:"Honeycomb Shades",lift_system:"Cordless",options_json:{quote_v2_backend:true,catalog_product_id:"san_clemente_honeycomb",quote_lab_product_id:"san_clemente_honeycomb",catalog_program_id:"san_clemente_hg006",quote_lab_program_id:"san_clemente_hg006"}}]);
      setLine({...item,selected_design_id:initial.id});
    }}>San Clemente Honeycomb fixture</button>
    <button onClick={() => {
      setDesigns([{...initial,product_type:"Faux Wood Blinds",lift_system:"Cordless",options_json:{quote_v2_backend:true,catalog_product_id:"san_clemente_faux_wood",quote_lab_product_id:"san_clemente_faux_wood",catalog_program_id:"san_clemente_b5w20",quote_lab_program_id:"san_clemente_b5w20"}}]);
      setLine({...item,product_type:"Faux Wood Blinds",selected_design_id:initial.id});
    }}>San Clemente Faux Wood fixture</button>
    {[{id:"norman_contract_faux_wood",type:"Faux Wood Blinds",program:"norman_contract_faux_2",label:"Contract Faux fixture"},{id:"norman_contract_vertical",type:"Vertical Blinds",program:"norman_contract_vertical_3_5",label:"Contract Vertical fixture"}].map(product=><button key={product.id} onClick={()=>{
      setDesigns([{...initial,product_type:product.type,mount_type:null,lift_system:null,valance:null,options_json:{quote_v2_backend:true,catalog_product_id:product.id,quote_lab_product_id:product.id,catalog_program_id:product.program,quote_lab_program_id:product.program}}]);
      setLine({...item,product_type:product.type,selected_design_id:initial.id});
    }}>{product.label}</button>)}
    <p>Local test data. Uses the CRM design card; saves only in this browser.</p>
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBlock: 16 }}>
      <button onClick={() => { localStorage.setItem(storageKey, JSON.stringify({design, designs, line, locked})); setMessage("Saved locally"); }}>Save fixture</button>
      <button onClick={() => setCopy(copyDesigns([design], "fixture-copy")[0])}>Copy fixture</button>
      <button onClick={() => setDesign((old) => ({ ...old, unit_price: 777.77, options_json: { ...old.options_json, manual_price_override: true, sent_price_snapshot: { unit_price: 777.77 } } }))}>Set manual price</button>
      <label><input type="checkbox" checked={locked} onChange={(event) => setLocked(event.target.checked)} />Lock saved price</label>
      <label>Test width <input aria-label="Test width" type="number" value={line.width_whole} onChange={(event) => setLine((old) => ({ ...old, width_whole: Number(event.target.value) }))} /></label>
      <label>Test width fraction <select aria-label="Test width fraction" value={line.width_fraction} onChange={(event) => setLine((old) => ({ ...old, width_fraction: event.target.value }))}>{["0", "1/16", "1/8", "1/4", "1/2"].map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Test height <input aria-label="Test height" type="number" value={line.height_whole} onChange={(event) => setLine((old) => ({ ...old, height_whole: Number(event.target.value) }))} /></label>
      <label>Test quantity <input aria-label="Test quantity" type="number" value={line.quantity} onChange={(event) => setLine((old) => ({ ...old, quantity: Number(event.target.value) }))} /></label>
    </div>
    <DesignCard authoritativeV2 lineItem={line} lineNumber={1} designs={projectedDesigns} isPriceLocked={locked}
      onSaveLinePrice={async () => {}}
      onUpdateDesign={(patch) => {
        setUpdateCount(count => count + 1);
        setDesigns(old => old.map(candidate => candidate.variant === patch.variant ? { ...candidate, ...patch } : candidate));
        const selected = designs.find(candidate => candidate.variant === patch.variant);
        if (selected) setLine(old => ({ ...old, selected_design_id: selected.id }));
      }}
      onCopyAll={() => {}} onCopySome={() => {}} onStack={() => {}} copyMode="none" isCopyTarget={false} isSelectedTarget={false} onToggleCopyTarget={() => {}} />
    <p role="status">{message}</p>
    <section aria-label="Contract details">{detailReader(design).map((detail, i) => <p key={i}>{detail.label}: {detail.value}</p>)}</section>
    <span data-testid="update-count">{updateCount}</span>
    <span data-testid="line-total">{lineTotal(line, projectedDesigns).toFixed(2)}</span>
    <span data-testid="selected-design">{line.selected_design_id || ""}</span>
    <pre data-testid="saved-state" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(design, null, 2)}</pre>
    {copy && <pre data-testid="copied-state" style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(copy)}</pre>}
  </main>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
