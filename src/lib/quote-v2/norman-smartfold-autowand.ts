import type {SelectionContext, ValidationIssue} from "./core";
import {sourceProvenance} from "./source-manifest";
export const SMARTFOLD_WAND_LENGTHS=["8","16","24","36","48","60","72"] as const;
export const SMARTFOLD_WAND_COLORS=["White","Cottage White","Black"] as const;
export function smartfoldAutoWand(s:SelectionContext){
 if(s.productId!=="smartfold"||s.catalogAsOf<"2026-09-20"||!s.catalogVersion.endsWith("-norman-smartfold-autowand-2026-09-20-r14")||String(s.configuration.lift_system).toLowerCase()!=="motorized"||String(s.configuration.motor_type).toLowerCase()!=="autowand")return null;
 const c=s.configuration,issues:ValidationIssue[]=[];
 const add=(key:string,message:string)=>issues.push({severity:"hard_block",ruleId:`norman.smartfold.autowand_${key}`,source:sourceProvenance("norman-motorization-guide-2026-09-16",{page:94}),selectedValues:{...c},explanation:message});
 const length=String(c.smartfold_wand_length??""),color=String(c.smartfold_wand_color??"");
 if(!SMARTFOLD_WAND_LENGTHS.some(v=>v===length))add("length","Select an 8, 16, 24, 36, 48, 60 or 72-inch SmartFold AutoWand.");
 if(!SMARTFOLD_WAND_COLORS.some(v=>v===color))add("color","Select White, Cottage White or Black for the SmartFold AutoWand.");
 return {issues,record:{version:1,sourceId:"norman-motorization-guide-2026-09-16",sourcePage:94,wandLength:SMARTFOLD_WAND_LENGTHS.some(v=>v===length)?Number(length):null,wandColor:SMARTFOLD_WAND_COLORS.some(v=>v===color)?color:null,chargingKitCableLength:78.75,usbChargerIncluded:false,chargerVoltage:5,chargingConnectorPolicy:"factory_supplies_correct_USB_or_USB_C_kit"}};
}
