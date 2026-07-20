import { catalog, findProductSurcharge, getProduct, getProgram } from "@/lib/quote/catalog";
import { getMotorizationGroupsForProduct } from "@/lib/quote/product-options";
import { priceDesign, type PriceInput } from "@/lib/quote/pricing";
import { getProductPriceBreakdown } from "@mts/lib/pricingEngine";
import type {
  LegacyPriceResult,
  QuoteLabComparison,
  QuoteLabDesignInput,
  QuoteLabLineInput,
  QuoteLabOrderCharge,
  QuoteLabQuoteInput,
} from "./types";

export const QUOTE_LAB_ISOLATION: QuoteLabComparison["isolation"] = {
  database: "none",
  productionWrites: false,
  email: false,
  sms: false,
  payments: false,
  manufacturerOrders: false,
  persistence: "browser-session-only",
};

const LEGACY_PRODUCT_TYPES: Record<string, string> = {
  citylights_aluminum: "Mini Blinds",
  faux_wood: "Faux Wood Blinds",
  honeycomb: "Honeycomb Shades",
  perfectsheer: "Sheer Shades",
  roller: "Roller Shades",
  roman: "Roman Shades",
  smartdrape: "Smart Drapes",
  smartprivacy_faux: "Faux Wood Blinds",
  synchrony_vertical: "Vertical Blinds",
  wood_blinds: "Wood Blinds",
  norman_shutters: "Shutters",
  onyx_shutters: "Shutters",
};

export class QuoteLabInputError extends Error {}

function round2(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function requiredText(value: unknown, label: string, max = 100): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new QuoteLabInputError(`${label} is required.`);
  return text.slice(0, max);
}

function positiveNumber(value: unknown, fallback = 1): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function optionalPositiveNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

export function normalizeQuoteLabQuote(value: unknown): QuoteLabQuoteInput {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const rawLines = Array.isArray(source.lines) ? source.lines.slice(0, 20) : [];
  if (rawLines.length === 0) throw new QuoteLabInputError("Add at least one test window.");

  const lines: QuoteLabLineInput[] = rawLines.map((rawLine, lineIndex) => {
    const line = rawLine && typeof rawLine === "object" ? (rawLine as Record<string, unknown>) : {};
    const rawDesigns = Array.isArray(line.designs) ? line.designs.slice(0, 6) : [];
    if (rawDesigns.length === 0) throw new QuoteLabInputError(`Window ${lineIndex + 1} needs at least one design.`);
    const designs: QuoteLabDesignInput[] = rawDesigns.map((rawDesign, designIndex) => {
      const design = rawDesign && typeof rawDesign === "object" ? (rawDesign as Record<string, unknown>) : {};
      const rawSurcharges = Array.isArray(design.surcharges) ? design.surcharges.slice(0, 30) : [];
      const rawMotorization = Array.isArray(design.motorization) ? design.motorization.slice(0, 12) : [];
      return {
        id: requiredText(design.id, `Design ${designIndex + 1} ID`, 80),
        label: requiredText(design.label, `Design ${designIndex + 1} label`, 8),
        productId: requiredText(design.productId, "Product", 80),
        programId: typeof design.programId === "string" && design.programId ? design.programId.slice(0, 160) : undefined,
        fabric: typeof design.fabric === "string" && design.fabric ? design.fabric.slice(0, 200) : undefined,
        widthInches: positiveNumber(design.widthInches),
        heightInches: positiveNumber(design.heightInches),
        discountPercent: Math.min(100, Math.max(0, Number(design.discountPercent) || 0)),
        legacyRetailOverride: optionalPositiveNumber(design.legacyRetailOverride),
        legacyStoredUnitPrice: optionalPositiveNumber(design.legacyStoredUnitPrice),
        surcharges: rawSurcharges.map((item) => {
          const surcharge = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
          return {
            id: requiredText(surcharge.id, "Surcharge", 160),
            units: Math.max(1, Math.min(50, Math.round(Number(surcharge.units) || 1))),
          };
        }),
        motorization: rawMotorization.map((item) => {
          const motor = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
          return {
            groupId: requiredText(motor.groupId, "Motorization group", 160),
            optionId: requiredText(motor.optionId, "Motorization option", 160),
            units: Math.max(1, Math.min(20, Math.round(Number(motor.units) || 1))),
          };
        }),
      };
    });
    const selectedCandidate = typeof line.selectedDesignId === "string" ? line.selectedDesignId : null;
    return {
      id: requiredText(line.id, `Window ${lineIndex + 1} ID`, 80),
      room: requiredText(line.room, `Window ${lineIndex + 1} room`, 100),
      quantity: Math.max(1, Math.min(100, Math.floor(Number(line.quantity) || 1))),
      selectedDesignId: selectedCandidate,
      designs,
    };
  });

  return {
    id: requiredText(source.id, "Quote ID", 80),
    name: requiredText(source.name, "Quote name", 120),
    lines,
  };
}

function graduatedSurchargeAmount(
  surcharge: NonNullable<ReturnType<typeof findProductSurcharge>>,
  widthInches: number,
): number | null {
  const graduated = surcharge.widthGraduated;
  if (!graduated) return null;
  const index = graduated.widths.findIndex((width) => width >= widthInches);
  if (index >= 0) return graduated.prices[index] ?? null;
  const lastIndex = graduated.widths.length - 1;
  const lastPrice = graduated.prices[lastIndex];
  if (lastPrice == null) return null;
  const extraFeet = Math.max(0, Math.ceil((widthInches - graduated.widths[lastIndex]) / 12));
  return round2(lastPrice + extraFeet * graduated.additionalFootRate);
}

function legacySelectedExtras(design: QuoteLabDesignInput, base: number): {
  perWindow: number;
  once: number;
  warnings: string[];
} {
  const product = getProduct(design.productId);
  if (!product) return { perWindow: 0, once: 0, warnings: ["Legacy comparison could not resolve the product catalog."] };
  const warnings: string[] = [];
  let perWindow = 0;
  let once = 0;

  for (const selection of design.surcharges ?? []) {
    const surcharge = findProductSurcharge(product, selection.id);
    if (!surcharge) {
      warnings.push(`Legacy comparison skipped unknown surcharge '${selection.id}'.`);
      continue;
    }
    let amount = 0;
    if (surcharge.widthGraduated) {
      const graduated = graduatedSurchargeAmount(surcharge, design.widthInches);
      if (graduated == null) {
        warnings.push(`Legacy comparison could not price ${surcharge.name}.`);
        continue;
      }
      amount = graduated;
    } else if (surcharge.value == null) {
      warnings.push(`Legacy comparison skipped unpriced surcharge ${surcharge.name}.`);
      continue;
    } else if (surcharge.kind === "percent") {
      amount = base * (surcharge.value / 100);
    } else if (surcharge.per === "sqft") {
      amount = surcharge.value * ((design.widthInches * design.heightInches) / 144);
    } else {
      const units = surcharge.per === "side" || surcharge.per === "foot" ? Math.max(1, Math.round(selection.units || 1)) : 1;
      amount = surcharge.value * units;
    }
    if (surcharge.per === "once") once += amount;
    else perWindow += amount;
  }

  const allowedMotorGroups = new Set(getMotorizationGroupsForProduct(design.productId));
  for (const selection of design.motorization ?? []) {
    if (!allowedMotorGroups.has(selection.groupId)) {
      warnings.push(`Legacy comparison skipped invalid motorization group '${selection.groupId}'.`);
      continue;
    }
    const option = catalog.motorization[selection.groupId]?.options.find((item) => item.id === selection.optionId);
    if (!option) {
      warnings.push(`Legacy comparison skipped unknown motorization '${selection.optionId}'.`);
      continue;
    }
    const productPrice = option.priceByProduct && design.productId in option.priceByProduct
      ? option.priceByProduct[design.productId]
      : option.price;
    if (productPrice == null) {
      warnings.push(`Legacy comparison could not price ${option.name}.`);
      continue;
    }
    perWindow += productPrice * Math.max(1, Math.round(selection.units || 1));
  }

  return { perWindow: round2(perWindow), once: round2(once), warnings };
}

function legacyPriceDesign(design: QuoteLabDesignInput, quantity: number): LegacyPriceResult {
  const productType = LEGACY_PRODUCT_TYPES[design.productId];
  const product = getProduct(design.productId);
  const program = product && design.programId ? getProgram(product, design.programId) : undefined;

  if (!productType || !product || !program) {
    return {
      status: "unsupported",
      unitPrice: null,
      total: 0,
      pricingMethod: "none",
      explanation: "The active legacy pricing switch has no complete route for this product/program.",
      warnings: [],
    };
  }

  const supplier = design.productId === "norman_shutters" ? "Norman" : design.productId === "onyx_shutters" ? "Onyx" : undefined;
  const result = getProductPriceBreakdown({
    productType,
    width: design.widthInches,
    height: design.heightInches,
    priceGroup: program.priceGroup ?? undefined,
    productLine: design.productId === "faux_wood" ? "Ultimate" : design.productId === "smartprivacy_faux" ? "SmartPrivacy" : undefined,
    program: program.name,
    catalogProgramId: program.id,
    supplier,
    retailPriceOverride: design.legacyRetailOverride,
    fabric: design.fabric,
  });

  if (result.price == null) {
    if (design.legacyStoredUnitPrice != null) {
      return {
        status: "stale_retained",
        unitPrice: design.legacyStoredUnitPrice,
        total: round2(design.legacyStoredUnitPrice * quantity),
        pricingMethod: result.pricingMethod,
        explanation: "The legacy browser could not reprice this configuration, so its previously stored unit price remains billable.",
        warnings: ["This deliberately simulates the stale-price failure mode found in the live architecture."],
      };
    }
    return {
      status: "unpriceable",
      unitPrice: null,
      total: 0,
      pricingMethod: result.pricingMethod,
      explanation: "The legacy engine returned no price for this configuration.",
      warnings: [],
    };
  }

  const extras = legacySelectedExtras(design, result.price);
  const sourceUnit = result.price + extras.perWindow;
  const discountPercent = Math.min(100, Math.max(0, Number(design.discountPercent) || 0));
  const unitPrice = round2(sourceUnit * (1 - discountPercent / 100));
  return {
    status: "ok",
    unitPrice,
    total: round2(unitPrice * quantity + extras.once),
    pricingMethod: result.pricingMethod,
    explanation: design.legacyRetailOverride
      ? `Legacy calculation used the browser-local $${design.legacyRetailOverride.toFixed(2)}/sq ft override.`
      : "Calculated through the active MTS pricing engine and legacy total behavior.",
    warnings: extras.warnings,
  };
}

function orderCharges(quote: QuoteLabQuoteInput): QuoteLabOrderCharge[] {
  let shutterUnits = 0;
  let shadeUnits = 0;
  let oversizeShutters = 0;
  let oversizeShades = 0;

  for (const line of quote.lines) {
    const design = line.designs.find((candidate) => candidate.id === line.selectedDesignId);
    if (!design) continue;
    const product = getProduct(design.productId);
    if (!product) continue;
    const quantity = Math.max(1, Math.floor(line.quantity || 1));
    if (product.productType === "shutter") {
      shutterUnits += quantity;
      if (design.heightInches >= 90) oversizeShutters += quantity;
      continue;
    }
    shadeUnits += quantity;
    const heightAlsoCounts = product.productType === "vertical_blind" || product.productType === "vertical_honeycomb_shade";
    if (design.widthInches >= 90 || (heightAlsoCounts && design.heightInches >= 90)) oversizeShades += quantity;
  }

  const charges: QuoteLabOrderCharge[] = [];
  if (shadeUnits > 0) {
    charges.push({
      id: "freight-shades",
      label: "Blinds & shades freight",
      amount: 25 + Math.max(0, shadeUnits - 1) * 11,
      detail: `$25 first unit + $11 x ${Math.max(0, shadeUnits - 1)} additional`,
    });
  }
  if (shutterUnits > 0) {
    charges.push({
      id: "freight-shutters",
      label: "Shutter freight",
      amount: 75 + Math.max(0, shutterUnits - 1) * 25,
      detail: `$75 first shutter + $25 x ${Math.max(0, shutterUnits - 1)} additional`,
    });
  }
  if (oversizeShades > 0) {
    charges.push({
      id: "oversize-shades",
      label: "Blinds & shades oversize",
      amount: 80 + Math.max(0, oversizeShades - 1) * 50,
      detail: `$80 first oversize unit + $50 x ${Math.max(0, oversizeShades - 1)} additional`,
    });
  }
  if (oversizeShutters > 0) {
    charges.push({
      id: "oversize-shutters",
      label: "Shutter oversize",
      amount: 80 + Math.max(0, oversizeShutters - 1) * 50,
      detail: `$80 first oversize shutter + $50 x ${Math.max(0, oversizeShutters - 1)} additional`,
    });
  }
  return charges.map((charge) => ({ ...charge, amount: round2(charge.amount) }));
}

export function compareQuoteLab(input: unknown): QuoteLabComparison {
  const quote = normalizeQuoteLabQuote(input);
  const findings = new Set<string>();
  const lines = quote.lines.map((line) => {
    const designs = line.designs.map((design) => {
      const authoritativeInput: PriceInput = {
        productId: design.productId,
        programId: design.programId,
        fabric: design.fabric,
        widthInches: design.widthInches,
        heightInches: design.heightInches,
        quantity: line.quantity,
        surcharges: design.surcharges ?? [],
        motorization: design.motorization ?? [],
        discountPercent: design.discountPercent,
      };
      const authoritative = priceDesign(authoritativeInput);
      const legacy = legacyPriceDesign(design, line.quantity);
      if (legacy.status === "stale_retained") findings.add(`${line.room} design ${design.label}: legacy retained a stale price after repricing failed.`);
      if (legacy.status === "unsupported" && authoritative.ok) findings.add(`${line.room} design ${design.label}: available in the authoritative catalog but unsupported by the active legacy switch.`);
      if (design.legacyRetailOverride != null) findings.add(`${line.room} design ${design.label}: legacy result depends on a browser-local retail-rate override.`);
      return {
        designId: design.id,
        label: design.label,
        selected: design.id === line.selectedDesignId,
        authoritative,
        legacy,
      };
    });

    const selected = designs.find((design) => design.selected);
    const sendBlocked = !selected || !selected.authoritative.ok;
    const blockReason = !selected
      ? "Select one design for this window."
      : selected.authoritative.ok
        ? null
        : selected.authoritative.error;
    const authoritativeTotal = selected?.authoritative.ok ? selected.authoritative.total : 0;
    const legacyTotal = round2(designs.reduce((sum, design) => sum + design.legacy.total, 0));
    if (designs.length > 1 && legacyTotal !== authoritativeTotal) {
      findings.add(`${line.room}: legacy total includes every A/B/C alternative; authoritative total includes only the selected design.`);
    }
    if (sendBlocked) findings.add(`${line.room}: authoritative send guard blocks this window until its selected design prices successfully.`);
    return {
      lineId: line.id,
      room: line.room,
      quantity: line.quantity,
      selectedDesignId: line.selectedDesignId,
      designs,
      authoritativeTotal: round2(authoritativeTotal),
      legacyTotal,
      sendBlocked,
      blockReason,
    };
  });

  const authoritativeTotal = round2(lines.reduce((sum, line) => sum + line.authoritativeTotal, 0));
  const legacyTotal = round2(lines.reduce((sum, line) => sum + line.legacyTotal, 0));
  const charges = orderCharges(quote);
  const orderChargeTotal = round2(charges.reduce((sum, charge) => sum + charge.amount, 0));
  if (charges.length > 0) findings.add("Manufacturer freight and oversize net charges are shown separately from customer retail so margin exposure is visible.");

  return {
    quoteId: quote.id,
    quoteName: quote.name,
    authoritativeTotal,
    legacyTotal,
    difference: round2(authoritativeTotal - legacyTotal),
    sendBlocked: lines.some((line) => line.sendBlocked),
    findings: [...findings],
    orderCharges: charges,
    orderChargeTotal,
    lines,
    isolation: QUOTE_LAB_ISOLATION,
  };
}
