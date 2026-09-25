import { describe, expect, it, vi } from "vitest";
import { createMobileQuoteDraft, saveMobileQuoteWindowAndAdvance, emptyMobileQuoteDesign, isQuoteEditorHandoffReady, type MobileQuoteDraft } from "./mobile-quote-draft";
import { saveMobileQuoteForLater } from "./mobile-quote-save";

function fixture() {
  const source = createMobileQuoteDraft("staff:805", { kind: "new", jobId: null, name: "Test", phone: "", email: "", address: "", appointmentDate: null });
  Object.assign(source.windows[0], { widthWhole: 36, widthFraction: "3/16", heightWhole: 60, heightFraction: "15/16" });
  source.windows[0].photos.push({ id: "photo-1", name: "window.png", type: "image/png", blob: new Blob(["photo bytes"]) });
  let durable = structuredClone(source);
  const deps = {
    checkpoint: vi.fn(async (draft: MobileQuoteDraft) => { durable = structuredClone(draft); }),
    create: vi.fn(async () => ({ backend: "authoritative_v2" as const, quoteId: "quote-1", quoteNumber: "805-test", revision: 1, status: "draft" as const, quoteV2Status: "draft" as const, lineCount: 0 as const })),
    structure: vi.fn(async (_quoteId: string, _revision: number, _operations: unknown[], _key: string) => ({ backend: "authoritative_v2" as const, quoteId: "quote-1", revision: 2, status: "draft" as const, quoteV2Status: "stale" as const, lineCount: 1, selectedDesigns: {}, operations: [] })),
    upload: vi.fn(async () => ({})),
    saveManualPrice: vi.fn(async () => ({ revision: 3 })),
  };
  return { source, deps, durable: () => durable };
}

describe("save unfinished mobile quote", () => {
  it("saves dimensions and photo without a room/product/design/price and drops only the empty next window", async () => {
    const f = fixture();
    f.source.windows[0].room = "   ";
    const draft = saveMobileQuoteWindowAndAdvance(f.source, f.source.windows[0].id);
    const result = await saveMobileQuoteForLater(draft, f.deps);
    expect(result.windows).toHaveLength(1);
    expect(f.deps.structure.mock.calls[0]).toEqual(["quote-1", 1, [{
      type: "line.create", lineItemId: f.source.windows[0].id,
      patch: { roomName: "Window 1", productType: "", widthWhole: 36, widthFraction: "3/16", heightWhole: 60, heightFraction: "15/16", quantity: 1, sortOrder: 0 },
    }], f.source.submission.structureKey]);
    expect(f.deps.upload).toHaveBeenCalledWith("quote-1", f.source.windows[0].id, f.source.windows[0].photos[0]);
    expect(result.submission.finalTotal).toBeNull();
    expect(isQuoteEditorHandoffReady(result)).toBe(true);
    expect(f.deps.saveManualPrice).not.toHaveBeenCalled();
  });

  it("retries an interrupted photo upload without recreating the quote or its lines", async () => {
    const f = fixture();
    f.deps.upload.mockRejectedValueOnce(new Error("Offline"));
    await expect(saveMobileQuoteForLater(f.source, f.deps)).rejects.toThrow("Offline");
    expect(isQuoteEditorHandoffReady(f.durable())).toBe(false);
    expect(f.durable().submission.completedAt).toBeNull();
    const result = await saveMobileQuoteForLater(f.durable(), f.deps);
    expect(f.deps.create).toHaveBeenCalledTimes(1);
    expect(f.deps.structure).toHaveBeenCalledTimes(1);
    expect(f.deps.upload).toHaveBeenCalledTimes(2);
    expect(result.submission.uploadedPhotoIds).toEqual(["photo-1"]);
    await saveMobileQuoteForLater(result, f.deps);
    expect(f.deps.upload).toHaveBeenCalledTimes(2);
  });

  it("does not create a server quote when local recovery storage cannot commit", async () => {
    const f = fixture();
    f.deps.checkpoint.mockRejectedValueOnce(new Error("Storage full")).mockRejectedValueOnce(new Error("Storage full"));
    await expect(saveMobileQuoteForLater(f.source, f.deps)).rejects.toThrow("Storage full");
    const inMemoryRetry = f.deps.checkpoint.mock.calls[0][0];
    await expect(saveMobileQuoteForLater(inMemoryRetry, f.deps)).rejects.toThrow("Storage full");
    expect(f.deps.create).not.toHaveBeenCalled();
  });

  it("retains the frozen batch and revision on a conflict instead of overwriting newer work", async () => {
    const f = fixture();
    f.deps.structure.mockRejectedValueOnce(new Error("Revision conflict"));
    await expect(saveMobileQuoteForLater(f.source, f.deps)).rejects.toThrow("Revision conflict");
    expect(f.durable().submission.createRevision).toBe(1);
    expect(f.durable().submission.structureRevision).toBeNull();
    expect(f.deps.upload).not.toHaveBeenCalled();
    await saveMobileQuoteForLater(f.durable(), f.deps);
    expect(f.deps.structure.mock.calls[1]).toEqual(f.deps.structure.mock.calls[0]);
  });

  it("preserves partial configuration and explicit manual prices on a mixed quote", async () => {
    const f = fixture();
    const draft = saveMobileQuoteWindowAndAdvance(f.source, f.source.windows[0].id);
    const line = draft.windows[1];
    Object.assign(line, { widthWhole: 40, heightWhole: 50, room: "Kitchen", activeProductId: "roller" });
    const design = emptyMobileQuoteDesign(line.id, "Roller Shades");
    Object.assign(design, { supplier: "Norman", unit_price: 350, options_json: { manual_price_override: true } });
    line.families.roller = { productId: "roller", productType: "Roller Shades", design, overriddenPaths: [] };
    const result = await saveMobileQuoteForLater(draft, f.deps);
    const operations = f.deps.structure.mock.calls[0] as unknown[];
    expect(operations[2]).toHaveLength(3);
    expect(f.deps.saveManualPrice).toHaveBeenCalledWith("quote-1", line.id, design.id, 350, 2);
    expect(result.windows[1].families.roller.design.supplier).toBe("Norman");
  });

  it("rejects invalid dimensions but allows saving without photos", async () => {
    const f = fixture();
    f.source.windows[0].widthWhole = 0;
    f.source.windows[0].widthFraction = "0";
    await expect(saveMobileQuoteForLater(f.source, f.deps)).rejects.toThrow(/width and height/);
    f.source.windows[0].widthWhole = 36;
    f.source.windows[0].photos = [];
    expect((await saveMobileQuoteForLater(f.source, f.deps)).submission.completedAt).toBeTruthy();
    expect(f.deps.upload).not.toHaveBeenCalled();
  });
});
