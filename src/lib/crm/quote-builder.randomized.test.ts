import { describe, expect, it } from "vitest";
import {
  normalizeQuoteBuilderColorSelection,
  priceDesignFields,
} from "./quote-builder";
import type {
  CrmQuoteDetailValue,
  CrmQuoteMotorizationSelection,
} from "./types";
import {
  catalog,
  getProduct,
  getProgram,
  type CatalogProduct,
  type CatalogProgram,
} from "@/lib/quote/catalog";
import {
  productColorOptions,
  PRODUCT_COLOR_CODE_DETAIL,
  PRODUCT_COLOR_COLLECTION_DETAIL,
  PRODUCT_COLOR_ID_DETAIL,
  PRODUCT_COLOR_NAME_DETAIL,
  PRODUCT_COLOR_SURCHARGE_DETAIL,
  PRODUCT_COLOR_TYPE_DETAIL,
  type ProductColorOption,
} from "@/lib/quote/product-color-options";
import {
  getDetailFieldsForProduct,
  getMotorizationGroupsForProduct,
} from "@/lib/quote/product-options";
import { deriveAutomaticSurcharges } from "@/lib/quote/automatic-surcharges";

type Dimensions = { width_in: number; height_in: number };
type PricedBreakdown = {
  ok?: true;
  programId?: string;
  unitPrice?: number;
  surchargeLines?: Array<{ id: string; amount: number }>;
};

const RANDOM_SEED = 0x8052026;
const COLOR_DETAIL_IDS = new Set([
  "color",
  "fabric_category",
  "light_control",
  "vane_style",
]);

function rng(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function pick<T>(random: () => number, values: T[]): T {
  return values[Math.floor(random() * values.length)];
}

function priceablePrograms(product: CatalogProduct): CatalogProgram[] {
  return product.programs.filter((program) =>
    program.priceAxis === "sqft"
      ? program.pricePerSqft != null
      : program.grid.widths.length > 0 && program.grid.prices.length > 0,
  );
}

function firstValidDimensions(program: CatalogProgram): Dimensions {
  if (program.priceAxis === "sqft") {
    return { width_in: Math.max(24, program.maxWidth ? Math.min(24, program.maxWidth) : 24), height_in: 36 };
  }
  if (program.priceAxis === "width") {
    const widthIndex = program.grid.prices[0]?.findIndex((value) => value != null) ?? -1;
    if (widthIndex < 0) throw new Error(`No valid width price for ${program.id}`);
    return { width_in: program.grid.widths[widthIndex], height_in: 0 };
  }
  for (let rowIndex = 0; rowIndex < program.grid.prices.length; rowIndex += 1) {
    const colIndex = program.grid.prices[rowIndex].findIndex((value) => value != null);
    if (colIndex >= 0) {
      return {
        width_in: program.grid.widths[colIndex],
        height_in: program.grid.heights[rowIndex],
      };
    }
  }
  throw new Error(`No valid WH price for ${program.id}`);
}

function expectedProgramId(
  product: CatalogProduct,
  row: ProductColorOption,
  normalized: ReturnType<typeof normalizeQuoteBuilderColorSelection>,
): string {
  if (normalized.programId) return normalized.programId;
  const routed = normalized.fabric ? product.fabricRouting?.[normalized.fabric] : null;
  if (!routed) throw new Error(`No resolved program for ${row.productId}/${row.id}`);
  return routed;
}

function productProgramForRow(row: ProductColorOption): {
  product: CatalogProduct;
  selectedProgramId: string | null;
} {
  const product = getProduct(row.productId);
  if (!product) throw new Error(`Missing product ${row.productId}`);
  if (!row.requiresProgram) return { product, selectedProgramId: null };
  const selectedProgramId = priceablePrograms(product)[0]?.id ?? null;
  if (!selectedProgramId) throw new Error(`No priceable program for ${row.productId}`);
  return { product, selectedProgramId };
}

function colorPayloadDetails(row: ProductColorOption, includeId: boolean): Record<string, CrmQuoteDetailValue> {
  return {
    ...(includeId ? { [PRODUCT_COLOR_ID_DETAIL]: row.id } : {}),
    [PRODUCT_COLOR_CODE_DETAIL]: row.colorCode,
    [PRODUCT_COLOR_NAME_DETAIL]: row.colorName,
    [PRODUCT_COLOR_COLLECTION_DETAIL]: row.publicCollection || row.collection,
    [PRODUCT_COLOR_TYPE_DETAIL]: row.fabricType,
  };
}

function legacyLookupIsUnique(row: ProductColorOption): boolean {
  if (!row.colorCode) return false;
  if ((row.publicCollection || row.collection) !== row.collection) return false;
  return productColorOptions.filter((candidate) =>
    candidate.productId === row.productId &&
    candidate.available &&
    candidate.colorCode === row.colorCode &&
    candidate.colorName === row.colorName &&
    candidate.collection === row.collection
  ).length === 1;
}

function randomProductDetails(
  productId: string,
  random: () => number,
): Record<string, CrmQuoteDetailValue> {
  const details: Record<string, CrmQuoteDetailValue> = {};
  for (const field of getDetailFieldsForProduct(productId)) {
    if (COLOR_DETAIL_IDS.has(field.id)) continue;
    if (field.type === "checkbox") {
      if (random() < 0.22) details[field.id] = true;
      continue;
    }
    if (!field.options?.length || random() >= 0.28) continue;
    const options = field.options.filter((option) => option.value !== "none");
    if (options.length) details[field.id] = pick(random, options).value;
  }
  return details;
}

function motorOptionAvailableForProduct(productId: string, option: {
  price: number | null;
  priceByProduct?: Record<string, number | null>;
}): boolean {
  if (option.priceByProduct && Object.prototype.hasOwnProperty.call(option.priceByProduct, productId)) {
    return option.priceByProduct[productId] != null;
  }
  return option.price != null;
}

function randomMotorization(
  productId: string,
  random: () => number,
): CrmQuoteMotorizationSelection[] {
  const candidates: CrmQuoteMotorizationSelection[] = [];
  for (const groupId of getMotorizationGroupsForProduct(productId)) {
    const group = catalog.motorization[groupId];
    if (!group) continue;
    for (const option of group.options) {
      if (!motorOptionAvailableForProduct(productId, option)) continue;
      candidates.push({ groupId, optionId: option.id });
    }
  }
  if (!candidates.length || random() >= 0.35) return [];
  const selected = [pick(random, candidates)];
  if (candidates.length > 1 && random() < 0.2) {
    const second = pick(random, candidates);
    if (!selected.some((item) => item.groupId === second.groupId && item.optionId === second.optionId)) {
      selected.push(second);
    }
  }
  return selected;
}

function shuffled<T>(values: T[], random: () => number): T[] {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function stratifiedRandomColorRows(): ProductColorOption[] {
  const random = rng(RANDOM_SEED);
  const byProduct = new Map<string, ProductColorOption[]>();
  for (const row of productColorOptions) {
    if (!row.available) continue;
    const rows = byProduct.get(row.productId) ?? [];
    rows.push(row);
    byProduct.set(row.productId, rows);
  }

  const selected = new Map<string, ProductColorOption>();
  const add = (row: ProductColorOption) => selected.set(row.id, row);
  for (const rows of byProduct.values()) {
    shuffled(rows, random).slice(0, Math.min(16, rows.length)).forEach(add);
  }
  productColorOptions
    .filter((row) => row.available && (row.requiresProgram || row.automaticDetails[PRODUCT_COLOR_SURCHARGE_DETAIL]))
    .forEach(add);
  return [...selected.values()].sort((a, b) => a.productId.localeCompare(b.productId) || a.id.localeCompare(b.id));
}

describe("quote builder randomized fabric/color pricing", () => {
  it("normalizes and prices every available searchable color row", () => {
    const rows = productColorOptions.filter((row) => row.available);
    expect(rows.length).toBe(1180);

    for (const row of rows) {
      const { product, selectedProgramId } = productProgramForRow(row);
      const normalized = normalizeQuoteBuilderColorSelection(
        row.productId,
        row.selectionMode === "fabric" ? null : "should-be-cleared",
        selectedProgramId,
        colorPayloadDetails(row, true),
        {},
      );
      const resolvedProgramId = expectedProgramId(product, row, normalized);
      const program = getProgram(product, resolvedProgramId);
      expect(program, `${row.productId}/${row.id} resolves a catalog program`).toBeTruthy();
      const fields = priceDesignFields(
        {
          product_id: row.productId,
          program_id: normalized.programId,
          fabric: normalized.fabric,
          details: normalized.details,
          surcharges: [],
          motorization: [],
        },
        firstValidDimensions(program!),
      );
      const breakdown = fields.price_breakdown as PricedBreakdown;

      expect(fields.price_status, `${row.productId}/${row.id}`).toBe("ok");
      expect(breakdown.ok, `${row.productId}/${row.id}`).toBe(true);
      expect(breakdown.programId, `${row.productId}/${row.id}`).toBe(resolvedProgramId);
      expect(fields.unit_price, `${row.productId}/${row.id}`).toBe(breakdown.unitPrice);
      expect(Number.isFinite(fields.unit_price), `${row.productId}/${row.id}`).toBe(true);
      expect(fields.unit_price, `${row.productId}/${row.id}`).toBeGreaterThanOrEqual(0);

      expect(normalized.details[PRODUCT_COLOR_ID_DETAIL], row.id).toBe(row.id);
      expect(normalized.details[PRODUCT_COLOR_CODE_DETAIL], row.id).toBe(row.colorCode);
      expect(normalized.details[PRODUCT_COLOR_NAME_DETAIL], row.id).toBe(row.colorName);
      if (row.selectionMode === "fabric") {
        expect(normalized.fabric, row.id).toBe(row.collection);
        expect(normalized.programId, row.id).toBeNull();
      } else {
        expect(normalized.fabric, row.id).toBeNull();
        expect(normalized.programId, row.id).toBe(row.programId ?? selectedProgramId);
      }
    }
  });

  it("prices seeded random color, detail, surcharge, motor, and discount combinations", () => {
    const random = rng(RANDOM_SEED ^ 0xfeed);
    const rows = stratifiedRandomColorRows();
    expect(rows.length).toBeGreaterThan(220);

    for (const [index, row] of rows.entries()) {
      const { product, selectedProgramId } = productProgramForRow(row);
      const baseDetails = randomProductDetails(row.productId, random);
      const includeColorId = index % 4 !== 0 || !legacyLookupIsUnique(row);
      const payloadDetails = {
        ...baseDetails,
        ...colorPayloadDetails(row, includeColorId),
      };
      const normalized = normalizeQuoteBuilderColorSelection(
        row.productId,
        row.selectionMode === "fabric" && index % 3 === 0 ? row.collection : null,
        row.requiresProgram ? selectedProgramId : null,
        payloadDetails,
        baseDetails,
      );
      const resolvedProgramId = expectedProgramId(product, row, normalized);
      const program = getProgram(product, resolvedProgramId);
      expect(program, `${row.productId}/${row.id} resolves in randomized test`).toBeTruthy();

      const motorization = randomMotorization(row.productId, random);
      const discountPercent = pick(random, [0, 5, 10, 15, 20]);
      const fields = priceDesignFields(
        {
          product_id: row.productId,
          program_id: normalized.programId,
          fabric: normalized.fabric,
          details: normalized.details,
          surcharges: [{ id: "__ignored_client_surcharge__" }],
          motorization,
        },
        firstValidDimensions(program!),
        discountPercent,
      );
      const breakdown = fields.price_breakdown as PricedBreakdown;
      const label = `${index} ${row.productId}/${row.id} ${row.colorCode} ${row.colorName}`;

      expect(fields.price_status, label).toBe("ok");
      expect(breakdown.ok, label).toBe(true);
      expect(breakdown.programId, label).toBe(resolvedProgramId);
      expect(fields.unit_price, label).toBe(breakdown.unitPrice);
      expect(Number.isFinite(fields.unit_price), label).toBe(true);
      expect(fields.surcharges.some((item) => item.id === "__ignored_client_surcharge__"), label).toBe(false);

      const expectedDetailSurcharges = deriveAutomaticSurcharges(row.productId, normalized.details);
      for (const surcharge of expectedDetailSurcharges) {
        expect(fields.surcharges.some((item) => item.id === surcharge.id), `${label} derived ${surcharge.id}`).toBe(true);
        expect(
          breakdown.surchargeLines?.some((item) => item.id === surcharge.id && item.amount > 0),
          `${label} priced ${surcharge.id}`,
        ).toBe(true);
      }

      const hiddenSurcharge = normalized.details[PRODUCT_COLOR_SURCHARGE_DETAIL];
      if (typeof hiddenSurcharge === "string") {
        expect(fields.surcharges.some((item) => item.id === hiddenSurcharge), label).toBe(true);
        expect(breakdown.surchargeLines?.some((item) => item.id === hiddenSurcharge && item.amount > 0), label).toBe(true);
      }

      for (const motor of motorization) {
        expect(
          breakdown.surchargeLines?.some((item) => item.id === `motor:${motor.groupId}:${motor.optionId}`),
          `${label} motor ${motor.groupId}/${motor.optionId}`,
        ).toBe(true);
      }
    }
  });
});
