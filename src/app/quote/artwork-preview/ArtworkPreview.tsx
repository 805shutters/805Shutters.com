"use client";
import { useState } from "react";
import { CustomerContractDocument } from "../[token]/CustomerContractDocument";
import type { PublicQuote, PublicQuoteLine } from "@/lib/crm/public-quote";

const examples: [string, string[]][] = [
  ["Roller Shades", ["Lift System: Continuous Cord Loop", "Control Side: Left"]],
  ["Honeycomb Shades", ["Lift System: Cord Loop", "Chain Location: Right"]],
  ["Faux Wood Blinds", ["Control Side: Right"]],
  ["Wood Blinds", ["Control Side: Left"]],
  ["Mini Blinds", ["Control Side: Left"]],
  ["Roman Shades", ["Lift System: Motorized"]],
  ["Sheer Shades", ["Lift System: Cordless"]],
  ["Shutters", []], ["Vertical Blinds", []], ["Smart Drapes", []],
];
export function ArtworkPreview() {
  const [product,setProduct]=useState("Roller Shades");
  const [operation,setOperation]=useState("Continuous Cord Loop");
  const [side,setSide]=useState("Left");
  const options = [`Lift System: ${operation}`, ...((operation === "Continuous Cord Loop" || ["Faux Wood Blinds", "Wood Blinds", "Mini Blinds"].includes(product)) ? [`Control Side: ${side}`] : [])];
  const lines: PublicQuoteLine[] = [[product, options] as [string,string[]], ...examples].map(([productName,opts],i)=>({
    id:`sample-${i}`,lineItemId:`sample-${i}`,room:i===0?"Interactive sample":`Product ${i}`,productName,styleName:"",options:opts,
    designOptions:[],showDesignOptions:false,unitPrice:500,quantity:1,lineTotal:500,discountPercent:0,priceReady:true,
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
      <label>Operating system <select aria-label="Preview operating system" value={operation} onChange={e=>setOperation(e.target.value)}>{["Continuous Cord Loop","Cordless","Motorized",""].map(p=><option key={p} value={p}>{p||"None"}</option>)}</select></label>
      <label>Side <select aria-label="Preview control side" value={side} onChange={e=>setSide(e.target.value)}>{["Left","Right",""].map(p=><option key={p} value={p}>{p||"Unspecified"}</option>)}</select></label>
    </div>
    <CustomerContractDocument quote={quote} previewOnly previewLabel="Development sample — no customer record" />
  </>;
}
