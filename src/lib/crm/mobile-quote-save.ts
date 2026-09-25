import {
  omitTrailingUntouchedMobileQuoteWindow, validateMobileQuoteMeasurement,
  type MobileQuoteDraft, type MobileQuotePhoto, type MobileQuoteSubmissionSnapshot,
} from "./mobile-quote-draft";
import {
  quoteV2DesignPatch, type QuoteV2DraftResponse, type QuoteV2StructureOperation,
  type QuoteV2StructureResponse,
} from "@mts/lib/quoteV2ServerClient";

export function mobileQuoteDraftOperations(snapshot: MobileQuoteSubmissionSnapshot): QuoteV2StructureOperation[] {
  return snapshot.windows.flatMap<QuoteV2StructureOperation>((window, index) => {
    const family = window.activeProductId ? window.families[window.activeProductId] : null;
    const operations: QuoteV2StructureOperation[] = [{
      type: "line.create", lineItemId: window.id,
      patch: {
        roomName: [window.room.trim() || `Window ${index + 1}`, window.position.trim()].filter(Boolean).join(" · "),
        productType: family?.productType || "",
        widthWhole: window.widthWhole, widthFraction: window.widthFraction,
        heightWhole: window.heightWhole, heightFraction: window.heightFraction,
        quantity: 1, sortOrder: index,
      },
    }];
    if (family) operations.push({
      type: "design.upsert", lineItemId: window.id, designId: family.design.id,
      variant: "A", selectDesign: true,
      patch: { ...quoteV2DesignPatch(family.design), notes: [family.design.notes, window.notes].filter(Boolean).join(" · ") || null },
    });
    return operations;
  });
}

type SaveDependencies = {
  checkpoint: (draft: MobileQuoteDraft) => Promise<void>;
  create: (draft: MobileQuoteDraft) => Promise<QuoteV2DraftResponse>;
  structure: (quoteId: string, revision: number, operations: QuoteV2StructureOperation[], key: string) => Promise<QuoteV2StructureResponse>;
  upload: (quoteId: string, lineId: string, photo: MobileQuotePhoto) => Promise<unknown>;
  saveManualPrice: (quoteId: string, lineId: string, designId: string, price: number, revision: number) => Promise<{ revision: number }>;
};

/** Checkpoint before each external stage. Retries retain the same identities and frozen payload. */
export async function saveMobileQuoteForLater(source: MobileQuoteDraft, deps: SaveDependencies) {
  const working = structuredClone(omitTrailingUntouchedMobileQuoteWindow(source));
  const checkpoint = async () => {
    working.updatedAt = new Date().toISOString();
    await deps.checkpoint(structuredClone(working));
  };
  if (working.submission.snapshot && !working.submission.snapshot.saveForLater) {
    throw new Error("Continue the existing submission before saving another draft.");
  }
  if (!working.submission.snapshot) {
    if (!working.windows.length) throw new Error("Add a window before saving the quote.");
    const invalid = working.windows.findIndex(validateMobileQuoteMeasurement);
    if (invalid >= 0) throw new Error(`Window ${invalid + 1}: ${validateMobileQuoteMeasurement(working.windows[invalid])}`);
    working.submission.snapshot = {
      customer: structuredClone(working.customer), windows: structuredClone(working.windows),
      createdAt: new Date().toISOString(), requiresManualPricing: false, saveForLater: true,
    };
  }
  const snapshot = working.submission.snapshot;
  if (working.submission.completedAt) return working;
  // A retry may come from memory after a failed local commit; prove recovery storage first.
  await checkpoint();
  if (!working.submission.quoteId || !working.submission.createRevision) {
    const created = await deps.create(working);
    Object.assign(working.submission, {
      quoteId: created.quoteId, quoteNumber: created.quoteNumber, createRevision: created.revision,
    });
    await checkpoint();
  }
  const quoteId = working.submission.quoteId!;
  if (!working.submission.structureRevision) {
    const result = await deps.structure(quoteId, working.submission.createRevision!,
      mobileQuoteDraftOperations(snapshot), working.submission.structureKey);
    working.submission.structureRevision = result.revision;
    await checkpoint();
  }
  for (const window of snapshot.windows) {
    for (const photo of window.photos) {
      if (working.submission.uploadedPhotoIds.includes(photo.id)) continue;
      await deps.upload(quoteId, window.id, photo);
      working.submission.uploadedPhotoIds.push(photo.id);
      await checkpoint();
    }
  }
  for (const window of snapshot.windows) {
    const design = window.activeProductId ? window.families[window.activeProductId]?.design : null;
    if (design?.options_json.manual_price_override !== true) continue;
    const saved = await deps.saveManualPrice(quoteId, window.id, design.id, design.unit_price, working.submission.structureRevision!);
    working.submission.structureRevision = Math.max(working.submission.structureRevision!, saved.revision);
    await checkpoint();
  }
  working.submission.priceStatus = "blocked";
  working.submission.finalTotal = null;
  working.submission.completedAt = new Date().toISOString();
  await checkpoint();
  return working;
}
