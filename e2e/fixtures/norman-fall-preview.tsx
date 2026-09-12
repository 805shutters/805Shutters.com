// Local-only UI harness for the real CRM DesignCard; no API or customer records.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { DesignCard } from "@mts/components/crm/quote-builder/DesignCard";
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

function Preview() {
  const [design, setDesign] = useState<SalesQuoteDesign>(() => JSON.parse(localStorage.getItem("norman-fall-fixture") || "null") || initial);
  const [line, setLine] = useState(item);
  const [locked, setLocked] = useState(false);
  const [message, setMessage] = useState("");
  const [copy, setCopy] = useState<ReturnType<typeof buildCopiedDesignRows>[number] | null>(null);
  return <main className="mts-quote-scope" style={{ padding: 16, maxWidth: 1400, margin: "auto" }}>
    <h1 style={{ fontSize: 20 }}>Norman fabric regression fixture</h1>
    <p>Local test data. Uses the CRM design card; saves only in this browser.</p>
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBlock: 16 }}>
      <button onClick={() => { localStorage.setItem("norman-fall-fixture", JSON.stringify(design)); setMessage("Saved locally"); }}>Save fixture</button>
      <button onClick={() => setCopy(buildCopiedDesignRows([design], "fixture-copy")[0])}>Copy fixture</button>
      <button onClick={() => setDesign((old) => ({ ...old, unit_price: 777.77, options_json: { ...old.options_json, manual_price_override: true, sent_price_snapshot: { unit_price: 777.77 } } }))}>Set manual price</button>
      <label><input type="checkbox" checked={locked} onChange={(event) => setLocked(event.target.checked)} />Lock saved price</label>
      <label>Test width <input aria-label="Test width" type="number" value={line.width_whole} onChange={(event) => setLine((old) => ({ ...old, width_whole: Number(event.target.value) }))} /></label>
    </div>
    <DesignCard lineItem={line} lineNumber={1} designs={[design]} isPriceLocked={locked}
      onSaveLinePrice={async () => {}}
      onUpdateDesign={(patch) => setDesign((old) => ({ ...old, ...patch }))}
      onCopyAll={() => {}} onCopySome={() => {}} onStack={() => {}} copyMode="none" isCopyTarget={false} isSelectedTarget={false} onToggleCopyTarget={() => {}} />
    <p role="status">{message}</p>
    <section aria-label="Contract details">{getQuoteDesignDetails(design).map((detail, i) => <p key={i}>{detail.label}: {detail.value}</p>)}</section>
    <pre data-testid="saved-state" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(design, null, 2)}</pre>
    {copy && <pre data-testid="copied-state" style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(copy)}</pre>}
  </main>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
