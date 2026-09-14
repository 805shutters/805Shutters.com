import { lookupSundanceSourceGrid } from "./catalog";

/**
 * Source-complete, single-blind configurations retained for future activation.
 * Passing these restrictions does NOT authorize automatic customer pricing:
 * the Sundance catalog remains manual while commercial authority is pending.
 * Price from opening dimensions; the factory's deduction is not a grid step.
 */
export const SUNDANCE_SIMPLE_BLIND_RULES = {
  sundance_advantage_ii_2_5: {
    programId: "sundance_advantage_ii_2_5_p4_t1",
    sourcePages: [4, 7], minWidth: 18, minHeight: 12, maxWidth: 96, maxHeight: 84,
    color: "FS25-112", lift: "cordless", wands: ["left", "right"],
    valances: ["crown", "flat"], bottomrail: "rectangular",
    insideValanceReturnInches: 0.625, outsideValanceReturnInches: 2.75,
  },
  sundance_basicvue: {
    programId: "sundance_basicvue_p13_t1",
    sourcePages: [13], minWidth: 18, minHeight: 12, maxWidth: 72, maxHeight: 84,
    color: "White", lift: "cordless", wands: ["left"],
    valances: ["crown_hollow"], bottomrail: "rectangular_hollow",
    insideValanceReturnInches: 0.875, outsideValanceReturnInches: 3,
  },
} as const;

export type SundanceSimpleBlindId = keyof typeof SUNDANCE_SIMPLE_BLIND_RULES;
export type SundanceSimpleBlindSelection = {
  productId: SundanceSimpleBlindId;
  width: number;
  height: number;
  mount: "inside" | "outside";
  color: string;
  lift: string;
  wand: string;
  valance: string;
  bottomrail: string;
  /** Two/three on one require separate component measurements and prices. */
  componentCount: number;
  /** Net-price accessories and other configurations have no retail authority. */
  optionIds: readonly string[];
};

export function validateSundanceSimpleBlind(selection: SundanceSimpleBlindSelection) {
  const rule = SUNDANCE_SIMPLE_BLIND_RULES[selection.productId];
  if (!rule) return { valid: false as const, reason: "unsupported_product" };
  if (
    !Number.isFinite(selection.width) || !Number.isFinite(selection.height) ||
    selection.width < rule.minWidth || selection.width > rule.maxWidth ||
    selection.height < rule.minHeight || selection.height > rule.maxHeight
  ) return { valid: false as const, reason: "source_size_limit" };
  if (
    !["inside", "outside"].includes(selection.mount) ||
    selection.color !== rule.color || selection.lift !== rule.lift ||
    !(rule.wands as readonly string[]).includes(selection.wand) ||
    !(rule.valances as readonly string[]).includes(selection.valance) ||
    selection.bottomrail !== rule.bottomrail || selection.componentCount !== 1 ||
    !Array.isArray(selection.optionIds) || selection.optionIds.length !== 0
  ) return { valid: false as const, reason: "unsupported_configuration" };
  const source = lookupSundanceSourceGrid(selection.productId, rule.programId, selection.width, selection.height);
  if (!source) return { valid: false as const, reason: "source_cell_unavailable" };
  return {
    valid: true as const,
    source,
    valanceReturnInches: selection.mount === "inside" ? rule.insideValanceReturnInches : rule.outsideValanceReturnInches,
    automaticPricingAuthorized: false as const,
  };
}
