import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "@/lib/crm/auth";
import { loadQuoteBuilder } from "@/lib/crm/quote-builder";
import type {
  CrmQuoteDesign,
  CrmQuoteLineItem,
  CrmQuoteWithItems,
} from "@/lib/crm/types";
import { getProduct, listProducts } from "@/lib/quote/catalog";
import { quoteLabProductType } from "@/lib/quote-lab/builder";
import {
  customerSafeQuoteV2Options,
  isProtectedQuoteV2ClientKey,
} from "@mts/lib/quoteV2ServerClient";

type JsonRecord = Record<string, unknown>;

type ImportedDesign = {
  sourceDesignId: string;
  variant: string;
  selectDesign: boolean;
  patch: JsonRecord;
};

type ImportedLine = {
  sourceLineItemId: string;
  roomName: string;
  productType: string;
  widthWhole: number;
  widthFraction: string;
  heightWhole: number;
  heightFraction: string;
  quantity: number;
  sortOrder: number;
  selectedDesignId: string | null;
  designs: ImportedDesign[];
};

export type SalesQuoteV2ImportStructure = {
  sourceUpdatedAt: string;
  lines: ImportedLine[];
};

export type SalesQuoteV2ImportResult = {
  backend: "authoritative_v2";
  crmQuoteId: string;
  quoteId: string;
  quoteNumber: string;
  revision: number;
  status: string;
  quoteV2Status: "stale";
  lineCount: number;
  designCount: number;
  reselectionLineCount: number;
};

const FRACTIONS = [
  "0",
  "1/16",
  "1/8",
  "3/16",
  "1/4",
  "5/16",
  "3/8",
  "7/16",
  "1/2",
  "9/16",
  "5/8",
  "11/16",
  "3/4",
  "13/16",
  "7/8",
  "15/16",
] as const;

const MANUFACTURER_NAMES = new Map([
  ["norman", "Norman"],
  ["norman window fashions", "Norman"],
  ["onyx", "Onyx"],
  ["onyx shutters", "Onyx"],
  ["lotus", "Lotus"],
  ["lotus windoware", "Lotus"],
  ["lotus windoware inc", "Lotus"],
  ["polar", "Polar"],
  ["polar shades", "Polar"],
]);

const DIRECT_FIELD_KEYS = {
  louverSize: ["louver_size", "louver size"],
  tiltType: ["tilt_type", "tilt type"],
  hingeColor: ["hinge_color", "hinge color"],
  panelConfig: ["panel_config", "panel configuration", "panel config"],
  mountType: ["mount_type", "mount type"],
  shadeType: ["shade_type", "shade type"],
  liftSystem: [
    "lift_system",
    "lift system",
    "operating_system",
    "operating system",
    "control_type",
    "control type",
  ],
  valance: ["valance"],
  motorType: ["motor_type", "motor type", "motor"],
  remoteType: ["remote_type", "remote type", "remote"],
} as const;

function plainRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalized(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/u\.s\./g, "us")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function manufacturerName(value: unknown): string | null {
  return MANUFACTURER_NAMES.get(normalized(value)) ?? null;
}

function sourceDetails(design: CrmQuoteDesign): Map<string, unknown> {
  const values = new Map<string, unknown>();
  const add = (key: unknown, value: unknown) => {
    const normalizedKey = normalized(key);
    if (normalizedKey && value !== undefined && value !== null && value !== "") {
      values.set(normalizedKey, value);
    }
  };

  for (const [key, value] of Object.entries(design.details ?? {})) add(key, value);

  const breakdown = plainRecord(design.price_breakdown);
  const detailRows = Array.isArray(breakdown?.details) ? breakdown.details : [];
  for (const entry of detailRows) {
    const row = plainRecord(entry);
    if (row) add(row.label, row.value);
  }
  const legacyOptions = plainRecord(breakdown?.optionsJson);
  for (const [key, value] of Object.entries(legacyOptions ?? {})) add(key, value);
  return values;
}

function firstDetail(
  details: ReadonlyMap<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value = text(details.get(normalized(key)));
    if (value) return value;
  }
  return null;
}

function explicitManufacturer(design: CrmQuoteDesign): string | null {
  const details = sourceDetails(design);
  return manufacturerName(
    firstDetail(details, [
      "supplier",
      "manufacturer",
      "catalog_manufacturer",
    ]),
  );
}

function isLegacyMirror(quote: CrmQuoteWithItems, design: CrmQuoteDesign): boolean {
  const breakdown = plainRecord(design.price_breakdown);
  const source = normalized(breakdown?.source);
  const pricingMethod = normalized(breakdown?.pricingMethod);
  const legacySystem = normalized(quote.meta?.legacy_quote_system);
  return (
    source.includes("mts 805 bookkeeping") ||
    pricingMethod.includes("legacy mts snapshot") ||
    legacySystem.includes("mts sales quote")
  );
}

function resolveCatalogIdentity(
  quote: CrmQuoteWithItems,
  design: CrmQuoteDesign,
): {
  manufacturer: string | null;
  productId: string | null;
  programId: string | null;
} {
  const storedProduct = getProduct(design.product_id);
  const sourceManufacturer = explicitManufacturer(design);
  const manufacturer =
    sourceManufacturer ??
    (!isLegacyMirror(quote, design)
      ? manufacturerName(storedProduct?.manufacturer)
      : null);
  if (!manufacturer) {
    return { manufacturer: null, productId: null, programId: null };
  }

  const category = storedProduct
    ? quoteLabProductType(storedProduct.id)
    : null;
  const matchingProducts = category
    ? listProducts().filter(
        (product) =>
          quoteLabProductType(product.id) === category &&
          manufacturerName(product.manufacturer) === manufacturer,
      )
    : [];
  const product =
    manufacturerName(storedProduct?.manufacturer) === manufacturer
      ? storedProduct
      : matchingProducts.length === 1
        ? matchingProducts[0]
        : null;
  if (!product) {
    return { manufacturer, productId: null, programId: null };
  }

  let programId =
    design.program_id &&
    product.programs.some((program) => program.id === design.program_id)
      ? design.program_id
      : null;
  if (!programId && design.fabric && product.fabricRouting?.[design.fabric]) {
    programId = product.fabricRouting[design.fabric];
  }
  if (!programId) {
    const details = sourceDetails(design);
    const exactProgramName = firstDetail(details, [
      "material",
      "program",
      "program name",
      "shade type",
      "louver size",
    ]);
    if (exactProgramName) {
      const matches = product.programs.filter(
        (program) => normalized(program.name) === normalized(exactProgramName),
      );
      if (matches.length === 1) programId = matches[0].id;
    }
  }
  return { manufacturer, productId: product.id, programId };
}

function decimalMeasurement(value: number | null): {
  whole: number;
  fraction: (typeof FRACTIONS)[number];
} {
  const measured = Number(value);
  if (!Number.isFinite(measured) || measured <= 0) {
    return { whole: 0, fraction: "0" };
  }
  const totalSixteenths = Math.max(0, Math.round(measured * 16));
  return {
    whole: Math.floor(totalSixteenths / 16),
    fraction: FRACTIONS[totalSixteenths % 16],
  };
}

function safeSourceConfiguration(design: CrmQuoteDesign): JsonRecord {
  const raw: JsonRecord = {
    imported_from_crm: true,
    imported_crm_design_id: design.id,
    imported_product_id: design.product_id,
    imported_program_id: design.program_id,
    imported_details: design.details ?? {},
    imported_surcharges: design.surcharges ?? [],
    imported_motorization: design.motorization ?? [],
  };
  return customerSafeQuoteV2Options(raw) as JsonRecord;
}

function boolDetail(
  details: ReadonlyMap<string, unknown>,
  keys: readonly string[],
): boolean {
  const value = firstDetail(details, keys);
  return value ? ["yes", "true", "1", "on"].includes(normalized(value)) : false;
}

function importDesign(
  quote: CrmQuoteWithItems,
  line: CrmQuoteLineItem,
  design: CrmQuoteDesign,
  forceLineReselection: boolean,
): ImportedDesign {
  const identity = resolveCatalogIdentity(quote, design);
  const details = sourceDetails(design);
  const typed = Boolean(identity.manufacturer && identity.productId);
  const sourceSelected = line.selected_design_id === design.id;
  const requiresReselection = forceLineReselection || !typed;
  const product = identity.productId ? getProduct(identity.productId) : null;
  const optionsJson: JsonRecord = {
    ...safeSourceConfiguration(design),
    v2_import_reselection_required: requiresReselection,
  };
  if (typed && product) {
    optionsJson.quote_lab_product_id = product.id;
    optionsJson.catalog_product_id = product.id;
    optionsJson.quote_lab_program_id = identity.programId;
    optionsJson.catalog_program_id = identity.programId;
    optionsJson.catalog_manufacturer = identity.manufacturer;
  }

  for (const key of Object.keys(optionsJson)) {
    if (isProtectedQuoteV2ClientKey(key)) {
      delete optionsJson[key];
    }
  }

  const patch: JsonRecord = {
    productType:
      (product ? quoteLabProductType(product.id) : null) ??
      quoteLabProductType(design.product_id),
    supplier: identity.manufacturer,
    material:
      identity.programId && product
        ? product.programs.find((program) => program.id === identity.programId)?.name ?? null
        : firstDetail(details, ["material", "program", "program name"]),
    louverSize: firstDetail(details, DIRECT_FIELD_KEYS.louverSize),
    tiltType: firstDetail(details, DIRECT_FIELD_KEYS.tiltType),
    hingeColor: firstDetail(details, DIRECT_FIELD_KEYS.hingeColor),
    panelConfig: firstDetail(details, DIRECT_FIELD_KEYS.panelConfig),
    mountType: firstDetail(details, DIRECT_FIELD_KEYS.mountType),
    shadeType: firstDetail(details, DIRECT_FIELD_KEYS.shadeType),
    liftSystem: firstDetail(details, DIRECT_FIELD_KEYS.liftSystem),
    valance: firstDetail(details, DIRECT_FIELD_KEYS.valance),
    fabric: design.fabric,
    motorType: firstDetail(details, DIRECT_FIELD_KEYS.motorType),
    remoteType: firstDetail(details, DIRECT_FIELD_KEYS.remoteType),
    hardSurfaceInstall: boolDetail(details, [
      "hard_surface_install",
      "hard surface install",
    ]),
    ladderOver15ft: boolDetail(details, [
      "ladder_over_15ft",
      "requires ladder over 15ft",
    ]),
    requiresTakedown: boolDetail(details, [
      "requires_takedown",
      "requires takedown",
    ]),
    notes: design.notes,
    optionsJson,
  };

  return {
    sourceDesignId: design.id,
    variant: design.label || "A",
    selectDesign: sourceSelected && !forceLineReselection && typed,
    patch,
  };
}

function lineProductType(
  quote: CrmQuoteWithItems,
  line: CrmQuoteLineItem,
): string {
  const productTypes = Array.from(
    new Set(
      line.designs
        .map((design) => {
          const identity = resolveCatalogIdentity(quote, design);
          return (
            (identity.productId
              ? quoteLabProductType(identity.productId)
              : null) ??
            quoteLabProductType(design.product_id) ??
            null
          );
        })
        .filter(
          (value): value is Exclude<typeof value, null> => value !== null,
        ),
    ),
  );
  if (productTypes.length === 1) return productTypes[0];
  return text(line.notes) ?? "Unclassified window covering";
}

export function buildSalesQuoteV2ImportStructure(
  quote: CrmQuoteWithItems,
): SalesQuoteV2ImportStructure {
  if (!quote.quote_number?.trim()) {
    throw new CrmAuthError(
      409,
      "This quote has no recorded quote number and cannot be imported into V2.",
    );
  }
  if (!quote.lineItems.length) {
    throw new CrmAuthError(
      409,
      "This quote has no stored line-item structure to import into V2.",
    );
  }
  if (quote.lineItems.length > 40) {
    throw new CrmAuthError(409, "This quote exceeds the 40-line V2 limit.");
  }

  const lines = quote.lineItems.map((line, index): ImportedLine => {
    if (!line.designs.length) {
      throw new CrmAuthError(
        409,
        `${line.room || `Line ${index + 1}`} has no stored design configuration to import.`,
      );
    }
    const width = decimalMeasurement(line.width_in);
    const height = decimalMeasurement(line.height_in);
    const sourceSelectedDesign = line.designs.find(
      (design) => design.id === line.selected_design_id,
    );
    const selectedIdentity = sourceSelectedDesign
      ? resolveCatalogIdentity(quote, sourceSelectedDesign)
      : null;
    const forceLineReselection = !(
      sourceSelectedDesign &&
      selectedIdentity?.manufacturer &&
      selectedIdentity.productId
    );
    const designs = line.designs.map((design) =>
      importDesign(quote, line, design, forceLineReselection),
    );
    const selected = designs.find((design) => design.selectDesign) ?? null;
    return {
      sourceLineItemId: line.id,
      roomName: text(line.room) ?? "Room not recorded",
      productType: lineProductType(quote, line),
      widthWhole: width.whole,
      widthFraction: width.fraction,
      heightWhole: height.whole,
      heightFraction: height.fraction,
      quantity: Math.max(1, Math.floor(Number(line.quantity) || 1)),
      sortOrder: Number.isFinite(Number(line.sort_order))
        ? Math.max(0, Math.floor(Number(line.sort_order)))
        : index,
      selectedDesignId: selected?.sourceDesignId ?? null,
      designs,
    };
  });

  return { sourceUpdatedAt: quote.updated_at, lines };
}

export async function importCrmQuoteToSalesQuoteV2(
  supabase: SupabaseClient,
  crmQuoteId: string,
  actorId: string,
  idempotencyKey: string,
  targetSalesQuoteId: string | null,
): Promise<SalesQuoteV2ImportResult> {
  const quote = await loadQuoteBuilder(supabase, crmQuoteId);
  const structure = buildSalesQuoteV2ImportStructure(quote);
  const { data, error } = await supabase.rpc("import_crm_quote_to_v2", {
    p_crm_quote_id: crmQuoteId,
    p_actor_id: actorId,
    p_idempotency_key: idempotencyKey,
    p_source_updated_at: structure.sourceUpdatedAt,
    p_structure: structure,
    p_target_sales_quote_id: targetSalesQuoteId,
  });
  if (error) {
    throw new CrmAuthError(
      error.code === "23505" || error.code === "40001" ? 409 : 502,
      error.message || "The CRM quote could not be imported into V2.",
    );
  }
  return data as SalesQuoteV2ImportResult;
}
