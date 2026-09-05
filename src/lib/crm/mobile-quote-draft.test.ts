import { describe, expect, it } from "vitest";
import {
  addMobileQuoteWindow,
  allowsNeedsPricingDraft,
  appendMobileQuotePhoto,
  beginMobileQuoteGridSelection,
  chooseMobileQuoteGridWhole,
  commitMobileQuoteGridSelection,
  createMobileQuoteDraft,
  emptyMobileQuoteDesign,
  isManualQuoteEditorHandoffReady,
  isMobileQuoteDraftAccessible,
  isQuoteEditorHandoffReady,
  hasConcreteMobileQuoteRoom,
  mobileQuotePreflightOutcome,
  mobileQuoteRoomChoice,
  normalizeMobileQuoteDraft,
  removeMobileQuoteWindow,
  selectMobileQuoteBedroomNumber,
  selectMobileQuoteProduct,
  selectMobileQuoteRoom,
  selectMobileQuoteWindowLetter,
  updateMobileQuoteCustomRoom,
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

describe("mobile quote optional measurement grid", () => {
  it("stages a whole-inch choice without mutating the draft, so cancel retains all values", () => {
    const draft = createMobileQuoteDraft("owner", customer);
    const line = draft.windows[0];
    Object.assign(line, { widthWhole: 48, widthFraction: "1/2", heightWhole: 60, heightFraction: "3/16", room: "Living room" });
    const before = structuredClone(draft);

    const selection = chooseMobileQuoteGridWhole(beginMobileQuoteGridSelection(line, "width"), 52);

    expect(selection).toMatchObject({ windowId: line.id, side: "width", whole: 52, fraction: "1/2", step: "fraction" });
    expect(draft).toEqual(before);
  });

  it("commits only the selected dimension on the selected line", () => {
    let draft = createMobileQuoteDraft("owner", customer);
    draft = addMobileQuoteWindow(draft);
    const [first, second] = draft.windows;
    Object.assign(first, { widthWhole: 48, widthFraction: "1/2", heightWhole: 60, heightFraction: "3/16", room: "Living room", notes: "Keep trim", saved: true });
    Object.assign(second, { widthWhole: 30, widthFraction: "1/4", heightWhole: 40, heightFraction: "5/16", room: "Kitchen", notes: "Sink", saved: true });
    const firstBefore = structuredClone(first);
    const secondMetadata = { heightWhole: second.heightWhole, heightFraction: second.heightFraction, room: second.room, notes: second.notes, families: second.families, photos: second.photos };
    const selection = chooseMobileQuoteGridWhole(beginMobileQuoteGridSelection(second, "width"), 36);

    draft = commitMobileQuoteGridSelection(draft, selection, "7/16", "2026-09-05T12:00:00.000Z");

    expect(draft.windows[0]).toEqual(firstBefore);
    expect(draft.windows[1]).toMatchObject({ ...secondMetadata, widthWhole: 36, widthFraction: "7/16", saved: false, price: null });
    expect(draft.quotePrice).toBeNull();
    expect(draft.updatedAt).toBe("2026-09-05T12:00:00.000Z");
  });
});

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


describe("mobile quote room and window letter transitions", () => {
  it("starts blank and requires a numbered bedroom after a deliberate Bedroom choice", () => {
    let draft = createMobileQuoteDraft("owner", customer);
    const id = draft.windows[0].id;
    expect(mobileQuoteRoomChoice(draft.windows[0])).toBeNull();
    expect(hasConcreteMobileQuoteRoom(draft.windows[0])).toBe(false);
    expect(selectMobileQuoteWindowLetter(draft, id, "A")).toBe(draft);
    expect(draft.windows[0].position).toBe("");
    draft = selectMobileQuoteRoom(draft, id, "Bedroom", "2026-09-05T01:00:00.000Z");
    expect(draft.windows[0]).toMatchObject({ room: "Bedroom", roomChoice: "Bedroom", position: "" });
    expect(validateMobileQuoteWindow({ ...draft.windows[0], activeProductId: "product", families: { product: { ...product(id, "product", "Shutters"), overriddenPaths: [] } } })).toBe("Choose Bedroom 1 through Bedroom 5.");
    draft = selectMobileQuoteBedroomNumber(draft, id, "Bedroom 3");
    expect(draft.windows[0]).toMatchObject({ room: "Bedroom 3", roomChoice: "Bedroom" });
    expect(hasConcreteMobileQuoteRoom(draft.windows[0])).toBe(true);
    draft = selectMobileQuoteWindowLetter(draft, id, "C");
    const selectedBedroom = draft;
    expect(selectMobileQuoteRoom(draft, id, "Bedroom")).toBe(selectedBedroom);
    expect(selectMobileQuoteBedroomNumber(draft, id, "Bedroom 3")).toBe(selectedBedroom);
    expect(draft.windows[0]).toMatchObject({ room: "Bedroom 3", roomChoice: "Bedroom", position: "C" });
  });

  it("infers historical rooms without data loss and keeps a custom preset-like name custom", () => {
    let draft = createMobileQuoteDraft("owner", customer);
    const id = draft.windows[0].id;
    Object.assign(draft.windows[0], { room: "Library", position: "Left of fireplace" });
    expect(mobileQuoteRoomChoice(draft.windows[0])).toBe("Custom");
    draft = updateMobileQuoteCustomRoom(draft, id, "Kitchen");
    expect(draft.windows[0]).toMatchObject({ room: "Kitchen", roomChoice: "Custom", position: "Left of fireplace" });
    expect(mobileQuoteRoomChoice(draft.windows[0])).toBe("Custom");
    const historicalBedroom = { ...draft.windows[0], room: "Bedroom", roomChoice: undefined };
    expect(hasConcreteMobileQuoteRoom(historicalBedroom)).toBe(true);
  });

  it("retains descriptive positions, resets letters on room changes, and isolates windows", () => {
    let draft = createMobileQuoteDraft("owner", customer);
    draft = addMobileQuoteWindow(draft);
    const [first, second] = draft.windows;
    Object.assign(first, { room: "Living room", roomChoice: "Living room", position: "B" });
    Object.assign(second, { room: "Office", roomChoice: "Office", position: "Bay left" });
    draft = selectMobileQuoteRoom(draft, first.id, "Kitchen");
    expect(draft.windows[0]).toMatchObject({ room: "Kitchen", position: "" });
    expect(draft.windows[1]).toMatchObject({ room: "Office", position: "Bay left" });
    draft = selectMobileQuoteRoom(draft, second.id, "Den");
    expect(draft.windows[1]).toMatchObject({ room: "Den", position: "Bay left" });
    draft = selectMobileQuoteWindowLetter(draft, second.id, "F");
    expect(draft.windows[1].position).toBe("F");
    expect(draft.windows[0].position).toBe("");
    const selectedDen = draft;
    expect(selectMobileQuoteRoom(draft, second.id, "Den")).toBe(selectedDen);
    expect(draft.windows[1]).toMatchObject({ room: "Den", position: "F" });
  });

  it("persists room intent and keeps rooms and letters out of copied first-line defaults", () => {
    let draft = createMobileQuoteDraft("owner", customer);
    const first = draft.windows[0];
    draft = selectMobileQuoteRoom(draft, first.id, "Custom");
    draft = updateMobileQuoteCustomRoom(draft, first.id, "Sun room");
    draft = selectMobileQuoteWindowLetter(draft, first.id, "A");
    draft = selectMobileQuoteProduct(draft, first.id, product(first.id, "roller", "Roller Shades"));
    draft = addMobileQuoteWindow(draft);
    expect(draft.windows[0]).toMatchObject({ room: "Sun room", roomChoice: "Custom", position: "A" });
    expect(draft.windows[1]).toMatchObject({ room: "", roomChoice: null, position: "", activeProductId: "roller" });
    expect(normalizeMobileQuoteDraft(structuredClone(draft)).windows[0].roomChoice).toBe("Custom");
  });

  it("retains letters through custom name edits and locks all room transitions with a snapshot", () => {
    let draft = createMobileQuoteDraft("owner", customer);
    const id = draft.windows[0].id;
    draft = selectMobileQuoteRoom(draft, id, "Custom");
    draft = updateMobileQuoteCustomRoom(draft, id, "Sunroom");
    draft = selectMobileQuoteWindowLetter(draft, id, "B");
    draft = updateMobileQuoteCustomRoom(draft, id, "Garden room");
    expect(draft.windows[0]).toMatchObject({ room: "Garden room", roomChoice: "Custom", position: "B" });

    draft.submission.snapshot = {
      customer: structuredClone(draft.customer),
      windows: structuredClone(draft.windows),
      createdAt: "2026-09-05T02:00:00.000Z",
      requiresManualPricing: false,
    };
    expect(selectMobileQuoteRoom(draft, id, "Office")).toBe(draft);
    expect(selectMobileQuoteBedroomNumber(draft, id, "Bedroom 2")).toBe(draft);
    expect(updateMobileQuoteCustomRoom(draft, id, "Changed")).toBe(draft);
    expect(selectMobileQuoteWindowLetter(draft, id, "F")).toBe(draft);
    expect(draft.windows[0]).toMatchObject({ room: "Garden room", roomChoice: "Custom", position: "B" });
  });
});
