import { createHash } from "node:crypto";

/** A calendar date without a time zone. Runtime helpers validate actual dates. */
export type ISODate = `${number}-${number}-${number}`;

export type SelectionPrimitive = string | number | boolean | null;
export type SelectionValue =
  | SelectionPrimitive
  | readonly SelectionValue[]
  | { readonly [key: string]: SelectionValue };
export type SelectionRecord = Readonly<Record<string, SelectionValue>>;

/**
 * The complete, price-affecting state for one selected design.
 *
 * Product-specific engines should narrow `configuration` and `options` with
 * their own JSON-only record types. Database IDs and UI state intentionally do
 * not belong here: changing those must not invalidate an otherwise identical
 * authoritative price.
 */
export interface SelectionContext<
  TConfiguration extends SelectionRecord = SelectionRecord,
  TOptions extends SelectionRecord = SelectionRecord,
> {
  manufacturerId: string;
  productId: string;
  programId: string | null;
  catalogVersion: string;
  catalogAsOf: ISODate;
  widthInches: number;
  heightInches: number;
  quantity: number;
  configuration: TConfiguration;
  options: TOptions;
}

export const PRODUCT_RULE_STATUSES = [
  "complete",
  "documented_limited",
  "manual_quote_required",
  "restriction_source_incomplete",
  "unavailable",
] as const;

export type ProductRuleStatus = (typeof PRODUCT_RULE_STATUSES)[number];

export const VALIDATION_SEVERITIES = [
  "hard_block",
  "auto_derive",
  "warning",
] as const;

export type ValidationSeverity = (typeof VALIDATION_SEVERITIES)[number];

/** Immutable source identity plus an optional rule-level location. */
export interface SourceProvenance {
  sourceId: string;
  fileName: string;
  revision: string;
  effectiveDate: ISODate | null;
  sha256: string;
  page?: number;
  pages?: readonly number[];
  sheet?: string;
  range?: string;
  url?: string;
}

/** A structured, auditable result from one catalog restriction rule. */
export interface ValidationIssue {
  severity: ValidationSeverity;
  ruleId: string;
  source: SourceProvenance;
  selectedValues: SelectionRecord;
  explanation: string;
  /** Values applied by an `auto_derive` rule, when applicable. */
  derivedValues?: SelectionRecord;
}

export interface CatalogVersionWindow {
  catalogVersion: string;
  /** Inclusive date on which this catalog becomes eligible. */
  effectiveFrom: ISODate;
  /** Exclusive retirement date. Null/undefined means no planned retirement. */
  effectiveUntil?: ISODate | null;
}

export type SelectionPriceStatus =
  | "authoritative"
  | "missing"
  | "stale"
  | "unpriceable";

export interface SendabilityInput {
  productStatus: ProductRuleStatus;
  issues: readonly ValidationIssue[];
  selectedDesignId: string | null;
  priceStatus: SelectionPriceStatus;
  selectionFingerprint: string;
  pricedSelectionFingerprint: string | null;
  catalogVersion: string;
  pricedCatalogVersion: string | null;
}

export type SendabilityReasonCode =
  | "product_status_not_sendable"
  | "hard_block"
  | "missing_selected_design"
  | "price_not_authoritative"
  | "selection_fingerprint_mismatch"
  | "catalog_version_mismatch";

export interface SendabilityReason {
  code: SendabilityReasonCode;
  message: string;
}

export interface SendabilityResult {
  sendable: boolean;
  reasons: readonly SendabilityReason[];
  blockingIssues: readonly ValidationIssue[];
}

const SENDABLE_PRODUCT_RULE_STATUSES: ReadonlySet<ProductRuleStatus> = new Set([
  "complete",
  "documented_limited",
]);

export function isProductRuleStatusSendable(
  status: ProductRuleStatus,
): boolean {
  return SENDABLE_PRODUCT_RULE_STATUSES.has(status);
}

export function hasHardBlock(issues: readonly ValidationIssue[]): boolean {
  return issues.some((issue) => issue.severity === "hard_block");
}

/**
 * Fail-closed customer-send gate for one selected design.
 * Warnings and completed auto-derivations remain visible but do not block.
 */
export function evaluateSendability(
  input: SendabilityInput,
): SendabilityResult {
  const reasons: SendabilityReason[] = [];
  const blockingIssues = input.issues.filter(
    (issue) => issue.severity === "hard_block",
  );

  if (!isProductRuleStatusSendable(input.productStatus)) {
    reasons.push({
      code: "product_status_not_sendable",
      message: `Product rule status ${input.productStatus} is not customer-sendable.`,
    });
  }

  if (!input.selectedDesignId?.trim()) {
    reasons.push({
      code: "missing_selected_design",
      message: "A selected design is required for every line item.",
    });
  }

  if (input.priceStatus !== "authoritative") {
    reasons.push({
      code: "price_not_authoritative",
      message: `Price status ${input.priceStatus} is not authoritative.`,
    });
  }

  if (
    !input.selectionFingerprint ||
    !input.pricedSelectionFingerprint ||
    input.selectionFingerprint !== input.pricedSelectionFingerprint
  ) {
    reasons.push({
      code: "selection_fingerprint_mismatch",
      message: "The stored price does not match the current selection.",
    });
  }

  if (
    !input.catalogVersion ||
    !input.pricedCatalogVersion ||
    input.catalogVersion !== input.pricedCatalogVersion
  ) {
    reasons.push({
      code: "catalog_version_mismatch",
      message: "The stored price does not match the required catalog version.",
    });
  }

  if (blockingIssues.length > 0) {
    reasons.push({
      code: "hard_block",
      message: `${blockingIssues.length} authoritative validation issue${blockingIssues.length === 1 ? "" : "s"} must be resolved.`,
    });
  }

  return {
    sendable: reasons.length === 0,
    reasons,
    blockingIssues,
  };
}

function canonicalizeJson(
  value: unknown,
  path: string,
  ancestors: WeakSet<object>,
): string {
  if (value === null) return "null";

  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) {
        throw new TypeError(`Non-finite number at ${path} cannot be fingerprinted.`);
      }
      return Object.is(value, -0) ? "0" : JSON.stringify(value);
    case "object": {
      if (ancestors.has(value)) {
        throw new TypeError(`Circular selection value at ${path}.`);
      }
      ancestors.add(value);

      try {
        if (Array.isArray(value)) {
          const items: string[] = [];
          for (let index = 0; index < value.length; index += 1) {
            if (!(index in value)) {
              throw new TypeError(`Sparse array item at ${path}[${index}].`);
            }
            items.push(
              canonicalizeJson(value[index], `${path}[${index}]`, ancestors),
            );
          }
          return `[${items.join(",")}]`;
        }

        const prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null) {
          throw new TypeError(`Non-JSON object at ${path} cannot be fingerprinted.`);
        }

        const record = value as Record<string, unknown>;
        const entries = Object.keys(record)
          .sort()
          .map((key) => {
            const item = canonicalizeJson(
              record[key],
              `${path}.${key}`,
              ancestors,
            );
            return `${JSON.stringify(key)}:${item}`;
          });
        return `{${entries.join(",")}}`;
      } finally {
        ancestors.delete(value);
      }
    }
    default:
      throw new TypeError(`Unsupported selection value at ${path}.`);
  }
}

/** Stable JSON representation: object key order never changes the result. */
export function canonicalizeSelectionContext(
  selection: SelectionContext,
): string {
  return canonicalizeJson(selection, "$", new WeakSet());
}

/** SHA-256 of the canonical complete selection, prefixed for algorithm agility. */
export function createSelectionFingerprint(
  selection: SelectionContext,
): string {
  const canonical = canonicalizeSelectionContext(selection);
  const digest = createHash("sha256").update(canonical, "utf8").digest("hex");
  return `sha256:${digest}`;
}

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function normalizeCatalogDate(value: ISODate | Date, label: string): ISODate {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new RangeError(`${label} must be a valid date.`);
    }
    return value.toISOString().slice(0, 10) as ISODate;
  }

  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) {
    throw new RangeError(`${label} must use YYYY-MM-DD.`);
  }

  const [, year, month, day] = match;
  if (year === "0000") {
    throw new RangeError(`${label} must be a valid calendar date.`);
  }
  const parsed = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new RangeError(`${label} must be a valid calendar date.`);
  }

  return value;
}

function validateCatalogWindow(window: CatalogVersionWindow): void {
  const effectiveFrom = normalizeCatalogDate(
    window.effectiveFrom,
    `${window.catalogVersion}.effectiveFrom`,
  );
  if (window.effectiveUntil) {
    const effectiveUntil = normalizeCatalogDate(
      window.effectiveUntil,
      `${window.catalogVersion}.effectiveUntil`,
    );
    if (effectiveUntil <= effectiveFrom) {
      throw new RangeError(
        `${window.catalogVersion}.effectiveUntil must be after effectiveFrom.`,
      );
    }
  }
}

/** Inclusive start, exclusive end. Accepting a Date uses its UTC calendar day. */
export function catalogIsActiveAsOf(
  window: CatalogVersionWindow,
  asOf: ISODate | Date,
): boolean {
  validateCatalogWindow(window);
  const date = normalizeCatalogDate(asOf, "asOf");
  return (
    date >= window.effectiveFrom &&
    (!window.effectiveUntil || date < window.effectiveUntil)
  );
}

/**
 * Resolve the newest eligible catalog without consulting the system clock.
 * Equal-date competing versions are rejected instead of being chosen silently.
 */
export function selectCatalogAsOf<T extends CatalogVersionWindow>(
  catalogs: readonly T[],
  asOf: ISODate | Date,
): T | undefined {
  const date = normalizeCatalogDate(asOf, "asOf");
  const eligible = catalogs
    .filter((catalog) => catalogIsActiveAsOf(catalog, date))
    .sort((left, right) =>
      right.effectiveFrom.localeCompare(left.effectiveFrom),
    );

  if (eligible.length < 2) return eligible[0];
  if (eligible[0].effectiveFrom === eligible[1].effectiveFrom) {
    throw new Error(
      `Ambiguous catalog versions effective ${eligible[0].effectiveFrom}: ${eligible[0].catalogVersion}, ${eligible[1].catalogVersion}.`,
    );
  }
  return eligible[0];
}
