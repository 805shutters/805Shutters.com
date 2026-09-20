import { LOTUS_ROLLER_VERSION, lotusRollerMinimumDepth, lotusRollerOpacity } from "@/lib/quote/lotus-roller";
import type { SelectionContext, ValidationIssue } from "./core";
import { sourceProvenance } from "./source-manifest";

export function validateLotusRoller(context: SelectionContext): ValidationIssue[] {
  if (context.productId !== "lotus_roller_shades" || context.configuration.lotus_roller_configuration_version !== LOTUS_ROLLER_VERSION) return [];
  const config=context.configuration, issues:ValidationIssue[]=[];
  const add=(suffix:string,explanation:string)=>issues.push({severity:"hard_block",ruleId:`lotus.roller.${suffix}`,source:{...sourceProvenance("lotus-digital-catalog-v1-1-25"),pages:[28,29]},selectedValues:{programId:context.programId,color:config.color??null,mount:config.mount_type??null,valance:config.valance??null,fit:config.lotus_roller_fit??null,depth:config.lotus_recess_depth_inches??null},explanation});
  if (!lotusRollerOpacity(context.programId??"") || config.lotus_roller_opacity!==lotusRollerOpacity(context.programId??"")) add("opacity_program", "Choose the exact 1% or Blackout program; opacity cannot be mixed across programs.");
  if(config.color!=="White" || config.lift_system!=="Cordless Spring Roller" || !["Smooth valance","None"].includes(String(config.valance))) add("standard_options", "The source supports White blended polyester, cordless spring operation and a smooth valance with half-inch mitered returns (included), or installation without the valance.");
  if(config.mount_type==="Inside Mount") {
    const minimum=lotusRollerMinimumDepth(String(config.valance),String(config.lotus_roller_fit));
    const depth=config.lotus_recess_depth_inches;
    if(minimum===null || typeof depth!=="number" || !Number.isFinite(depth) || depth<minimum) add("inside_depth", `Select semi-inside or flush fit and record sufficient recess depth${minimum===null?"":` (at least ${minimum} inches)`}.`);
  } else if(config.mount_type!=="Outside Mount") add("mount", "Select Inside Mount or Outside Mount; other mount types lack source support.");
  if(Number(config.lotus_roller_shade_count)!==1) add("single_shade", "This route captures one roller shade; shared/multiple-shade construction needs confirmed ordering details.");
  for(const key of ["motor_type","remote_type","motorization_type"]) if(config[key] && !["none","None"].includes(String(config[key]))) add("motorization", "The current RS guide documents cordless spring operation, not motorization.");
  if(Array.isArray(context.options.motorization_selections)&&context.options.motorization_selections.length) add("motorization", "No RS motorization accessories are source-approved.");
  return issues;
}
