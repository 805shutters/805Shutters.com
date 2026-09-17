import type { CustomerContractTerms } from "./customer-contract-terms";
import type { PublicQuote, SignedContractSnapshot } from "./public-quote";

export class ContractContentError extends Error {}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function terms(value: unknown): CustomerContractTerms {
  const candidate = object(value);
  if (candidate.version !== "2026-09-16" || !Array.isArray(candidate.sections) || candidate.sections.length === 0) {
    throw new ContractContentError("The signed contract terms snapshot is missing or unsupported.");
  }
  for (const rawSection of candidate.sections) {
    const section = object(rawSection);
    if (
      (section.heading != null && typeof section.heading !== "string") ||
      (section.paragraphs != null && (!Array.isArray(section.paragraphs) || !section.paragraphs.every((item) => typeof item === "string"))) ||
      (section.bullets != null && (!Array.isArray(section.bullets) || !section.bullets.every((item) => typeof item === "string")))
    ) {
      throw new ContractContentError("The signed contract terms snapshot is malformed.");
    }
  }
  return candidate as unknown as CustomerContractTerms;
}

export function validateSignedContractSnapshot(
  value: unknown,
  expectedSignature?: string,
): SignedContractSnapshot {
  const snapshot = object(value) as Partial<SignedContractSnapshot>;
  const signature = String(snapshot.customerSignature || "").trim();
  const totals = object(snapshot.totals);
  const quote = object(snapshot.quote);
  const business = object(snapshot.business);
  const finiteMoney = (candidate: unknown) => typeof candidate === "number" && Number.isFinite(candidate);
  if (
    snapshot.schema !== "805_signed_quote_contract_v1" ||
    typeof snapshot.signedAt !== "string" || !snapshot.signedAt ||
    typeof snapshot.customerPrintedName !== "string" || !snapshot.customerPrintedName.trim() ||
    typeof snapshot.customerName !== "string" || !snapshot.customerName.trim() ||
    snapshot.customerEmailDelivery !== "enabled" ||
    !signature ||
    signature.length > 200 ||
    /^data:/i.test(signature) ||
    !Array.isArray(snapshot.lines) ||
    snapshot.lines.length === 0 ||
    typeof quote.id !== "string" || !quote.id ||
    typeof business.name !== "string" || !business.name ||
    typeof business.website !== "string" || !business.website ||
    typeof business.email !== "string" || !business.email ||
    !Number.isFinite(Date.parse(String(snapshot.signedAt || ""))) ||
    !Array.isArray(totals.fees) ||
    !finiteMoney(totals.subtotal) || !finiteMoney(totals.discount) ||
    !finiteMoney(totals.tax) || !finiteMoney(totals.sourceTotalAdjustment) ||
    !finiteMoney(totals.depositDue) || !finiteMoney(totals.balanceDue) ||
    !finiteMoney(totals.total) || Number(totals.total) <= 0 ||
    !totals.fees.every((fee) => {
      const entry = object(fee);
      return typeof entry.name === "string" && Boolean(entry.name.trim()) && finiteMoney(entry.amount);
    })
  ) {
    throw new ContractContentError("The immutable signed contract snapshot is incomplete.");
  }
  if (expectedSignature && signature !== expectedSignature.trim()) {
    throw new ContractContentError("The signed contract signature no longer matches its immutable snapshot.");
  }
  const signedTerms = terms(snapshot.terms);
  const expectedHeadings = snapshot.hasOnyxShutters
    ? ["Shutter Manufacturer Warranty", "Manufacturer warranty coverage", "Manufacturer exclusions", "Color matching", "Payment at Installation"]
    : ["Payment at Installation"];
  if (JSON.stringify(signedTerms.sections.map(section => section.heading)) !== JSON.stringify(expectedHeadings)) {
    throw new ContractContentError("The signed contract terms cannot be displayed by the original contract layout.");
  }
  for (const line of snapshot.lines) {
    if (
      typeof line.lineItemId !== "string" || !line.lineItemId ||
      typeof line.productName !== "string" || !line.productName || !Array.isArray(line.options) ||
      typeof line.showDesignOptions !== "boolean" || !Array.isArray(line.designOptions) ||
      (line.showDesignOptions && (line.designOptions.length === 0 || !line.designOptions.every(option =>
        typeof option.id === "string" && typeof option.label === "string" && typeof option.productName === "string"
        && typeof option.styleName === "string" && Array.isArray(option.options)
        && option.options.every(value => typeof value === "string") && option.priceReady
        && finiteMoney(option.lineTotal) && finiteMoney(option.unitPrice)))) ||
      !line.options.every((option) => typeof option === "string") ||
      !finiteMoney(line.unitPrice) || !finiteMoney(line.lineTotal) || !finiteMoney(line.discountPercent) ||
      !finiteMoney(line.quantity) || Number(line.quantity) <= 0 || Number(line.lineTotal) < 0
    ) {
      throw new ContractContentError("The immutable signed contract has an incomplete line item.");
    }
  }
  return snapshot as SignedContractSnapshot;
}

export function signedSnapshotPublicQuote(snapshot: SignedContractSnapshot): PublicQuote {
  return {
    token: "", id: snapshot.quote.id, quoteNumber: snapshot.quote.quoteNumber,
    customerName: snapshot.customerName, customerAddress: snapshot.customerAddress,
    customerPhone: snapshot.customerPhone, customerEmail: snapshot.customerEmail,
    status: "signed", signed: true, signedAt: snapshot.signedAt,
    // Freeze the same display decision as the signed page. Legacy grouped lines
    // can contain multiple purchased configurations; do not collapse them.
    lines: snapshot.lines.map(line => ({ ...line, id: line.lineItemId, priceReady: true,
      designOptions: line.showDesignOptions ? line.designOptions : [],
      showDesignOptions: Boolean(line.showDesignOptions) })),
    ...snapshot.totals, allPriced: true, hasOnyxShutters: snapshot.hasOnyxShutters,
    payment: { available: false, dueType: null, amountDue: 0, outstanding: 0, depositPaid: 0, paidTotal: 0 },
    adjustments: { discountPercent: 0, discountFlat: 0, taxPercent: 0, depositPercent: 0,
      totalOverride: null, balanceDueOverride: null, balanceAdjustmentNote: null, fees: [] },
    business: snapshot.business, versions: [],
  };
}
