import { CONTRACT_FAUX, CONTRACT_FAUX_SOURCE, CONTRACT_VERTICAL, CONTRACT_VERTICAL_SOURCE, CONTRACT_REQUEST_SOURCE, CONTRACT_VALANCES, CONTRACT_FITS, CONTRACT_VERTICAL_FITS, isNormanContractProduct, normanContractColors } from "@/lib/quote/norman-contract";
import type { SelectionContext, ValidationIssue } from "./core";
import { sourceProvenance } from "./source-manifest";

const finiteOrNull = (v: number) => Number.isFinite(v) ? v : null;
const num = (v: unknown) => v === null || v === undefined || v === "" ? NaN : Number(v);
export function contractDimensions(s: SelectionContext) {
  const inside = s.configuration.mount_type === "Inside Mount";
  return { width: s.widthInches - (inside ? .375 : 0), height: s.heightInches - (inside && s.productId === CONTRACT_VERTICAL ? .1875 : 0) };
}
export function contractStandardWandDrop(productId: string, height: number): number {
  return productId === CONTRACT_VERTICAL ? height <= 84 ? 34 : height <= 96 ? 49 : 61 : height <= 36 ? 11.75 : height <= 48 ? 17.75 : height <= 72 ? 29.75 : 38.25;
}
export function validateNormanContract(s: SelectionContext): ValidationIssue[] {
  if (!isNormanContractProduct(s.productId)) return [];
  const c = s.configuration, vertical = s.productId === CONTRACT_VERTICAL, issues: ValidationIssue[] = [];
  const source = vertical ? CONTRACT_VERTICAL_SOURCE : CONTRACT_FAUX_SOURCE;
  const add = (rule: string, page: number, explanation: string) => issues.push({ severity: "hard_block", ruleId: `norman.contract.${rule}`, source: sourceProvenance(source,{page}), selectedValues: { productId: s.productId, width: s.widthInches, height: s.heightInches, ...c }, explanation });
  const inside = c.mount_type === "Inside Mount";
  if (!inside && c.mount_type !== "Outside Mount") add("mount",vertical?10:15,"Choose inside or outside mount.");
  const {width:w,height:h} = contractDimensions(s);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < (vertical?18:16.5) || w > (vertical?100:96) || h < (vertical?36:24) || h > (vertical?108:96) || w*h > (vertical?75:48)*144) add("dimensions",vertical?6:7, vertical ? "Contract vertical: net width 18–100 inches, drop 36–108 inches, maximum 75 square feet." : "Contract faux wood: net width 16½–96 inches, drop 24–96 inches, maximum 48 square feet.");
  const color = normanContractColors.find(row => row.productId === s.productId && row.id === c.fabric_color_id);
  if (!color?.available || color.colorCode !== c.fabric_color_code || color.programId !== s.programId || color.automaticDetails?.slat_size !== c.slat_size || color.automaticDetails?.finish_type !== c.finish_type) add("color_program",vertical?5:6,"Select an active Contract Sales color, finish and matching slat program. Bright White 6018 is discontinued.");
  if (c.lift_system !== (vertical?"Wand":"Cordless") || !["Left","Right"].includes(String(c.control_side))) add("control",vertical?6:7,vertical?"Contract vertical uses a reversible left or right wand.":"Contract faux wood uses cordless lift and a left or right wand.");
  if (c.motor_type || c.remote_type || (Array.isArray(c.motorization_selections) && c.motorization_selections.length)) add("motorization",vertical?6:7,"Motorization is not offered by this Contract Sales specification.");
  if (c.application && c.application !== "Standard") add("application",vertical?6:7,"Only single standard blinds are documented for this Contract Sales program.");
  const drop = c.contract_wand_drop_inches;
  if (drop != null && drop !== "" && !(vertical?[34,49,61]:[11.75,17.75,29.75,38.25,47.25]).includes(num(drop))) add("wand_drop",vertical?6:8,"Choose a listed wand drop; drop is measured from the top of the headrail, not the length of the wand itself.");
  const fit = String(c.contract_mount_fit ?? "");
  if (inside && !(vertical ? CONTRACT_VERTICAL_FITS : CONTRACT_FITS).includes(fit as never)) add("mount_fit",vertical?9:11,"Choose the documented inside mounting arrangement.");
  const depth = num(c.mount_depth_inches);
  if (inside && vertical) {
    if (fit === "Fully Inside") add("mount_depth_source_conflict",9,"Norman's fully-inside table states ¾ inch while its drawing shows 3¾ inches. Contract Sales must confirm the requirement before this mounting arrangement can be approved.");
    else if (fit === "Semi Inside" && (!Number.isFinite(depth) || depth < 2.8125)) add("mount_depth",9,"Semi-inside vertical mounting with brackets aligned to the frame requires 2 13/16 inches depth.");
  }
  if (vertical) {
    if (!["2003 Silk White","2058 White"].includes(String(c.contract_headrail_color))) add("headrail_color",5,"Choose 2003 Silk White or 2058 White headrail.");
    if (c.valance && c.valance !== "None") add("valance",4,"A valance option is not established in this Contract vertical specification.");
    if (![0,1,2].includes(num(c.contract_shim_layers ?? 0))) add("shims",8,"Optional mounting shims allow zero, one or two layers.");
  } else {
    const valance = String(c.valance ?? "");
    if (!CONTRACT_VALANCES.includes(valance as never)) add("valance",5,"Choose no valance, 2.5-inch Modern Curved, or 3.25-inch Designer Crown. Optional valances require a quoted surcharge.");
    if (inside) {
      const required = valance === "None" ? fit === "Fully Inside" ? 2.8125 : 1.5 : fit === "Fully Inside" ? valance === "2.5-inch Modern Curved" ? 3.9375 : 4.0625 : fit === "Semi Inside Bracket Flush" ? 2.875 : 1.625;
      if (!Number.isFinite(depth) || depth < required) add("mount_depth",valance === "3.25-inch Designer Crown"?12:11,`This mounting/valance arrangement needs ${required} inches of recess depth in Norman's reference drawing.`);
    }
    for (const key of ["contract_valance_length_inches","contract_return_inches"]) {
      const v=c[key];
      if (v != null && v !== "" && (!Number.isFinite(num(v)) || num(v) <= 0 || valance === "None")) add("valance_dimensions",10,"Valance dimensions require a selected valance and positive measurements.");
    }
    if (c.contract_return_inches != null && c.contract_return_inches !== "" && (num(c.contract_return_inches)<.75 || num(c.contract_return_inches)>5 || (inside && fit === "Fully Inside"))) add("return_size",10,"Custom valance returns are ¾–5 inches inside dimension; fully-inside mounting has no return.");
    for (const key of ["contract_hold_down_brackets","contract_spacer_blocks"]) if (c[key] != null && !["Yes","No"].includes(String(c[key]))) add("hardware",9,"Choose Yes or No for optional hardware.");
  }
  return issues;
}

/** Store manufacturer deductions/accessory counts; ignore a browser-supplied derived record. */
export function deriveNormanContractOrderRecords(lines: readonly {lineId:string;selection:SelectionContext}[]): ValidationIssue[] {
  const issues: ValidationIssue[]=[];
  const verticals=lines.filter(l=>l.selection.productId===CONTRACT_VERTICAL);
  const quantity=verticals.reduce((sum,l)=>sum+l.selection.quantity,0);
  if (quantity>0 && quantity<50) issues.push({severity:"hard_block",ruleId:"norman.contract.vertical_order_minimum",source:sourceProvenance(CONTRACT_REQUEST_SOURCE,{page:1}),selectedValues:{quantity,lineIds:verticals.map(l=>l.lineId)},explanation:"Contract vertical orders require at least 50 blinds across the order. A current project quotation is still required."});
  for(const {selection:s} of lines) {
    const c={...s.configuration}; delete c.norman_contract_record_v1; s.configuration=c;
    if(!isNormanContractProduct(s.productId)) continue;
    const vertical=s.productId===CONTRACT_VERTICAL,{width:w,height:h}=contractDimensions(s);
    const inside=c.mount_type==="Inside Mount",fit=c.contract_mount_fit;
    const valance=c.valance && c.valance!=="None";
    const valanceLength=!vertical && valance ? num(c.contract_valance_length_inches ?? (w+(inside?fit==="Fully Inside"?.25:.625:1))) : null;
    const returnLength=!vertical && valance && !(inside && fit==="Fully Inside") ? num(c.contract_return_inches ?? (inside?fit==="Semi Inside Bracket Flush"?.75:2:3.5625)):null;
    const brackets=vertical?w<=48?2:w<=78?3:4:w<=37?2:w<=47?3:w<=75?4:5;
    s.configuration={...c,norman_contract_record_v1:{version:1,netWidth:finiteOrNull(w),netHeight:finiteOrNull(h),wandDrop:finiteOrNull(num(c.contract_wand_drop_inches ?? contractStandardWandDrop(s.productId,h))),bracketQuantity:brackets,
      centerSupport:vertical && w>=78,vaneLength:vertical?finiteOrNull(h-1.8125):null,valanceLength:valanceLength===null?null:finiteOrNull(valanceLength),returnLength:returnLength===null?null:finiteOrNull(returnLength),valanceSpliced:valanceLength!=null&&valanceLength>96,separateValanceBox:valanceLength!=null&&valanceLength>w+3.75,
      sourceId:vertical?CONTRACT_VERTICAL_SOURCE:CONTRACT_FAUX_SOURCE,sourcePages:vertical?[4,6,8,10]:[5,8,9,10,15],orderQuantity:vertical?quantity:null}};
  }
  return issues;
}
