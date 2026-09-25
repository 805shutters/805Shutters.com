import { useState } from "react";
import { createRoot } from "react-dom/client";
import { DesignCard } from "@mts/components/crm/quote-builder/DesignCard";
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


const roller: SalesQuoteDesign = {...initial, product_type: "Roller Shades", fabric: "Seattle", unit_price: 425, lift_system: "Cordless", valance: "None", notes: "", options_json: { authoritative_price_status: "authoritative", quote_v2_backend: true, catalog_product_id: "roller", quote_lab_product_id: "roller", catalog_program_id: "roller_cordless_fabric_price_group_1_pg1", quote_lab_program_id: "roller_cordless_fabric_price_group_1_pg1", catalog_manufacturer: "Norman" }};
function Preview() {
 const [design, setDesign] = useState(roller);
 const [line] = useState({...item, product_type: "Roller Shades", selected_design_id: roller.id});
 return <main className="mts-quote-scope" style={{padding: "20px", maxWidth: 1320, margin: "auto"}}>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}><strong style={{fontSize:20}}>805 Shutters · Quote details</strong><span style={{fontSize:12,color:"#666"}}>Local preview · sample window</span></div>
 <DesignCard authoritativeV2 lineItem={line} lineNumber={1} designs={[design]} onSaveLinePrice={async()=>{}} onUpdateDesign={patch=>setDesign(old=>({...old,...patch}))} onCopyAll={()=>{}} onCopySome={()=>{}} onStack={()=>{}} copyMode="none" isCopyTarget={false} isSelectedTarget={false} onToggleCopyTarget={()=>{}} />
 </main>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
