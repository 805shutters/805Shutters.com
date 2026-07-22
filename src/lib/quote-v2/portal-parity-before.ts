import rawAudit from "./fixtures/portal-parity/before-cases.json";
import { getSourceManifestEntry } from "./source-manifest";

export const PORTAL_PARITY_COMPONENT_CATEGORIES = [
  "base_grid",
  "fabric_upgrade",
  "accessory",
  "operating_system",
  "size_surcharge",
  "freight",
  "processing",
  "tax",
  "other",
] as const;

export type PortalParityComponentCategory =
  (typeof PORTAL_PARITY_COMPONENT_CATEGORIES)[number];

export type PortalParityMoneyComponent = Readonly<{
  id: string;
  category: PortalParityComponentCategory;
  label: string;
  amountCents: number;
}>;

export type PortalParityLedger = Readonly<{
  id: string;
  audience: "customer_retail" | "dealer_cost";
  verification:
    | "portal_verified"
    | "official_price_book_verified"
    | "official_dealer_book_verified"
    | "user_supplied_pricing_evidence";
  components: readonly PortalParityMoneyComponent[];
  subtotalCents: number;
  freightCents: number;
  processingCents: number;
  taxCents: number;
  grandTotalCents: number;
}>;

export type PortalParityBeforeCase = Readonly<{
  id: string;
  manufacturer: "Norman" | "Polar" | "Lotus" | "Onyx";
  scenario:
    | "ordinary"
    | "option_heavy"
    | "large_or_surcharge_sensitive"
    | "portal_reference";
  classification: string;
  product: Readonly<{
    id: string;
    name: string;
    programId: string;
    programName: string;
  }>;
  lines: readonly Readonly<{
    widthInches: number;
    heightInches: number;
    quantity: number;
    configuration: string;
  }>[];
  source: Readonly<{
    sourceId: string;
    pages: readonly number[];
    evidenceRefs: readonly string[];
    note: string;
  }>;
  manufacturerOutput: Readonly<{
    comparableLedgerId: string | null;
    ledgers: readonly PortalParityLedger[];
  }>;
  systemBefore: Readonly<{
    captureMethod: "exact_v2_backend_runtime";
    status: "priced" | "priced_but_send_blocked" | "unpriceable";
    productStatus: string;
    validationStatus: "valid" | "blocked";
    sendable: boolean;
    selectionFingerprint: string | null;
    components: readonly PortalParityMoneyComponent[];
    customerRetailSubtotalCents: number;
    displayedTotalCents: number;
    internalCost: Readonly<{
      productCents: number;
      freightCents: number;
      oversizeCents: number;
      processingCents: number;
      landedCents: number;
    }>;
    blockCodes: readonly string[];
    error: string | null;
    nonAuthoritativeDiagnostic: Readonly<{
      sourceListCents: number | null;
      dealerCents: number;
      projectedCustomerCents: number;
      note: string;
    }> | null;
  }>;
  comparison: Readonly<{
    basis: "manufacturer_msrp_vs_805_customer_retail";
    manufacturerCents: number | null;
    systemCents: number;
    differenceCents: number | null;
    percentageBasisPoints: number | null;
    result: "pass" | "fail" | "unverified";
    firstDiscrepancy: string;
    suspectedCause: string;
  }>;
  limitations: readonly string[];
}>;

export type PortalParityBeforeAudit = Readonly<{
  schemaVersion: 1;
  captureId: string;
  capturePhase: "before_correction";
  capturedAt: string;
  engine: Readonly<{
    route: "/quote-lab/";
    interfaceMarker: "exact-existing-builder";
    adapter: "repriceExactQuoteBuilderForQuoteLabPreview";
    backend: "v2";
    revision: string;
    catalogAsOf: string;
  }>;
  safety: Readonly<{
    draftLabel: "CODEX PRICING TEST — DO NOT ORDER";
    submitted: false;
    customerData: "neutral_test_only";
    productionWrites: false;
    customerQuotesSent: false;
    manufacturerOrdersPlaced: false;
  }>;
  threshold: Readonly<{
    absoluteCents: number;
    relativeBasisPoints: number;
    rule: string;
  }>;
  evidence: readonly Readonly<{
    id: string;
    kind: string;
    classification: string;
    path: string;
    sha256?: string;
    byteLength?: number;
    exactCaseIds: readonly string[];
    redacted: boolean;
    note: string;
  }>[];
  coverage: readonly Readonly<{
    manufacturer: "Norman" | "Polar" | "Lotus" | "Onyx";
    caseCount: number;
    distinctProductCount: number;
    status: string;
    limitation: string | null;
  }>[];
  cases: readonly PortalParityBeforeCase[];
}>;

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
  return value;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${label} must be nonempty text.`);
  }
  return value;
}

function cents(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new TypeError(`${label} must be nonnegative integer cents.`);
  }
  return Number(value);
}

function nullableCents(value: unknown, label: string): number | null {
  return value === null ? null : cents(value, label);
}

function componentTotal(value: unknown, label: string): number {
  return array(value, label).reduce((total, entry, index) => {
    const component = record(entry, `${label}[${index}]`);
    text(component.id, `${label}[${index}].id`);
    text(component.label, `${label}[${index}].label`);
    if (!PORTAL_PARITY_COMPONENT_CATEGORIES.includes(
      component.category as PortalParityComponentCategory,
    )) {
      throw new TypeError(`${label}[${index}].category is unsupported.`);
    }
    return total + cents(component.amountCents, `${label}[${index}].amountCents`);
  }, 0);
}

function expectedResult(
  differenceCents: number,
  percentageBasisPoints: number,
  absoluteThreshold: number,
  relativeThreshold: number,
): "pass" | "fail" {
  return Math.abs(differenceCents) > absoluteThreshold ||
    percentageBasisPoints > relativeThreshold
    ? "fail"
    : "pass";
}

/**
 * Runtime validation intentionally treats the BEFORE capture as evidence, not
 * as editable pricing configuration. Every cent is independently reconciled
 * before the typed artifact is exported.
 */
export function assertPortalParityBeforeAudit(
  value: unknown,
): asserts value is PortalParityBeforeAudit {
  const root = record(value, "portal parity BEFORE audit");
  if (root.schemaVersion !== 1) throw new TypeError("Unsupported portal parity schema version.");
  if (root.capturePhase !== "before_correction") {
    throw new TypeError("The immutable capture must be BEFORE correction.");
  }
  text(root.captureId, "captureId");
  text(root.capturedAt, "capturedAt");

  const engine = record(root.engine, "engine");
  if (
    engine.route !== "/quote-lab/" ||
    engine.interfaceMarker !== "exact-existing-builder" ||
    engine.adapter !== "repriceExactQuoteBuilderForQuoteLabPreview" ||
    engine.backend !== "v2"
  ) {
    throw new TypeError("The capture is not from the actual V2 Quote Lab route and adapter.");
  }
  if (!/^[a-f0-9]{40}$/.test(text(engine.revision, "engine.revision"))) {
    throw new TypeError("engine.revision must be a full Git SHA.");
  }

  const safety = record(root.safety, "safety");
  if (
    safety.draftLabel !== "CODEX PRICING TEST — DO NOT ORDER" ||
    safety.submitted !== false ||
    safety.customerData !== "neutral_test_only" ||
    safety.productionWrites !== false ||
    safety.customerQuotesSent !== false ||
    safety.manufacturerOrdersPlaced !== false
  ) {
    throw new TypeError("Portal parity safety boundary is incomplete.");
  }

  const threshold = record(root.threshold, "threshold");
  const absoluteThreshold = cents(threshold.absoluteCents, "threshold.absoluteCents");
  const relativeThreshold = cents(
    threshold.relativeBasisPoints,
    "threshold.relativeBasisPoints",
  );

  const evidenceIds = new Set<string>();
  for (const [index, rawEvidence] of array(root.evidence, "evidence").entries()) {
    const evidence = record(rawEvidence, `evidence[${index}]`);
    const id = text(evidence.id, `evidence[${index}].id`);
    if (evidenceIds.has(id)) throw new TypeError(`Duplicate evidence ID ${id}.`);
    evidenceIds.add(id);
    text(evidence.path, `evidence[${index}].path`);
    if (evidence.redacted !== true) {
      throw new TypeError(`Evidence ${id} lacks a redaction attestation.`);
    }
  }

  const cases = array(root.cases, "cases");
  if (cases.length !== 10) throw new TypeError("The BEFORE audit must contain exactly ten honest cases.");
  const caseIds = new Set<string>();
  for (const [caseIndex, rawCase] of cases.entries()) {
    const auditCase = record(rawCase, `cases[${caseIndex}]`);
    const caseId = text(auditCase.id, `cases[${caseIndex}].id`);
    if (caseIds.has(caseId)) throw new TypeError(`Duplicate case ID ${caseId}.`);
    caseIds.add(caseId);

    const product = record(auditCase.product, `${caseId}.product`);
    text(product.id, `${caseId}.product.id`);
    text(product.programId, `${caseId}.product.programId`);
    const lines = array(auditCase.lines, `${caseId}.lines`);
    if (lines.length === 0) throw new TypeError(`${caseId} has no measured lines.`);
    for (const [lineIndex, rawLine] of lines.entries()) {
      const line = record(rawLine, `${caseId}.lines[${lineIndex}]`);
      if (!(Number(line.widthInches) > 0) || !(Number(line.heightInches) > 0)) {
        throw new TypeError(`${caseId} line measurements must be positive.`);
      }
      if (!Number.isSafeInteger(line.quantity) || Number(line.quantity) < 1) {
        throw new TypeError(`${caseId} line quantity must be a positive integer.`);
      }
      text(line.configuration, `${caseId}.lines[${lineIndex}].configuration`);
    }

    const source = record(auditCase.source, `${caseId}.source`);
    getSourceManifestEntry(text(source.sourceId, `${caseId}.source.sourceId`));
    for (const evidenceRef of array(source.evidenceRefs, `${caseId}.source.evidenceRefs`)) {
      if (!evidenceIds.has(text(evidenceRef, `${caseId}.source.evidenceRef`))) {
        throw new TypeError(`${caseId} references unknown evidence ${String(evidenceRef)}.`);
      }
    }

    const manufacturerOutput = record(
      auditCase.manufacturerOutput,
      `${caseId}.manufacturerOutput`,
    );
    const ledgers = array(manufacturerOutput.ledgers, `${caseId}.manufacturerOutput.ledgers`);
    const ledgerIds = new Set<string>();
    for (const [ledgerIndex, rawLedger] of ledgers.entries()) {
      const ledger = record(rawLedger, `${caseId}.ledgers[${ledgerIndex}]`);
      const ledgerId = text(ledger.id, `${caseId}.ledgers[${ledgerIndex}].id`);
      if (ledgerIds.has(ledgerId)) throw new TypeError(`${caseId} has duplicate ledger ${ledgerId}.`);
      ledgerIds.add(ledgerId);
      const summedComponents = componentTotal(
        ledger.components,
        `${caseId}.ledgers[${ledgerIndex}].components`,
      );
      const subtotal = cents(ledger.subtotalCents, `${caseId}.${ledgerId}.subtotalCents`);
      const freight = cents(ledger.freightCents, `${caseId}.${ledgerId}.freightCents`);
      const processing = cents(
        ledger.processingCents,
        `${caseId}.${ledgerId}.processingCents`,
      );
      const tax = cents(ledger.taxCents, `${caseId}.${ledgerId}.taxCents`);
      const grand = cents(ledger.grandTotalCents, `${caseId}.${ledgerId}.grandTotalCents`);
      if (summedComponents !== subtotal) {
        throw new TypeError(`${caseId}/${ledgerId} component cents do not equal subtotal.`);
      }
      if (subtotal + freight + processing + tax !== grand) {
        throw new TypeError(`${caseId}/${ledgerId} charges do not equal grand total.`);
      }
    }
    const comparableId = manufacturerOutput.comparableLedgerId;
    if (comparableId !== null && !ledgerIds.has(String(comparableId))) {
      throw new TypeError(`${caseId} comparable ledger does not exist.`);
    }

    const before = record(auditCase.systemBefore, `${caseId}.systemBefore`);
    if (before.captureMethod !== "exact_v2_backend_runtime") {
      throw new TypeError(`${caseId} was not captured through the exact V2 backend.`);
    }
    const systemComponentTotal = componentTotal(
      before.components,
      `${caseId}.systemBefore.components`,
    );
    const systemSubtotal = cents(
      before.customerRetailSubtotalCents,
      `${caseId}.systemBefore.customerRetailSubtotalCents`,
    );
    if (systemComponentTotal !== systemSubtotal) {
      throw new TypeError(`${caseId} system components do not equal customer subtotal.`);
    }
    if (cents(before.displayedTotalCents, `${caseId}.displayedTotalCents`) !== systemSubtotal) {
      throw new TypeError(`${caseId} displayed total does not equal captured customer subtotal.`);
    }
    const internal = record(before.internalCost, `${caseId}.internalCost`);
    const landed =
      cents(internal.productCents, `${caseId}.internalCost.productCents`) +
      cents(internal.freightCents, `${caseId}.internalCost.freightCents`) +
      cents(internal.oversizeCents, `${caseId}.internalCost.oversizeCents`) +
      cents(internal.processingCents, `${caseId}.internalCost.processingCents`);
    if (landed !== cents(internal.landedCents, `${caseId}.internalCost.landedCents`)) {
      throw new TypeError(`${caseId} internal landed-cost cents do not reconcile.`);
    }

    const comparison = record(auditCase.comparison, `${caseId}.comparison`);
    if (comparison.basis !== "manufacturer_msrp_vs_805_customer_retail") {
      throw new TypeError(`${caseId} compares unlike pricing audiences.`);
    }
    const manufacturerCents = nullableCents(
      comparison.manufacturerCents,
      `${caseId}.comparison.manufacturerCents`,
    );
    const systemCents = cents(comparison.systemCents, `${caseId}.comparison.systemCents`);
    if (systemCents !== systemSubtotal) {
      throw new TypeError(`${caseId} comparison system cents do not match BEFORE output.`);
    }
    if (manufacturerCents === null) {
      if (
        comparison.differenceCents !== null ||
        comparison.percentageBasisPoints !== null ||
        comparison.result !== "unverified" ||
        comparableId !== null
      ) {
        throw new TypeError(`${caseId} must remain explicitly MSRP-unverified.`);
      }
    } else {
      const difference = systemCents - manufacturerCents;
      if (comparison.differenceCents !== difference) {
        throw new TypeError(`${caseId} dollar difference is incorrect.`);
      }
      const percentage = Math.round(
        (Math.abs(difference) * 10_000) / manufacturerCents,
      );
      if (comparison.percentageBasisPoints !== percentage) {
        throw new TypeError(`${caseId} percentage difference is incorrect.`);
      }
      if (
        comparison.result !==
        expectedResult(difference, percentage, absoluteThreshold, relativeThreshold)
      ) {
        throw new TypeError(`${caseId} pass/fail result violates the audit threshold.`);
      }
      if (comparableId === null) {
        throw new TypeError(`${caseId} verified MSRP has no comparable ledger.`);
      }
    }
  }

  for (const [index, rawEvidence] of array(root.evidence, "evidence").entries()) {
    const evidence = record(rawEvidence, `evidence[${index}]`);
    for (const exactCaseId of array(evidence.exactCaseIds, `evidence[${index}].exactCaseIds`)) {
      if (!caseIds.has(text(exactCaseId, `evidence[${index}].exactCaseId`))) {
        throw new TypeError(`Evidence references unknown case ${String(exactCaseId)}.`);
      }
    }
  }
}

assertPortalParityBeforeAudit(rawAudit);

export const PORTAL_PARITY_BEFORE_AUDIT = Object.freeze(
  rawAudit,
) as unknown as PortalParityBeforeAudit;

export function portalParityBeforeCase(id: string): PortalParityBeforeCase {
  const found = PORTAL_PARITY_BEFORE_AUDIT.cases.find((entry) => entry.id === id);
  if (!found) throw new Error(`Unknown portal parity BEFORE case: ${id}`);
  return found;
}
