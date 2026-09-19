import { SMARTFOLD_FABRICS } from "@/lib/quote/norman-current-assortment";
import type { SelectionContext, ValidationIssue } from "./core";
import { sourceProvenance } from "./source-manifest";

export const SMARTFOLD_HARDWARE_DATE = "2026-09-19";
export const SMARTFOLD_INSTALLATIONS = ["Top Mount with Raceway", "Back / Wall Mount with Raceway"] as const;
const normalize = (value: unknown) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** September guide pp24,37–38. Counts are per shade, before line quantity. */
export function smartfoldHardware(context: SelectionContext) {
  if (context.productId !== "smartfold" || context.catalogAsOf < SMARTFOLD_HARDWARE_DATE) return null;
  const c = context.configuration;
  const mount = normalize(c.mount_type);
  const inside = ["inside mount", "inside", "im", "ib", "semi inside mount", "semi inside"].includes(mount);
  const outside = ["outside mount", "outside", "om", "ob"].includes(mount);
  const installation = normalize(c.smartfold_installation);
  const top = installation === normalize(SMARTFOLD_INSTALLATIONS[0]);
  const back = installation === normalize(SMARTFOLD_INSTALLATIONS[1]);
  const validMount = (inside && (top || back)) || (outside && back);
  const finishedWidth = context.widthInches - (inside ? 0.125 : 0);
  const shimLayers = c.smartfold_shim_layers == null || c.smartfold_shim_layers === "" ? null : Number(c.smartfold_shim_layers);
  const validLayers = shimLayers != null && Number.isInteger(shimLayers) && shimLayers >= 0 && shimLayers <= 3;
  const supports = top ? finishedWidth <= 80 ? 3 : 5 : finishedWidth <= 40 ? 2 : finishedWidth <= 80 ? 3 : 4;
  const collection = SMARTFOLD_FABRICS.find(f => f.code === String(c.fabric_color_code ?? "").toUpperCase())?.collection;
  const lift = normalize(c.lift_system ?? c.control_type);
  const cordless = lift.includes("cordless");
  const knownLift = cordless || /cord.*loop|motor|autowand/.test(lift);
  const bracketSize = !collection || !knownLift ? null : collection === "Louise"
    ? cordless || context.heightInches <= 72 ? 4.5 : 6
    : collection === "Moonlight" && !cordless ? 3.5 : context.heightInches <= 60 ? 3.5 : 4.5;
  return {
    validMount, validLayers,
    record: {
      version: 1, type: "smartfold_hardware", sourceId: "norman-smartfold-guide-2026-09-10",
      sourcePages: [24, 37, 38], installation: validMount ? top ? SMARTFOLD_INSTALLATIONS[0] : SMARTFOLD_INSTALLATIONS[1] : null,
      finishedShadeWidth: Number.isFinite(finishedWidth) ? finishedWidth : null,
      finishedShadeHeight: Number.isFinite(context.heightInches) ? context.heightInches : null,
      shadeBracketCount: 2, mountingBracketCount: validMount ? top ? 0 : supports : null,
      mountingBracketSize: validMount && back ? bracketSize : null,
      shimLayers: validLayers ? shimLayers : null,
      shimQuantity: validMount && validLayers ? supports * shimLayers! : null,
      quantityBasis: "per_shade",
    },
  };
}

export function validateSmartfoldHardware(context: SelectionContext): ValidationIssue[] {
  const hardware = smartfoldHardware(context);
  if (!hardware) return [];
  const issues: ValidationIssue[] = [];
  const add = (rule: string, page: number, explanation: string) => issues.push({
    severity: "hard_block", ruleId: `norman.smartfold.${rule}`,
    source: sourceProvenance("norman-smartfold-guide-2026-09-10", { page }),
    selectedValues: { ...context.configuration }, explanation,
  });
  if (!hardware.validMount) add("installation", 38, "Select top or back/wall mounting with raceway for inside mount. Outside mount requires back/wall mounting with raceway.");
  if (!hardware.validLayers) add("shim_layers", 38, "Select zero, one, two or three shim layers. Hardware quantities are calculated from the finished shade width and mounting method.");
  const fold = Number(context.configuration.fold_size);
  if (![6, 7, 8].includes(fold)) add("fold_size", 9, "Select a 6-inch, 7-inch or 8-inch fold.");
  return issues;
}
