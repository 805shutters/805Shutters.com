import registryJson from "./manufacturer-order-form-registry.json";

export type OrderFormManufacturer = "onyx" | "norman" | "lotus" | "polar";

export type OrderFormRegistryEntry = {
  routing_key: string;
  manufacturer: string;
  product_key: string;
  product_name: string;
  product_kind: string;
  template_docx: string;
  schema: string;
  workflow: string;
  source_url: string;
  source_reference: string;
  verification: string;
  line_item_cardinality: string;
  order_form_key?: string;
  portal_material?: string | null;
};

export type OrderFormSourceValues = {
  manufacturer?: unknown;
  manufacturer_name?: unknown;
  supplier?: unknown;
  supplier_key?: unknown;
  product_id?: unknown;
  productId?: unknown;
  product_type?: unknown;
  productType?: unknown;
  program_id?: unknown;
  programId?: unknown;
  quantity?: unknown;
  details?: Record<string, unknown> | null;
  options_json?: Record<string, unknown> | null;
};

export type AgenticOrderManifestLine = {
  sourceLineId: string;
  sourceLineNumber: number;
  quantity: number;
  routingKey: string | null;
  productName: string | null;
  templateUrl: string | null;
  schemaUrl: string | null;
  templateVersion: number;
  sourceValues: OrderFormSourceValues;
  status: "ready" | "order_review_required";
  reason: string | null;
};

export type AgenticOrderManifest = {
  coverPage: {
    template: "customer-order-cover-v1";
    customerId: string;
    quoteId: string;
    measureStatus: "measure_required" | "no_measure";
    authority: "signed_contract" | "submitted_technical_measure_over_signed_contract";
  };
  lineItemPages: AgenticOrderManifestLine[];
  releaseStatus: "ready" | "order_review_required";
};

type RegistryShape = {
  manufacturers: Record<OrderFormManufacturer, OrderFormRegistryEntry[]>;
};

const REGISTRY = registryJson as RegistryShape;

const aliases: Record<OrderFormManufacturer, Record<string, string>> = {
  onyx: {
    bassia: "painted_basswood",
    painted_basswood: "painted_basswood",
    painted_basswood_shutters: "painted_basswood",
    stained_basswood: "stained_basswood",
    stained_basswood_shutters: "stained_basswood",
    secamore: "secamore",
    sycamore: "secamore",
    sycamore_shutters: "secamore",
    vinyl: "vinyl",
    vinyl_shutters: "vinyl",
    vlo: "vlo_hybrid",
    vlo_hybrid: "vlo_hybrid",
    vlo_hybrid_shutters: "vlo_hybrid",
    onyx_us_made_vinyl: "onyx_us_made_vinyl",
    us_made_vinyl: "onyx_us_made_vinyl",
    onyx_us_made_vinyl_shutters: "onyx_us_made_vinyl",
    poly_composite: "poly_composite",
    poly_composite_shutters: "poly_composite",
    ash: "ash",
    ash_shutters: "ash",
  },
  norman: {
    norman_shutters: "woodlore",
    woodlore: "woodlore",
    woodlore_shutters: "woodlore",
    woodlore_plus: "woodlore_plus",
    woodlore_plus_shutters: "woodlore_plus",
    woodlore_aquashield: "woodlore_aquashield",
    woodlore_aquashield_shutters: "woodlore_aquashield",
    aquashield: "woodlore_aquashield",
    brightwood: "brightwood",
    brightwood_shutters: "brightwood",
    normandy_painted: "normandy_painted",
    normandy_painted_shutters: "normandy_painted",
    normandy_stained: "normandy_stained",
    normandy_stained_shutters: "normandy_stained",
    citylights: "citylights_aluminum",
    citylights_aluminum: "citylights_aluminum",
    citylights_cordless_aluminum_blinds: "citylights_aluminum",
    mini_blinds: "citylights_aluminum",
    faux_wood: "faux_wood",
    ultimate_cordless_faux_wood_blinds: "faux_wood",
    honeycomb: "honeycomb",
    portrait_honeycomb_shades: "honeycomb",
    palladian_shelf: "palladian_shelf",
    palladian_window_shelf: "palladian_shelf",
    perfectsheer: "perfectsheer",
    perfectsheer_shades: "perfectsheer",
    roller: "roller",
    roller_shades: "roller",
    soluna_roller_shades: "roller",
    roman: "roman",
    roman_shades: "roman",
    centerpiece_roman_shades: "roman",
    smartdrape: "smartdrape",
    smartfold: "smartfold",
    smartfold_shades: "smartfold",
    smartprivacy_faux: "smartprivacy_faux",
    smartprivacy_cordless_faux_wood_blinds: "smartprivacy_faux",
    synchrony_vertical: "synchrony_vertical",
    synchrony_vertical_blinds: "synchrony_vertical",
    vertical_blinds: "synchrony_vertical",
    vertical_honeycomb: "vertical_honeycomb",
    portrait_vertical_honeycomb_shades: "vertical_honeycomb",
    wood_blinds: "wood_blinds",
    ultimate_normandy_cordless_wood_blinds: "wood_blinds",
  },
  lotus: {
    lotus_mini_blinds: "lotus_mini_blinds",
    lotus_aluminum_mini_blinds: "lotus_mini_blinds",
    mini_blinds: "lotus_mini_blinds",
    lotus_faux_wood_blinds: "lotus_faux_wood_blinds",
    faux_wood_blinds: "lotus_faux_wood_blinds",
    faux_wood: "lotus_faux_wood_blinds",
    lotus_roller_shades: "lotus_roller_shades",
    roller_shades: "lotus_roller_shades",
    roller: "lotus_roller_shades",
    lotus_vertical_blinds: "lotus_vertical_blinds",
    vertical_blinds: "lotus_vertical_blinds",
    synchrony_vertical: "lotus_vertical_blinds",
    lotus_vinyl_blinds: "lotus_vinyl_blinds",
    vinyl_blinds: "lotus_vinyl_blinds",
  },
  polar: {
    all_seasons_retractable_screen: "all_seasons_retractable_screen",
    all_seasons_retractable_screen_system: "all_seasons_retractable_screen",
    drop_arm_window_awning: "drop_arm_window_awning",
    elite_patio: "elite_patio",
    elite_patio_roll_shade: "elite_patio",
    interior_roller: "interior_roller",
    interior_roller_shade: "interior_roller",
    mega_exterior: "mega_exterior",
    mega_exterior_roll_shade: "mega_exterior",
    motorized_drapery_track: "motorized_drapery_track",
    premium_awning: "premium_awning",
    premium_retractable_awning: "premium_awning",
    premium_plus_awning: "premium_plus_awning",
    premium_plus_retractable_awning: "premium_plus_awning",
    premium_pro_awning: "premium_pro_awning",
    premium_pro_retractable_awning: "premium_pro_awning",
    select_awning: "select_awning",
    select_retractable_awning: "select_awning",
    titan_patio: "titan_patio",
    titan_patio_roll_shade: "titan_patio",
  },
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function key(value: unknown): string {
  return text(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function combined(values: OrderFormSourceValues): Record<string, unknown> {
  return {
    ...values,
    ...(values.details || {}),
    ...(values.options_json || {}),
  };
}

export function detectOrderFormManufacturer(
  values: OrderFormSourceValues,
): OrderFormManufacturer | null {
  const source = combined(values);
  const haystack = [
    source.manufacturer,
    source.manufacturer_name,
    source.supplier,
    source.supplier_key,
    source.product_id,
    source.productId,
    source.product_type,
    source.productType,
    source.program_id,
    source.programId,
  ].map(key).join(" ");

  if (haystack.includes("onyx")) return "onyx";
  if (haystack.includes("norman") || haystack.includes("woodlore") || haystack.includes("normandy")) return "norman";
  if (haystack.includes("lotus")) return "lotus";
  if (haystack.includes("polar")) return "polar";
  return null;
}

function candidateProductKeys(values: OrderFormSourceValues): string[] {
  const source = combined(values);
  return [
    source.program_id,
    source.programId,
    source.product_id,
    source.productId,
    source.product_type,
    source.productType,
    source.product_name,
    source.productName,
    source.category,
  ].map(key).filter(Boolean);
}

export function resolveManufacturerOrderForm(
  values: OrderFormSourceValues,
): OrderFormRegistryEntry | null {
  const manufacturer = detectOrderFormManufacturer(values);
  if (!manufacturer) return null;

  const entries = REGISTRY.manufacturers[manufacturer] || [];
  const candidates = candidateProductKeys(values);
  for (const candidate of candidates) {
    const productKey = aliases[manufacturer][candidate] || candidate;
    const entry = entries.find((item) => item.product_key === productKey);
    if (entry) return entry;
  }
  return null;
}

export function manufacturerOrderFormRegistry(): RegistryShape {
  return REGISTRY;
}

export function buildAgenticOrderManifest(input: {
  customerId: string;
  quoteId: string;
  measureStatus: "measure_required" | "no_measure";
  technicalMeasureSubmitted: boolean;
  lines: Array<{ id: string; values: OrderFormSourceValues }>;
}): AgenticOrderManifest {
  const lineItemPages = input.lines.map((line, index): AgenticOrderManifestLine => {
    const entry = resolveManufacturerOrderForm(line.values);
    if (!entry) {
      return {
        sourceLineId: line.id,
        sourceLineNumber: index + 1,
        quantity: Math.max(1, Number(line.values.quantity) || 1),
        routingKey: null,
        productName: null,
        templateUrl: null,
        schemaUrl: null,
        templateVersion: 1,
        sourceValues: line.values,
        status: "order_review_required",
        reason: "Manufacturer and exact product/program must resolve to one dedicated ordering form.",
      };
    }
    const safeToRelease = !/required|unverified/i.test(entry.verification);
    return {
      sourceLineId: line.id,
      sourceLineNumber: index + 1,
      quantity: Math.max(1, Number(line.values.quantity) || 1),
      routingKey: entry.routing_key,
      productName: entry.product_name,
      templateUrl: `/order-form-templates/${entry.template_docx}`,
      schemaUrl: `/order-form-templates/${entry.schema}`,
      templateVersion: 1,
      sourceValues: line.values,
      status: safeToRelease ? "ready" : "order_review_required",
      reason: safeToRelease ? null : `Ordering-form verification gate: ${entry.verification}`,
    };
  });

  return {
    coverPage: {
      template: "customer-order-cover-v1",
      customerId: input.customerId,
      quoteId: input.quoteId,
      measureStatus: input.measureStatus,
      authority: input.measureStatus === "measure_required" && input.technicalMeasureSubmitted
        ? "submitted_technical_measure_over_signed_contract"
        : "signed_contract",
    },
    lineItemPages,
    releaseStatus: lineItemPages.every((line) => line.status === "ready")
      ? "ready"
      : "order_review_required",
  };
}
