import { mobileQuoteFingerprint, validateMobileQuoteWindow, type MobileQuoteDraft } from "./mobile-quote-draft";
import type { MobileQuotePreviewResponse } from "./mobile-quote-preview-response";

// Quote-wide charges can change when another window is added, removed or edited.
// Compare every window, including incomplete ones, before accepting any line prices.
export function mobileQuotePricingFingerprint(draft: MobileQuoteDraft) {
  return JSON.stringify(draft.windows.map(line => [line.id, mobileQuoteFingerprint(line)]));
}

export function applyMobileQuotePreview(current: MobileQuoteDraft | null, requested: MobileQuoteDraft, preview: MobileQuotePreviewResponse): MobileQuoteDraft | null {
  if (!current || current.id !== requested.id || mobileQuotePricingFingerprint(current) !== mobileQuotePricingFingerprint(requested)) return current;
  const requestedLines = requested.windows.filter(line => !validateMobileQuoteWindow(line));
  const expectedIds = new Set(requestedLines.map(line => line.id));
  const responseIds = new Set(preview.lines.map(line => line.lineItemId));
  // Reject duplicate, omitted or unexpected responses even when their counts match.
  if (preview.lines.length !== expectedIds.size || responseIds.size !== expectedIds.size || [...responseIds].some(id => !expectedIds.has(id))) return current;
  const result = structuredClone(current);
  for (const linePrice of preview.lines) {
    const line = result.windows.find(item => item.id === linePrice.lineItemId)!;
    const amount = Number(linePrice.price.total);
    if (linePrice.status === "authoritative" && (!Number.isFinite(amount) || amount < 0)) return current;
    line.price = { amount: linePrice.status === "authoritative" ? amount : 0, status: linePrice.status, fingerprint: mobileQuoteFingerprint(line), verifiedAt: preview.verifiedAt, blockedReason: linePrice.blockedReason };
  }
  const completeCoverage = expectedIds.size === current.windows.length;
  const authoritative = completeCoverage && preview.status === "authoritative" && preview.total !== null && Number.isFinite(preview.total) && preview.total >= 0 && preview.lines.every(line => line.status === "authoritative");
  result.quotePrice = {
    amount: authoritative ? preview.total! : preview.authoritativeSubtotal,
    status: authoritative ? "authoritative" : preview.lines.some(line => line.status === "blocked") || !completeCoverage ? "blocked" : "unpriceable",
    fingerprint: mobileQuotePricingFingerprint(current),
    verifiedAt: preview.verifiedAt,
  };
  return result;
}
