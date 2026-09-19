import { SMARTFOLD_FABRICS } from "@/lib/quote/norman-current-assortment";
import type { SelectionContext, ValidationIssue } from "./core";
import { sourceProvenance } from "./source-manifest";

export const SMARTFOLD_HARDWARE_COLORS = ["White", "Bianca", "Black"] as const;
export const SMARTFOLD_HEM_COLORS = [...SMARTFOLD_HARDWARE_COLORS,"Cottage White"] as const;
export const SMARTFOLD_FASCIA_COLORS = [...SMARTFOLD_HEM_COLORS,"Anodized Silver"] as const;
export const SMARTFOLD_END_CAP_COLORS = [...SMARTFOLD_HEM_COLORS,"Nature","Terra","Sahara","Chocolate"] as const;
export const SMARTFOLD_PREMIUM_HEM_COLORS = ["Brass","Bronze","Brushed Black","Matte Silver"] as const;
export const SMARTFOLD_WOOD_VALANCE_COLORS = ["001 Pure White","003 Silk White","006 Pearl","012 Crisp Linen","049 Stone Gray","053 Clay","109 Weathered Teak","110 Limed White","212 Dark Teak","221 Black Walnut","237 Wenge","246 Matte Black"] as const;
export const SMARTFOLD_CHAIN_COLORS = ["White","Bianca","Cottage White","Silver","Brass","Sahara","Chocolate","Black","Nature","Terra","Stainless Steel"] as const;
const normalize=(v:unknown)=>String(v??"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const selected=(v:unknown)=>["yes","true"].includes(normalize(v));
const explicit=(v:unknown)=>v!=null && v!=="" && normalize(v)!=="default";

// September 10 guide p5: these are component color defaults, not price groups.
const COORDINATION: Record<string,readonly [string,string]> = {
  F1934:["White","White"],F1935:["Bianca","Bianca"],F1936:["Black","Sahara"],F1937:["Black","Silver"],F1938:["Black","Chocolate"],
  F1794:["White","White"],F1795:["Bianca","White"],F1719:["Bianca","Sahara"],F1721:["Black","Brass"],F1720:["Black","Silver"],F1695:["Black","Silver"],
  F1708:["Bianca","Silver"],F1709:["Bianca","Bianca"],F1710:["Bianca","Cottage White"],F1711:["Bianca","Sahara"],
};
const PREMIUM_END_CAP:Record<string,string>={Brass:"Brass",Bronze:"Chocolate","Brushed Black":"Black","Matte Silver":"Silver"};

export function smartfoldStyle(context: SelectionContext) {
  const c=context.configuration;
  const code=String(c.fabric_color_code??"").toUpperCase();
  const colors=COORDINATION[code];
  const namedValues=[...SMARTFOLD_HARDWARE_COLORS,...SMARTFOLD_HEM_COLORS,...SMARTFOLD_FASCIA_COLORS,...SMARTFOLD_END_CAP_COLORS,...SMARTFOLD_PREMIUM_HEM_COLORS,...SMARTFOLD_CHAIN_COLORS,...SMARTFOLD_WOOD_VALANCE_COLORS,...SMARTFOLD_FABRICS.map(f=>f.code),"Standard","Reverse","Plain","Fabric-Wrapped"];
  const override=(key:string,fallback:string|null)=>explicit(c[key])?namedValues.find(v=>normalize(v)===normalize(c[key]))??String(c[key]):fallback;
  const hardware=override("smartfold_hardware_color",colors?.[0]??null);
  const premium=selected(c.premium_hem_bar);
  const plainHem=normalize(c.smartfold_hem_style)==="plain";
  const hem=override("smartfold_hem_color",premium?null:hardware);
  const valance=normalize(c.valance);
  const curvedWrapped=valance==="curved fascia" && normalize(c.smartfold_fascia_style)==="fabric wrapped";
  const fabricValance=valance.includes("fabric") || curvedWrapped;
  const plainFascia=valance==="square fascia" || (valance==="curved fascia" && !curvedWrapped);
  const fasciaColor=plainFascia?override("smartfold_fascia_color",hardware):null;
  const chain=override("smartfold_chain_color",colors?.[1]??null);
  return {
    sourceId:"norman-smartfold-guide-2026-09-10",sourcePages:[5,6,7,8,15,19,21],
    fabricPattern:override("smartfold_fabric_pattern","Standard"),hardwareColor:hardware,
    hemStyle:override("smartfold_hem_style","Fabric-Wrapped"),hemColor:hem,
    hemEndCap:premium ? hem ? PREMIUM_END_CAP[hem]??null : null : plainHem ? null : override("smartfold_hem_end_cap",hardware),
    valanceFabricCode:fabricValance?override("smartfold_valance_fabric_code",code||null):null,
    valanceWoodFinish:valance==="modern wood"?override("smartfold_wood_valance_color",null):null,
    fasciaStyle:valance==="curved fascia"?override("smartfold_fascia_style","Plain"):null,
    fasciaColor,fasciaEndCap:plainFascia?fasciaColor==="Anodized Silver"?"White":fasciaColor:curvedWrapped?override("smartfold_fascia_end_cap",hardware):null,
    wireConnectorBox:/rechargeable/i.test(String(c.motor_type)) && /motor/i.test(String(c.lift_system)) ? hardware==="Black"?"Black":hardware==="White"||hardware==="Bianca"?"White":null:null,
    chainColor:/cord.*loop/.test(normalize(c.lift_system))?chain==="Bianca"?"Cottage White":chain:null,
    tensionDeviceColor:/cord.*loop/.test(normalize(c.lift_system))?chain==="Stainless Steel"?hardware:chain:null,
  };
}

export function validateSmartfoldStyle(context: SelectionContext): ValidationIssue[] {
  if(context.productId!=="smartfold" || context.catalogAsOf<"2026-09-19")return [];
  const c=context.configuration;const issues:ValidationIssue[]=[];
  const add=(rule:string,page:number,message:string)=>issues.push({severity:"hard_block",ruleId:`norman.smartfold.${rule}`,source:sourceProvenance("norman-smartfold-guide-2026-09-10",{page}),selectedValues:{...c},explanation:message});
  const choice=(key:string,values:readonly string[],page:number,required=false)=>{
    if((required || explicit(c[key])) && !values.some(v=>normalize(v)===normalize(c[key])))add(key,page,`Select ${key.replace(/^smartfold_/,"").replaceAll("_"," ")} from the current SmartFold choices.`);
  };
  const fabric=SMARTFOLD_FABRICS.find(f=>f.code===String(c.fabric_color_code??"").toUpperCase());
  choice("smartfold_fabric_pattern",fabric?.collection==="Impressions"?["Standard","Reverse"]:["Standard"],6);
  choice("smartfold_hardware_color",SMARTFOLD_HARDWARE_COLORS,7);
  choice("smartfold_hem_style",["Fabric-Wrapped","Plain"],19);
  const premium=selected(c.premium_hem_bar);
  choice("smartfold_hem_color",premium?SMARTFOLD_PREMIUM_HEM_COLORS:SMARTFOLD_HEM_COLORS,8,premium);
  if(premium && explicit(c.smartfold_hem_end_cap))add("premium_hem_end_cap",8,"Premium hem-bar end caps are assigned by the selected finish; a separate end-cap override is not available.");
  if(!premium && normalize(c.smartfold_hem_style)==="plain" && explicit(c.smartfold_hem_end_cap))add("plain_hem_end_cap",7,"Separate end-cap color overrides are offered for fabric-wrapped hem bars only.");
  if(!premium && normalize(c.smartfold_hem_style)!=="plain")choice("smartfold_hem_end_cap",SMARTFOLD_END_CAP_COLORS,7);
  const valance=normalize(c.valance);
  if(valance==="modern wood")choice("smartfold_wood_valance_color",SMARTFOLD_WOOD_VALANCE_COLORS,15,true);
  if(valance==="curved fascia")choice("smartfold_fascia_style",["Plain","Fabric-Wrapped"],15);
  const wrapped=valance==="curved fascia" && normalize(c.smartfold_fascia_style)==="fabric wrapped";
  if(valance==="square fascia" || (valance==="curved fascia"&&!wrapped))choice("smartfold_fascia_color",SMARTFOLD_FASCIA_COLORS,7);
  if(wrapped)choice("smartfold_fascia_end_cap",SMARTFOLD_END_CAP_COLORS,7);
  if(valance.includes("fabric")||wrapped)choice("smartfold_valance_fabric_code",SMARTFOLD_FABRICS.map(f=>f.code),15);
  if(/cord.*loop/.test(normalize(c.lift_system)))choice("smartfold_chain_color",SMARTFOLD_CHAIN_COLORS,7);
  return issues;
}
