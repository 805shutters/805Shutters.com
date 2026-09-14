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
  id: "fixture-design", line_item_id: "fixture-line", variant: "A", product_type: "Roller Shades",
  supplier: "Norman", material: null, louver_size: null, tilt_type: null, hinge_color: null,
  panel_config: null, mount_type: "Inside Mount", shade_type: "Single Shade", lift_system: "Cordless",
  valance: "No Valance", fabric: "Garden", motor_type: null, remote_type: null,
  hard_surface_install: false, ladder_over_15ft: false, requires_takedown: false,
  unit_price: 0, notes: "Keep these notes", created_at: "",
  options_json: { fabric_color_id: "Garden::F1515", fabric_color_collection: "Garden", fabric_color_code: "F1515", fabric_color_name: "Ecru", fabric_color_type: "Room Darkening", fabric_program_id: "roller_cordless_fabric_price_group_3_pg3", fabric_product_id: "roller", control_side: "Left", discount_percent: 10 },
};
const item: SalesQuoteLineItem = { id: "fixture-line", quote_id: "fixture-quote", room_name: "Living Room", product_type: "Roller Shades", width_whole: 36, width_fraction: "0", height_whole: 60, height_fraction: "0", quantity: 1, sort_order: 0, created_at: "" };

const engine = new URLSearchParams(location.search).get("engine") === "v1" ? "v1" : "current";
const DesignCard = engine === "v1" ? V1DesignCard : CurrentDesignCard;
const copyDesigns = engine === "v1" ? buildV1CopiedDesignRows : buildCopiedDesignRows;
const lineTotal = engine === "v1" ? calculateV1LineItemDesignTotal : calculateLineItemDesignTotal;
const detailReader = engine === "v1" ? getV1QuoteDesignDetails : getQuoteDesignDetails;
const storageKey = `norman-fall-fixture-${engine}`;
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
    <h1 style={{ fontSize: 20 }}>Manufacturer quote regression fixture ({engine})</h1>
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
    <DesignCard lineItem={line} lineNumber={1} designs={projectedDesigns} isPriceLocked={locked}
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
