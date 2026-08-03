import { getProduct } from "@/lib/quote/catalog";

export type CatalogRestrictionWarning = {
  id: string;
  message: string;
};

export type CatalogRestrictionWarningInput = {
  productId: string | null | undefined;
  programId: string | null | undefined;
  fabricName?: string | null | undefined;
  widthInches: number;
  heightInches: number;
};

function inches(value: number): string {
  return `${Number.isInteger(value) ? value.toFixed(0) : value}"`;
}

export function getCatalogRestrictionWarnings(
  input: CatalogRestrictionWarningInput,
): CatalogRestrictionWarning[] {
  if (
    !input.productId ||
    !Number.isFinite(input.widthInches) ||
    !Number.isFinite(input.heightInches) ||
    input.widthInches <= 0 ||
    input.heightInches <= 0
  ) {
    return [];
  }
  const product = getProduct(input.productId);
  if (!product) return [];
  if (!product.programs.length) {
    if (product.priceBasis === "unavailable") {
      return [{
        id: "catalog-product-unavailable",
        message: `${product.name} is unavailable and cannot be dimension-priced.`,
      }];
    }
    return [{
      id: "catalog-product-manual-quote",
      message: `${product.name} requires a manual manufacturer quote; no dimensional grid is available.`,
    }];
  }
  if (!input.programId) return [];
  const program = product.programs.find((candidate) => candidate.id === input.programId);
  if (!program) {
    return [{
      id: "catalog-program-required",
      message: `Select an exact ${product.name} price program before dimensional restrictions can be checked.`,
    }];
  }

  const warnings: CatalogRestrictionWarning[] = [];
  if (program.minWidth != null && input.widthInches < program.minWidth) {
    warnings.push({
      id: "catalog-min-width",
      message: `${program.name} must be at least ${inches(program.minWidth)} wide. This opening is ${inches(input.widthInches)} wide.`,
    });
  }
  if (program.maxWidth != null && input.widthInches > program.maxWidth) {
    warnings.push({
      id: "catalog-max-width",
      message: `${program.name} must be ${inches(program.maxWidth)} wide or less. This opening is ${inches(input.widthInches)} wide.`,
    });
  }
  if (program.minHeight != null && input.heightInches < program.minHeight) {
    warnings.push({
      id: "catalog-min-height",
      message: `${program.name} must be at least ${inches(program.minHeight)} high. This opening is ${inches(input.heightInches)} high.`,
    });
  }
  if (program.maxHeight != null && input.heightInches > program.maxHeight) {
    warnings.push({
      id: "catalog-max-height",
      message: `${program.name} must be ${inches(program.maxHeight)} high or less. This opening is ${inches(input.heightInches)} high.`,
    });
  }
  if (program.maxAreaSqft != null) {
    const area = (input.widthInches * input.heightInches) / 144;
    if (area > program.maxAreaSqft) {
      warnings.push({
        id: "catalog-max-area",
        message: `${program.name} must be ${program.maxAreaSqft} square feet or less. This opening is ${area.toFixed(2)} square feet.`,
      });
    }
  }
  const fabric = input.fabricName
    ? product.fabricMetadata?.find(
        (candidate) =>
          candidate.name.trim().toLowerCase() === input.fabricName?.trim().toLowerCase(),
      )
    : null;
  if (
    fabric?.rollWidthInches != null &&
    input.widthInches > fabric.rollWidthInches
  ) {
    if (!fabric.railroadAllowed) {
      warnings.push({
        id: "catalog-fabric-roll-width",
        message: `${fabric.name} has a ${inches(fabric.rollWidthInches)} fabric roll and cannot be railroaded. This ${inches(input.widthInches)} shade requires a seam or manufacturer review.`,
      });
    } else if (
      fabric.maxRailroadLengthInches != null &&
      input.heightInches > fabric.maxRailroadLengthInches
    ) {
      warnings.push({
        id: "catalog-fabric-railroad-seam",
        message: `${fabric.name} exceeds its ${inches(fabric.rollWidthInches)} standard roll width, and the ${inches(input.heightInches)} height exceeds its ${inches(fabric.maxRailroadLengthInches)} maximum railroaded length without a seam. A seam or manufacturer review is required.`,
      });
    } else {
      warnings.push({
        id: "catalog-fabric-railroad-required",
        message: `${fabric.name} exceeds its ${inches(fabric.rollWidthInches)} standard roll width. Select and disclose railroaded fabric orientation before pricing.`,
      });
    }
  }
  return warnings;
}
