"use client";
import { VALANCE_ARTWORK, valanceIllustration } from "@/lib/quote/valance-illustrations";
import { TemporaryShadeOption } from "@/components/quote/TemporaryShadeOption";
import { useState } from "react";
import { CustomerContractDocument } from "../[token]/CustomerContractDocument";
import type { PublicQuote, PublicQuoteLine } from "@/lib/crm/public-quote";
import { ContractProductIllustration } from "@/components/quote/ContractProductIllustration";

const examples: [string, string[]][] = [
  ["Roller Shades", ["Lift System: Continuous Cord Loop", "Control Side: Left"]],
  ["Honeycomb Shades", ["Lift System: Cord Loop", "Chain Location: Right"]],
  ["Faux Wood Blinds", ["Control Side: Right"]],
  ["Wood Blinds", ["Control Side: Left"]],
  ["Mini Blinds", ["Control Side: Left"]],
  ["Roman Shades", ["Lift System: Motorized"]],
  ["Sheer Shades", ["Lift System: Cordless"]],
  ["Shutters", ["Panel Config: LR", "Tilt Type: Standard Tilt"]], ["Vertical Blinds", []], ["Smart Drapes", []],
];
export function ArtworkPreview() {
  const [product,setProduct]=useState("Roller Shades");
  const [operation,setOperation]=useState("Continuous Cord Loop");
  const [side,setSide]=useState("Left");
  const [manufacturer,setManufacturer]=useState("norman");
  const [valance,setValance]=useState("");
  const valances=VALANCE_ARTWORK.filter(a=>a.manufacturer===manufacturer && (a.products as readonly string[]).includes(product.toLowerCase()));
  const selectedValance=valances.find(a=>a.id===valance);
  const [temporary,setTemporary]=useState(false);
  const [track,setTrack]=useState("");
  const [panels,setPanels]=useState(2);
  const [tilt,setTilt]=useState("Standard Tilt");
  const [split,setSplit]=useState(false);
  const [divider,setDivider]=useState(false);
  const shutterOptions = [...(track ? [`Shutter Type: Tracked Shutter`, `Track System: ${track}`] : []),`Panel Config: ${"L".repeat(panels)}`, `Tilt Type: ${tilt}`, `Split Tilt: ${split ? "Yes" : "No"}`, `Divider Rail: ${divider ? "Yes" : "No"}`];
  const productOptions = product === "Shutters" ? shutterOptions : [`Lift System: ${operation}`, ...((operation === "Continuous Cord Loop" || ["Faux Wood Blinds", "Wood Blinds", "Mini Blinds"].includes(product)) ? [`Control Side: ${side}`] : [])];
  const options = [...productOptions, ...(temporary ? ["Complimentary temporary shade: Free"] : []), `Manufacturer: ${manufacturer}`, ...(selectedValance ? [`Valance: ${selectedValance.aliases[0]}`] : [])];
  const lines: PublicQuoteLine[] = [[product, options] as [string,string[]], ...examples].map(([productName,opts],i)=>({
    id:`sample-${i}`,lineItemId:`sample-${i}`,room:i===0?"Interactive sample":`Product ${i}`,productName,styleName:"",options:opts.filter(o=>!o.startsWith("Manufacturer:")),
    valanceArtId:valanceIllustration(productName,opts),designOptions:[],showDesignOptions:false,unitPrice:500,quantity:1,lineTotal:500,discountPercent:0,priceReady:true,
  }));
  const quote: PublicQuote = {
    token:"preview-only",id:"preview-only",quoteNumber:"ARTWORK REVIEW",customerName:"Sample customer",customerAddress:null,customerPhone:null,customerEmail:null,
    status:"draft",signed:false,signedAt:null,lines,subtotal:5500,fees:[],discount:0,tax:0,sourceTotalAdjustment:0,depositDue:2750,balanceDue:2750,total:5500,
    allPriced:true,hasOnyxShutters:false,versions:[],payment:{available:true,dueType:"deposit",amountDue:2750,outstanding:5500,depositPaid:0,paidTotal:0},
    adjustments:{totalOverride:null,balanceDueOverride:null,balanceAdjustmentNote:null,discountPercent:0,discountFlat:0,taxPercent:0,depositPercent:50,fees:[]},
    business:{name:"805 Shutters",phone:"805-806-9344",website:"https://www.805shutters.com",email:"805@805shutters.com"},
  };
  return <>
    <div className="no-print" style={{padding:20,background:"#eee",display:"flex",gap:16,flexWrap:"wrap",position:"sticky",top:0,zIndex:30}}>
      <strong>Option C · Working contract preview</strong>
      <label>Product <select aria-label="Preview product" value={product} onChange={e=>setProduct(e.target.value)}>{examples.map(([p])=><option key={p}>{p}</option>)}</select></label>
      {product !== "Shutters" ? <>
        <label>Manufacturer <select aria-label="Preview manufacturer" value={manufacturer} onChange={e=>{setManufacturer(e.target.value);setValance("");}}>{["norman","polar","lotus","onyx"].map(m=><option key={m}>{m}</option>)}</select></label>
        <label>Valance <select aria-label="Preview valance" value={selectedValance?.id||""} onChange={e=>setValance(e.target.value)}><option value="">No valance sketch</option>{valances.map(a=><option value={a.id} key={a.id}>{a.label}</option>)}</select></label>
        <label>Operating system <select aria-label="Preview operating system" value={operation} onChange={e=>setOperation(e.target.value)}>{["Continuous Cord Loop","Cordless","Motorized","Cordless TDBU","Motorized TDBU",""].map(p=><option key={p} value={p}>{p||"None"}</option>)}</select></label>
        <label>Side <select aria-label="Preview control side" value={side} onChange={e=>setSide(e.target.value)}>{["Left","Right",""].map(p=><option key={p} value={p}>{p||"Unspecified"}</option>)}</select></label>
      </> : null}
      {product === "Shutters" ? <>
        <label>System <select aria-label="Preview shutter system" value={track} onChange={e=>setTrack(e.target.value)}>{["","Bypass Track","Bifold 180"].map(t=><option key={t} value={t}>{t||"Hinged"}</option>)}</select></label>
        <label>Panels <select aria-label="Preview shutter panels" value={panels} onChange={e=>setPanels(Number(e.target.value))}>{[1,2,3,4,5,6,7,8].map(n=><option key={n}>{n}</option>)}</select></label>
        <label>Tilt <select aria-label="Preview shutter tilt" value={tilt} onChange={e=>setTilt(e.target.value)}>{["Standard Tilt","Invisible Tilt"].map(t=><option key={t}>{t}</option>)}</select></label>
        <label><input type="checkbox" checked={split} onChange={e=>setSplit(e.target.checked)} /> Split tilt</label>
        <label><input type="checkbox" checked={divider} onChange={e=>setDivider(e.target.checked)} /> Divider rail</label>
      </> : null}
    </div>
    <div className="no-print" style={{padding:20}}><TemporaryShadeOption selected={temporary} onChange={setTemporary} /></div>
    <details className="no-print" style={{padding:20}} open><summary>New sketches · tracked shutters and temporary shades</summary><div style={{display:"flex",gap:32,flexWrap:"wrap",padding:20}}><ContractProductIllustration productType="Shutters" options={["Track System: Bypass Track"]} /><ContractProductIllustration productType="Shutters" options={["Track System: Bifold 180"]} /><ContractProductIllustration productType="Roller Shades" options={["Lift System: Cordless","Complimentary temporary shade: Free"]} /></div></details>
    {product === "Shutters" ? <details className="no-print" style={{padding:20}}><summary>Shutter sketch catalog · {panels} panels</summary><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))",gap:20,paddingTop:20}}>{["Standard Tilt","Invisible Tilt"].flatMap(t=>[false,true].flatMap(s=>[false,true].map(d=><div key={`${t}-${s}-${d}`}><ContractProductIllustration productType="Shutters" options={[`Panel Config: ${"L".repeat(panels)}`,`Tilt Type: ${t}`,`Split Tilt: ${s?"Yes":"No"}`,`Divider Rail: ${d?"Yes":"No"}`]} /><p>{t} · {s?"Split tilt":"Full tilt"}{d?" · Divider rail":""}</p></div>)))}</div></details> : null}
    <details className="no-print" style={{padding:20}}><summary>Manufacturer valance sketch catalog · {VALANCE_ARTWORK.length} profiles</summary><p>Visual references for existing order selections. Manufacturer names stay off customer contracts.</p><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))",gap:24}}>{VALANCE_ARTWORK.map(a=><div key={a.id}><strong style={{textTransform:"capitalize"}}>{a.manufacturer}</strong><ContractProductIllustration productType={a.products[0]} valanceArtId={a.id} /></div>)}</div><p>Onyx profiles, ambiguous “Interior Cassette” selections, and unverified specialty valances await manufacturer confirmation.</p></details>
    <CustomerContractDocument quote={quote} previewOnly previewLabel="Development sample — no customer record" />
  </>;
}
