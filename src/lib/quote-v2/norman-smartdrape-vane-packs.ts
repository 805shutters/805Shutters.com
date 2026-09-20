import { smartdrapePackCounts } from "../quote/norman-smartdrape-replacement";
import type {SelectionContext,ValidationIssue} from "./core";
import {smartdrapeTrack,smartdrapeIsPaired} from "./norman-smartdrape-tracks";
import {sourceProvenance} from "./source-manifest";
const norm=(v:unknown)=>String(v??"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
export function smartdrapeVanePacks(s:SelectionContext){
 if(s.productId!=="smartdrape"||s.catalogAsOf<"2026-09-19")return null;
 const c=s.configuration,track=smartdrapeTrack(s),packs=Number(c.smartdrape_extra_vane_packs??0),wands=Number(c.smartdrape_extra_wands??0),option=norm(c.smartdrape_vane_pack_style),alternating=norm(c.vane_style)==="alternating",center=norm(c.stack_option)==="center opening";
 const length=[48,60,72,84,100,120,132,144].find(h=>h>=s.heightInches)??null;
 const middleOnly=option==="b middle vanes only",doubleEnds=center||smartdrapeIsPaired(s)&&alternating;
 const {first:firstCount,last:lastCount,middle:middleCount}=smartdrapePackCounts(middleOnly,doubleEnds);
 const lastColor=alternating&&track?.vaneCount!=null&&track.vaneCount%2===0?c.smartdrape_second_color:c.fabric_color_code;
 const safePacks=Number.isSafeInteger(packs)&&packs>=0?packs:null,safeWands=Number.isSafeInteger(wands)&&wands>=0?wands:null;
 return {packs,wands,safePacks,safeWands,length,record:{version:1,sourceId:"norman-perfectsheer-smartdrape-guide-2026-09",sourcePage:24,quantityBasis:"per_shade",extraWands:safeWands,
  vanePacks:packs>0?{quantity:safePacks,style:c.smartdrape_vane_pack_style??null,orderedWithShade:true,shadeHeight:s.heightInches,priceHeight:length,first:{quantity:firstCount,color:c.fabric_color_code??null},middle:alternating?[{quantity:middleCount/2,color:c.fabric_color_code??null},{quantity:middleCount/2,color:c.smartdrape_second_color??null}]:[{quantity:middleCount,color:c.fabric_color_code??null}],last:{quantity:lastCount,color:lastColor??null}}:null},
  selections:[...(safePacks&&length?[{id:`additional_vanes_pack_of_6_length_${length}`,units:safePacks}]:[]),...(safeWands?[{id:"additional_wand",units:safeWands}]:[])] };
}
export function validateSmartdrapeVanePacks(s:SelectionContext):ValidationIssue[]{
 const v=smartdrapeVanePacks(s);if(!v)return [];
 const c=s.configuration,issues:ValidationIssue[]=[];
 const add=(id:string,message:string)=>issues.push({severity:"hard_block",ruleId:`norman.smartdrape.${id}`,source:sourceProvenance("norman-perfectsheer-smartdrape-guide-2026-09",{page:24}),selectedValues:{...c},explanation:message});
 if(v.safePacks===null||v.safeWands===null)add("accessory_counts","Extra vane packs and wands require nonnegative whole quantities per shade.");
 if(v.packs>0&&!["a first middle and last vanes","b middle vanes only"].includes(norm(c.smartdrape_vane_pack_style)))add("vane_pack_style","Choose Option A (first, middle and last vanes) or Option B (middle vanes only).");
 if(v.packs>0&&!v.length)add("vane_pack_height","Vane-pack pricing is documented only through 144-inch shade height.");
 if(v.wands>0&&/motor/.test(norm(c.control_type??c.lift_system)))add("extra_wand_control","Extra tilt/draw wands apply only to manual SmartDrape operation; use the charging-wand option for a motorized shade.");
 for(const [key,value] of Object.entries(c))if((key.startsWith("additional_vanes_pack_of_6_length_")||key==="additional_wand")&&["yes","true"].includes(norm(value)))add("legacy_vane_accessory","Reconfirm extra vane-pack style and quantity or extra wand quantity before repricing.");
 return issues;
}
