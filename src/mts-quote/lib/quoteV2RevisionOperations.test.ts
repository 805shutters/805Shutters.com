import { describe, expect, it } from "vitest";
import { remapQuoteV2RevisionOperations } from "./quoteV2RevisionOperations";

describe("edits queued while a sent quote becomes a draft", () => {
  const identities = { "source-line": "draft-line", "source-design": "draft-design" };
  it("targets the copied line/design and keeps fresh line IDs and detail values", () => {
    expect(remapQuoteV2RevisionOperations([
      { type: "design.upsert", lineItemId: "source-line", designId: "source-design", variant: "A", selectDesign: true, patch: { louverSize: '2 1/2"' } },
      { type: "line.create", lineItemId: "fresh-line", patch: { roomName: "Kitchen" } },
    ], identities)).toEqual([
      { type: "design.upsert", lineItemId: "draft-line", designId: "draft-design", variant: "A", selectDesign: true, patch: { louverSize: '2 1/2"' } },
      { type: "line.create", lineItemId: "fresh-line", patch: { roomName: "Kitchen" } },
    ]);
  });
  it("remaps stacked and associated line IDs in serialized notes", () => {
    const [operation] = remapQuoteV2RevisionOperations([{ type: "quote.update", patch: {
      installerNotes: JSON.stringify({ __stackedLineItemIds: ["source-line"], related: { "source-line": "source-design" } }),
    } }], identities);
    expect(operation.type === "quote.update" && JSON.parse(operation.patch.installerNotes as string)).toEqual({
      __stackedLineItemIds: ["draft-line"], related: { "draft-line": "draft-design" },
    });
  });
  it("keeps plain-text installer notes", () => {
    expect(remapQuoteV2RevisionOperations([{ type: "quote.update", patch: { installerNotes: "Call before arriving" } }], identities))
      .toEqual([{ type: "quote.update", patch: { installerNotes: "Call before arriving" } }]);
  });
});
