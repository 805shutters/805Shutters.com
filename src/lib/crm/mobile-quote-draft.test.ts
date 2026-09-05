import { describe, expect, it } from "vitest";
import {
  addMobileQuoteWindow,
  allowsNeedsPricingDraft,
  appendMobileQuotePhoto,
  createMobileQuoteDraft,
  emptyMobileQuoteDesign,
  isManualQuoteEditorHandoffReady,
  isMobileQuoteDraftAccessible,
  isQuoteEditorHandoffReady,
  mobileQuotePreflightOutcome,
  normalizeMobileQuoteDraft,
  removeMobileQuoteWindow,
  selectMobileQuoteProduct,
  updateMobileQuoteDesign,
  validateMobileQuoteWindow,
  type MobileQuoteCustomer,
} from "./mobile-quote-draft";

const customer: MobileQuoteCustomer = {
  kind: "existing", jobId: "job-1", name: "Pat Smith", phone: "", email: "", address: "", appointmentDate: null,
};

function product(lineId: string, productId: string, productType: string, option = "white") {
  const design = emptyMobileQuoteDesign(lineId, productType);
  design.options_json = { color: option, mount: "inside" };
  return { productId, productType, design };
}

describe("mobile quote first-line defaults", () => {
  it("broadcasts the initial first-line product and gives future lines independent inherited defaults", () => {
    let draft = createMobileQuoteDraft("owner", customer);
    draft = addMobileQuoteWindow(draft);
    const first = draft.windows[0];
    draft = selectMobileQuoteProduct(draft, first.id, product(first.id, "roller", "Roller Shades"));
    expect(draft.windows.map((line) => line.activeProductId)).toEqual(["roller", "roller"]);
    draft = addMobileQuoteWindow(draft);
    expect(draft.windows[2].families.roller.design.options_json).toMatchObject({ color: "white", mount: "inside" });
    expect(draft.windows[2].families.roller.design.id).not.toBe(draft.windows[0].families.roller.design.id);
  });

  it("keeps a local override while propagating an unrelated first-line change", () => {
    let draft = createMobileQuoteDraft("owner", customer);
    draft = addMobileQuoteWindow(draft);
    const [first, second] = draft.windows;
    draft = selectMobileQuoteProduct(draft, first.id, product(first.id, "roller", "Roller Shades"));
    draft = updateMobileQuoteDesign(draft, second.id, { options_json: { color: "charcoal", mount: "inside" } });
    draft = updateMobileQuoteDesign(draft, first.id, { options_json: { color: "white", mount: "outside" } });
    expect(draft.windows[1].families.roller.design.options_json).toEqual({ color: "charcoal", mount: "outside" });
  });

  it("retains each line's configuration when switching product families and switching back", () => {
    let draft = createMobileQuoteDraft("owner", customer);
    const first = draft.windows[0];
    draft = selectMobileQuoteProduct(draft, first.id, product(first.id, "roller", "Roller Shades"));
    draft = updateMobileQuoteDesign(draft, first.id, { options_json: { color: "linen", mount: "outside" } });
    draft = selectMobileQuoteProduct(draft, first.id, product(first.id, "shutter", "Shutters", "silk"));
    draft = selectMobileQuoteProduct(draft, first.id, product(first.id, "roller", "Roller Shades", "new-default"));
    expect(draft.windows[0].families.roller.design.options_json).toEqual({ color: "linen", mount: "outside" });
    expect(draft.windows[0].families.shutter.design.options_json).toEqual({ color: "silk", mount: "inside" });
  });

  it("refreshes non-overridden defaults when the first line switches back but preserves local choices", () => {
    let draft = createMobileQuoteDraft("owner", customer);
    draft = addMobileQuoteWindow(draft);
    const [first, second] = draft.windows;
    draft = selectMobileQuoteProduct(draft, first.id, product(first.id, "roller", "Roller Shades"));
    draft = updateMobileQuoteDesign(draft, second.id, { options_json: { color: "charcoal", mount: "inside" } });
    draft = updateMobileQuoteDesign(draft, first.id, { options_json: { color: "linen", mount: "outside" } });
    draft = selectMobileQuoteProduct(draft, first.id, product(first.id, "shutter", "Shutters"));
    draft.windows[1].saved = true;
    draft = selectMobileQuoteProduct(draft, first.id, product(first.id, "roller", "Roller Shades"));
    expect(draft.windows[1].families.roller.design.options_json).toEqual({ color: "charcoal", mount: "outside" });
    expect(draft.windows[1].saved).toBe(false);
  });

  it("merges concurrent prepared photos into the latest target window without reverting edits", () => {
    let draft = createMobileQuoteDraft("owner", customer);
    draft = addMobileQuoteWindow(draft);
    const [first, second] = draft.windows;
    draft.windows[0].widthWhole = 48;
    draft.activeWindowId = second.id;
    const firstPhoto = { id: "photo-1", name: "one.jpg", type: "image/jpeg", blob: new Blob(["one"], { type: "image/jpeg" }) };
    const secondPhoto = { id: "photo-2", name: "two.jpg", type: "image/jpeg", blob: new Blob(["two"], { type: "image/jpeg" }) };
    draft = appendMobileQuotePhoto(draft, draft.id, first.id, firstPhoto);
    draft.windows[0].heightWhole = 60;
    draft = appendMobileQuotePhoto(draft, draft.id, first.id, secondPhoto);
    expect(draft.windows[0].photos.map((photo) => photo.id)).toEqual(["photo-1", "photo-2"]);
    expect(draft.windows[0]).toMatchObject({ widthWhole: 48, heightWhole: 60 });
    expect(draft.activeWindowId).toBe(second.id);
  });

  it("removes an accidental window and derives future defaults from a new first line without broadcasting", () => {
    let draft = createMobileQuoteDraft("owner", customer);
    const first = draft.windows[0];
    draft = selectMobileQuoteProduct(draft, first.id, product(first.id, "roller", "Roller Shades"));
    draft = addMobileQuoteWindow(draft);
    draft = updateMobileQuoteDesign(draft, draft.windows[1].id, { options_json: { color: "charcoal", mount: "outside" } });
    const retainedId = draft.windows[1].id;
    draft = removeMobileQuoteWindow(draft, first.id);
    expect(draft.windows).toHaveLength(1);
    expect(draft.windows[0].id).toBe(retainedId);
    expect(draft.windows[0].families.roller.design.options_json).toEqual({ color: "charcoal", mount: "outside" });
    draft = addMobileQuoteWindow(draft);
    expect(draft.windows[1].families.roller.design.options_json).toEqual({ color: "charcoal", mount: "outside" });
    expect(removeMobileQuoteWindow(draft, "missing")).toBe(draft);
  });

  it("allows Needs pricing only when every unresolved line is server-classified manual", () => {
    const expected = ["standard", "manual"];
    expect(allowsNeedsPricingDraft(expected, new Set(["standard"]), new Set(["manual"]))).toBe(true);
    expect(allowsNeedsPricingDraft(expected, new Set(["manual"]), new Set(["manual"]))).toBe(false);
    expect(allowsNeedsPricingDraft(expected, new Set(expected), new Set(["manual"]))).toBe(false);
  });

  it("accepts complete server preflight coverage and preserves manual recovery classification", () => {
    const outcome = mobileQuotePreflightOutcome(["standard", "manual"], [
      { lineItemId: "standard", status: "authoritative", requiresManualPricing: false },
      { lineItemId: "manual", status: "blocked", requiresManualPricing: true },
    ]);
    expect(outcome.allowed).toBe(true);
    expect(outcome.requiresManualPricing).toBe(true);
    expect([...outcome.manualPricingWindowIds]).toEqual(["manual"]);
  });

  it("retains the immutable server-derived manual classification during draft recovery", () => {
    const draft = createMobileQuoteDraft("owner", customer);
    draft.submission.snapshot = {
      customer: structuredClone(draft.customer),
      windows: structuredClone(draft.windows),
      createdAt: "2026-09-05T00:00:00.000Z",
      requiresManualPricing: true,
    };
    const recovered = normalizeMobileQuoteDraft(structuredClone(draft));
    expect(recovered.submission.snapshot).toMatchObject({ requiresManualPricing: true });
    expect(normalizeMobileQuoteDraft({
      ...structuredClone(draft),
      submission: {
        ...structuredClone(draft.submission),
        snapshot: {
          customer: structuredClone(draft.customer),
          windows: structuredClone(draft.windows),
          createdAt: "2026-09-05T00:00:00.000Z",
        },
      },
    } as unknown as typeof draft).submission.snapshot).toMatchObject({
      requiresManualPricing: false,
    });
  });

  it("keeps Retry available when a manual submission is interrupted before structure completion", () => {
    const draft = createMobileQuoteDraft("owner", customer);
    draft.submission.quoteId = "quote-1";
    draft.submission.createRevision = 1;
    draft.submission.priceStatus = "blocked";
    draft.submission.completedAt = "2026-09-05T00:05:00.000Z";
    draft.submission.snapshot = {
      customer: structuredClone(draft.customer),
      windows: structuredClone(draft.windows),
      createdAt: "2026-09-05T00:00:00.000Z",
      requiresManualPricing: true,
    };

    expect(isManualQuoteEditorHandoffReady(draft)).toBe(false);
    expect(isMobileQuoteDraftAccessible(draft)).toBe(true);
  });

  it("keeps Retry through interrupted photo uploads and exposes a persisted terminal manual handoff", () => {
    const draft = createMobileQuoteDraft("owner", customer);
    const firstPhoto = { id: "photo-1", name: "one.jpg", type: "image/jpeg", blob: new Blob(["one"], { type: "image/jpeg" }) };
    const secondPhoto = { id: "photo-2", name: "two.jpg", type: "image/jpeg", blob: new Blob(["two"], { type: "image/jpeg" }) };
    draft.windows[0].photos = [firstPhoto, secondPhoto];
    draft.submission.quoteId = "quote-1";
    draft.submission.structureRevision = 2;
    draft.submission.snapshot = {
      customer: structuredClone(draft.customer),
      windows: structuredClone(draft.windows),
      createdAt: "2026-09-05T00:00:00.000Z",
      requiresManualPricing: true,
    };
    draft.submission.uploadedPhotoIds = [firstPhoto.id];
    draft.submission.priceStatus = "blocked";

    expect(isManualQuoteEditorHandoffReady(draft)).toBe(false);
    expect(isMobileQuoteDraftAccessible(draft)).toBe(true);
    draft.submission.uploadedPhotoIds.push(secondPhoto.id);
    expect(isManualQuoteEditorHandoffReady(draft)).toBe(false);
    draft.submission.completedAt = "2026-09-05T00:05:00.000Z";
    expect(isManualQuoteEditorHandoffReady(draft)).toBe(true);
    expect(isMobileQuoteDraftAccessible(draft)).toBe(true);

    const recovered = normalizeMobileQuoteDraft(structuredClone(draft));
    expect(isManualQuoteEditorHandoffReady(recovered)).toBe(true);
    expect(isMobileQuoteDraftAccessible(recovered)).toBe(true);
  });

  it("opens a non-manual terminal blocked quote in the editor only after every photo upload", () => {
    const draft = createMobileQuoteDraft("owner", customer);
    const firstPhoto = { id: "photo-1", name: "one.jpg", type: "image/jpeg", blob: new Blob(["one"], { type: "image/jpeg" }) };
    const secondPhoto = { id: "photo-2", name: "two.jpg", type: "image/jpeg", blob: new Blob(["two"], { type: "image/jpeg" }) };
    draft.windows[0].photos = [firstPhoto, secondPhoto];
    draft.submission.quoteId = "quote-1";
    draft.submission.structureRevision = 3;
    draft.submission.priceStatus = "blocked";
    draft.submission.snapshot = {
      customer: structuredClone(draft.customer),
      windows: structuredClone(draft.windows),
      createdAt: "2026-09-05T00:00:00.000Z",
      requiresManualPricing: false,
    };
    draft.submission.uploadedPhotoIds = [firstPhoto.id];

    expect(isQuoteEditorHandoffReady(draft)).toBe(false);
    draft.submission.uploadedPhotoIds.push(secondPhoto.id);
    expect(isQuoteEditorHandoffReady(draft)).toBe(true);
    expect(isManualQuoteEditorHandoffReady(draft)).toBe(false);
  });

  it("rejects partial, duplicate, unknown, and unclassified blocked preflight coverage", () => {
    const expected = ["one", "two"];
    const cases = [
      [{ lineItemId: "one", status: "authoritative" as const, requiresManualPricing: false }],
      [
        { lineItemId: "one", status: "authoritative" as const, requiresManualPricing: false },
        { lineItemId: "one", status: "blocked" as const, requiresManualPricing: true },
      ],
      [
        { lineItemId: "one", status: "authoritative" as const, requiresManualPricing: false },
        { lineItemId: "unknown", status: "blocked" as const, requiresManualPricing: true },
      ],
      [
        { lineItemId: "one", status: "authoritative" as const, requiresManualPricing: false },
        { lineItemId: "two", status: "blocked" as const, requiresManualPricing: false },
      ],
    ];
    for (const lines of cases) {
      expect(mobileQuotePreflightOutcome(expected, lines)).toMatchObject({
        allowed: false,
        requiresManualPricing: false,
      });
    }
  });

  it("rejects fractions outside the supported quick choices", () => {
    let draft = createMobileQuoteDraft("owner", customer);
    const first = draft.windows[0];
    draft = selectMobileQuoteProduct(draft, first.id, product(first.id, "roller", "Roller Shades"));
    Object.assign(draft.windows[0], { room: "Office", widthWhole: 20, heightWhole: 30, widthFraction: "2/3" });
    expect(validateMobileQuoteWindow(draft.windows[0])).toBe("Choose a supported measurement fraction.");
  });
});
