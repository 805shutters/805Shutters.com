import { readFileSync } from "node:fs";
import { join } from "node:path";

type RawCatalog = {
  sourceSha256: string;
  products: Array<Record<string, unknown>>;
};

let rawCatalogCache: RawCatalog | null = null;

function rawCatalog() {
  if (!rawCatalogCache) {
    rawCatalogCache = JSON.parse(readFileSync(join(process.cwd(), "data/quote-button-catalog.json"), "utf8")) as RawCatalog;
  }
  return rawCatalogCache;
}

/**
 * Button choices for quote line entry.
 * The sequence seed is the field list. This catalog fills choices and defaults
 * the seed left blank. `applyQuoteButtonPacks` accepts a later field guide
 * without changing the screen.
 */

export function orderEntryGuideSha256() {
  return rawCatalog().sourceSha256;
}

export const COMMON_ROOM_NAMES = [
  "Living",
  "Family",
  "Kitchen",
  "Dining",
  "Primary Bed",
  "Bed 2",
  "Bed 3",
  "Bath",
  "Office",
  "Laundry",
  "Entry",
  "Patio",
] as const;

export const QUOTE_BUTTON_CONTROLS = ["buttons", "dimension", "room", "quantity", "yesno", "notes", "pending"] as const;

export type QuoteButtonControl = (typeof QUOTE_BUTTON_CONTROLS)[number];

export type QuoteButtonChoice = { value: string; label: string };

export type QuoteButtonValueKind = "string" | "number" | "boolean";

export type QuoteButtonGuideField = {
  key: string;
  askOrder: number;
  required: boolean;
  control: QuoteButtonControl;
  multi: boolean;
  choices: QuoteButtonChoice[];
  defaultValue: string | string[] | null;
  dependsOn: string[];
  laterThan: string[];
  recheckAgainst: string[];
  pending: boolean;
  step: "1/8" | "1/16" | null;
  databaseChoices: boolean;
  extras: string[];
  skip: boolean;
  duplicateOf: string | null;
  valueKind: QuoteButtonValueKind;
};

export type QuoteButtonProduct = {
  manufacturer: string;
  category: string;
  productName: string;
  fields: QuoteButtonGuideField[];
};

/** A later drop-in of choices for products whose lists were still missing. */
export type QuoteButtonFieldPack = {
  manufacturer: string;
  category: string;
  productName?: string;
  fields: Array<Partial<QuoteButtonGuideField> & { key: string }>;
};

export type QuoteButtonScreenField = {
  fieldKey: string;
  label: string;
  control: QuoteButtonControl;
  required: boolean;
  multi: boolean;
  choices: QuoteButtonChoice[];
  defaultValue: string | string[] | null;
  step: "1/8" | "1/16" | null;
  pending: boolean;
  askOrder: number;
  recheckAgainst: string[];
  valueKind: QuoteButtonValueKind;
  extras: string[];
  dependsOn: string[];
};

const ROOM_CHOICES: QuoteButtonChoice[] = COMMON_ROOM_NAMES.map((name) => ({ value: name, label: name }));

function textList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function choicesOf(value: unknown): QuoteButtonChoice[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const choice = typeof record.value === "string" ? record.value.trim() : "";
    if (!choice) return [];
    const label = typeof record.label === "string" && record.label.trim() ? record.label.trim() : choice;
    return [{ value: choice, label }];
  });
}

function controlOf(value: unknown): QuoteButtonControl {
  return typeof value === "string" && (QUOTE_BUTTON_CONTROLS as readonly string[]).includes(value) ? value as QuoteButtonControl : "pending";
}

function defaultOf(value: unknown): string | string[] | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const items = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    return items.length ? items : null;
  }
  return null;
}

export function presentQuoteButtonField(field: QuoteButtonGuideField): QuoteButtonGuideField {
  if (field.control === "room") {
    return { ...field, choices: ROOM_CHOICES, pending: false, multi: false };
  }
  if (field.control === "notes") {
    const choices = field.choices.length ? field.choices : [{ value: "None", label: "None" }];
    const fallback = choices.some((choice) => choice.value === "None") ? ["None"] : [choices[0].value];
    return {
      ...field,
      choices,
      multi: true,
      pending: false,
      defaultValue: field.defaultValue ?? fallback,
    };
  }
  if (field.control === "quantity" && field.key === "quantity" && field.defaultValue == null) {
    return { ...field, defaultValue: "1" };
  }
  return field;
}

function asField(value: unknown, patch?: Partial<QuoteButtonGuideField> & { key: string }): QuoteButtonGuideField {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const key = patch?.key || (typeof record.key === "string" ? record.key : "");
  const merged = { ...record, ...patch };
  const control = controlOf(merged.control);
  return presentQuoteButtonField({
    key,
    askOrder: typeof merged.askOrder === "number" ? merged.askOrder : 0,
    required: merged.required !== false,
    control,
    multi: merged.multi === true || control === "notes",
    choices: choicesOf(merged.choices),
    defaultValue: defaultOf(merged.defaultValue),
    dependsOn: textList(merged.dependsOn),
    laterThan: textList(merged.laterThan),
    recheckAgainst: textList(merged.recheckAgainst),
    pending: merged.pending === true || control === "pending",
    step: merged.step === "1/16" ? "1/16" : merged.step === "1/8" ? "1/8" : null,
    databaseChoices: merged.databaseChoices === true,
    extras: textList(merged.extras),
    skip: merged.skip === true,
    duplicateOf: typeof merged.duplicateOf === "string" ? merged.duplicateOf : null,
    valueKind: merged.valueKind === "number" || merged.valueKind === "boolean" ? merged.valueKind : "string",
  });
}

function productFromRaw(value: unknown): QuoteButtonProduct | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const manufacturer = typeof record.manufacturer === "string" ? record.manufacturer : "";
  const category = typeof record.category === "string" ? record.category : "";
  if (!manufacturer || !category) return null;
  const fields = Array.isArray(record.fields) ? record.fields.map((field) => asField(field)).filter((field) => field.key) : [];
  return {
    manufacturer,
    category,
    productName: typeof record.productName === "string" ? record.productName : category,
    fields,
  };
}

function seededProducts() {
  return rawCatalog().products.flatMap((product) => {
    const presented = productFromRaw(product);
    return presented ? [presented] : [];
  });
}

export function applyQuoteButtonPacks(products: QuoteButtonProduct[], packs: QuoteButtonFieldPack[]) {
  const next = products.map((product) => ({ ...product, fields: product.fields.map((field) => ({ ...field })) }));
  for (const pack of packs) {
    let product = next.find((item) => item.manufacturer === pack.manufacturer && item.category === pack.category);
    if (!product) {
      product = {
        manufacturer: pack.manufacturer,
        category: pack.category,
        productName: pack.productName || pack.category,
        fields: [],
      };
      next.push(product);
    }
    for (const patch of pack.fields) {
      const index = product.fields.findIndex((field) => field.key === patch.key);
      const current = index >= 0 ? product.fields[index] : undefined;
      const merged = asField(current, {
        ...patch,
        pending: patch.choices && patch.choices.length > 0 ? patch.pending === true : patch.pending,
        control: patch.choices && patch.choices.length > 0 && !patch.control && current?.control === "pending" ? "buttons" : patch.control,
      });
      if (index >= 0) product.fields[index] = merged;
      else product.fields.push(merged);
    }
  }
  return next;
}

export function quoteButtonProducts(packs: QuoteButtonFieldPack[] = []) {
  return applyQuoteButtonPacks(seededProducts(), packs);
}

export function quoteButtonProduct(manufacturer: string, category: string, packs: QuoteButtonFieldPack[] = []) {
  return quoteButtonProducts(packs).find((product) => product.manufacturer === manufacturer && product.category === category) ?? null;
}
