"use client";
import { isOrderingOnlyIssue } from "@/lib/quote-v2/quote-pricing-policy";
import { getProduct } from "@/lib/quote/catalog";
import { CONTRACT_VERTICAL, CONTRACT_VALANCES, CONTRACT_FITS, CONTRACT_VERTICAL_FITS, normanContractColors } from "@/lib/quote/norman-contract";
import { validateNormanContract, contractStandardWandDrop } from "@/lib/quote-v2/norman-contract-rules";
import { measurementToInches } from "@mts/lib/pricingEngine";
import type { SalesQuoteDesign, SalesQuoteLineItem } from "@mts/types/quote";

export function NormanContractDesignOptions({design,productId,lineItem,onUpdateFields,pricingOnly=false}:{pricingOnly?:boolean;design:SalesQuoteDesign|undefined;productId:string;lineItem:SalesQuoteLineItem;onUpdateFields:(fields:Partial<SalesQuoteDesign>)=>void}) {
  const options=(design?.options_json??{}) as Record<string,unknown>;
  const vertical=productId===CONTRACT_VERTICAL, inside=design?.mount_type==="Inside Mount";
  const rows=normanContractColors.filter(row=>row.productId===productId&&row.available);
  const update=(patch:Record<string,unknown>,fields:Partial<SalesQuoteDesign>={})=>onUpdateFields({...fields,options_json:{...options,...patch}});
  const width=measurementToInches(lineItem.width_whole,lineItem.width_fraction),height=measurementToInches(lineItem.height_whole,lineItem.height_fraction);
  const validation=validateNormanContract({productId,manufacturerId:"Norman",programId:String(options.catalog_program_id??options.quote_lab_program_id??""),catalogVersion:"",catalogAsOf:"2026-09-19",quantity:lineItem.quantity,widthInches:width,heightInches:height,options:{},configuration:{...options,mount_type:design?.mount_type??null,lift_system:design?.lift_system??null,valance:design?.valance??null} as import("@/lib/quote-v2/core").SelectionContext["configuration"]}).filter(issue=>!pricingOnly||!isOrderingOnlyIssue(issue));
  const classes="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
  const select=(label:string,value:unknown,choices:readonly string[],change:(v:string)=>void)=><label className="block text-sm">{label}<select aria-label={label} className={classes} value={String(value??"")} onChange={e=>change(e.target.value)}><option value="">Select</option>{choices.map(v=><option key={v} value={v}>{v}</option>)}</select></label>;
  const number=(label:string,key:string)=><label className="block text-sm">{label}<input type="number" step="0.0625" min="0" aria-label={label} className={classes} value={String(options[key]??"")} onChange={e=>update({[key]:e.target.value===""?null:Number(e.target.value)})}/></label>;
  return <section className="space-y-3 rounded-lg border border-slate-200 p-3" data-testid="norman-contract-design-options">
    <div className="font-semibold">{getProduct(productId)?.name}</div>
    <p role="status" className="text-sm text-amber-900">Selections can be saved. Norman Contract Sales must quote the project, optional charges and freight.{vertical?" Minimum order: 50 blinds across the order.":""}</p>
    <label className="block text-sm">Contract color / slat size<select aria-label="Contract color / slat size" className={classes} value={String(options.fabric_color_id??"")} onChange={e=>{
      const color=rows.find(row=>row.id===e.target.value);if(!color)return;
      update({...color.automaticDetails,fabric_product_id:productId,fabric_color_id:color.id,fabric_color_code:color.colorCode,fabric_color_name:color.colorName,fabric_color_collection:color.collection,catalog_program_id:color.programId,quote_lab_program_id:color.programId,application:"Standard",control_side:options.control_side||"Left",...(vertical?{contract_headrail_color:color.colorCode==="8071"?"2058 White":"2003 Silk White"}:{})},{fabric:color.collection,lift_system:vertical?"Wand":"Cordless",valance:design?.valance||"None"});
    }}><option value="">Select finish and slat size</option>{rows.map(row=><option key={row.id} value={row.id}>{row.colorCode} · {row.colorName} · {row.collection}</option>)}</select></label>
    {select("Contract mount",design?.mount_type,["Inside Mount","Outside Mount"],mount_type=>update({contract_mount_fit:null,mount_depth_inches:null,contract_return_inches:null},{mount_type}))}
    {select("Contract wand side",options.control_side,["Left","Right"],v=>update({control_side:v}))}
    {!pricingOnly&&select("Contract wand drop",options.contract_wand_drop_inches==null?"Standard":String(options.contract_wand_drop_inches),["Standard",...(vertical?[34,49,61]:[11.75,17.75,29.75,38.25,47.25]).map(String)],v=>update({contract_wand_drop_inches:v==="Standard"?null:Number(v)}))}
    {!pricingOnly&&<p className="text-xs">Standard wand drop: {contractStandardWandDrop(productId,height-(inside&&vertical?.1875:0))} inches from the top of the headrail.</p>}
    {vertical?select("Contract headrail color",options.contract_headrail_color,["2003 Silk White","2058 White"],v=>update({contract_headrail_color:v})):select("Contract valance",design?.valance,CONTRACT_VALANCES,valance=>update({contract_valance_length_inches:null,contract_return_inches:null},{valance}))}
    {!pricingOnly&&inside&&select("Contract mount fit",options.contract_mount_fit,vertical?CONTRACT_VERTICAL_FITS:CONTRACT_FITS,v=>update({contract_mount_fit:v,contract_return_inches:null}))}
    {!pricingOnly&&inside&&number("Contract recess depth (inches)","mount_depth_inches")}
    {!vertical&&design?.valance&&design.valance!=="None"&&<>{!pricingOnly&&<p className="text-xs">Optional custom measurements are inside dimensions. Leave blank for Norman's standard dimensions.</p>}{number("Custom valance length (inches)","contract_valance_length_inches")}{!pricingOnly&&!(inside&&options.contract_mount_fit==="Fully Inside")&&number("Custom valance return (inches)","contract_return_inches")}</>}
    {vertical?select("Contract shim layers",options.contract_shim_layers??0,["0","1","2"],v=>update({contract_shim_layers:Number(v)})):<>
      {select("Contract hold-down brackets",options.contract_hold_down_brackets??"No",["No","Yes"],v=>update({contract_hold_down_brackets:v}))}
      {select("Contract spacer blocks",options.contract_spacer_blocks??"No",["No","Yes"],v=>update({contract_spacer_blocks:v}))}
    </>}
    {validation.length>0&&<ul role="alert" className="list-disc pl-5 text-sm text-amber-900">{validation.map(issue=><li key={issue.ruleId}>{issue.explanation}</li>)}</ul>}
  </section>;
}
