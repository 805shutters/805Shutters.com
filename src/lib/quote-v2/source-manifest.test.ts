import { describe, expect, it } from "vitest";
import { NORMAN_HONEYCOMB_WORKBOOK_SHA256 } from "./generated/norman-honeycomb-v2.generated";
import {
  NORMAN_ROLLER_V2_INGESTED_WORKBOOK_SHA256,
  NORMAN_ROLLER_V2_ORIGINAL_WORKBOOK_SHA256,
} from "./generated/norman-roller-v2.generated";
import sourceArtifactLock from "./source-artifacts.lock.json";
import {
  getSourceManifestEntry,
  QUOTE_V2_SOURCE_MANIFEST,
  SOURCE_MANIFEST_BY_ID,
  sourceProvenance,
} from "./source-manifest";

describe("quote V2 source manifest", () => {
  it("pins every supplied source with a unique immutable identity", () => {
    expect(QUOTE_V2_SOURCE_MANIFEST).toHaveLength(14);
    expect(
      new Set(QUOTE_V2_SOURCE_MANIFEST.map((source) => source.id)).size,
    ).toBe(14);
    expect(
      new Set(QUOTE_V2_SOURCE_MANIFEST.map((source) => source.sha256)).size,
    ).toBe(14);

    for (const source of QUOTE_V2_SOURCE_MANIFEST) {
      expect(source.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(source.revision).not.toBe("");
      expect(source.effectiveDateEvidence).not.toBe("");
      expect(SOURCE_MANIFEST_BY_ID[source.id]).toBe(source);
    }
  });

  it("keeps the binary source lock synchronized with the manifest", () => {
    expect(sourceArtifactLock.artifacts).toHaveLength(
      QUOTE_V2_SOURCE_MANIFEST.length,
    );
    expect(
      sourceArtifactLock.artifacts.map((artifact) => ({
        sourceId: artifact.sourceId,
        fileName: artifact.fileName,
        sha256: artifact.sha256,
      })),
    ).toEqual(
      QUOTE_V2_SOURCE_MANIFEST.map((source) => ({
        sourceId: source.id,
        fileName: source.fileName,
        sha256: source.sha256,
      })),
    );
  });

  it("pins generator inputs to the exact workbook identities", () => {
    expect(NORMAN_HONEYCOMB_WORKBOOK_SHA256).toBe(
      getSourceManifestEntry("norman-honeycomb-color-coordination-2026-07")
        .sha256,
    );
    expect(NORMAN_ROLLER_V2_ORIGINAL_WORKBOOK_SHA256).toBe(
      getSourceManifestEntry("norman-roller-minmax-appendix-2026-08").sha256,
    );
    expect(NORMAN_ROLLER_V2_INGESTED_WORKBOOK_SHA256).toBe(
      sourceArtifactLock.derivedArtifacts[0].sha256,
    );
  });

  it("pins the exact PDF hashes", () => {
    expect(
      Object.fromEntries(
        QUOTE_V2_SOURCE_MANIFEST.filter(
          (source) => source.format === "pdf",
        ).map((source) => [source.fileName, source.sha256]),
      ),
    ).toEqual({
      "2026Jul Retail Price Guide (1).pdf":
        "ae102c19b833e5c20070c11ecaad61d68a79bf6b52b5402fad55415e2602d2f3",
      "Lotus.pdf":
        "4e9aba91a601e1212a3e8a1531c361caf033c28ef6ca1fdac3ad6247502a982f",
      "_Polar Shades Dealer Book - CURRENT.pdf":
        "52eb859d583174c311e9682a09da3c33f8d081b2e772866a40dc025e2dcd0b0e",
      "OnyxProgramBinder2020 (1).pdf":
        "eafb25916b3ff57947596206f05bae4867a7e95d6d46d9c58e2ffd030891f26b",
      "NORMAN PRICING.pdf":
        "fdf0af921d137d778d6890b7afa97342045bd50d05a4838afc116b6c400f3044",
      "Motorization Guide.pdf":
        "57692a04ac4abe2e8774f8b248f4516141929124580edc2527e85f29d4feb290",
      "Honeycomb Shade Guide (1).pdf":
        "94cba8c6b2bc7c73e134d8bfd4a4ccfbfba82392d220bfb6ec0bd5f4d210495b",
      "Roller Shade Guide (2).pdf":
        "ec8f0521adaabe04d6a156f603b3ee1a409e59211b4f4b0a7b6569dda3886f87",
      "Roman Shade Guide.pdf":
        "6973ff6c97c13a68e62308bbe131273f164a7ebed58b4d71513a223a7081afdc",
      "Vertical Blinds Guide.pdf":
        "3d77bce8fa7d621898cb2f2dbb64db3c48fd1584a059d165b7786a43dc8b6245",
    });
  });

  it("pins workbook revisions, hashes, sheet counts, and activation dates", () => {
    const honeycomb = getSourceManifestEntry(
      "norman-honeycomb-color-coordination-2026-07",
    );
    expect(honeycomb).toMatchObject({
      fileName: "HC Color Coordination.xlsx",
      revision: "Workbook modified 2026-06-15T19:26:55Z",
      effectiveDate: "2026-07-01",
      sha256:
        "56676b753c0255618439c77cf837ee93de579b555fe0bee33dada1e0f9b521e4",
    });
    expect(honeycomb.sheetNames).toHaveLength(7);

    const roller = getSourceManifestEntry(
      "norman-roller-minmax-appendix-2026-08",
    );
    expect(roller).toMatchObject({
      fileName: "Roller MinMax Appendix.xls",
      revision: "Revision Log updated 2026-07-08",
      effectiveDate: "2026-08-01",
      sha256:
        "ba286767b6c4d760bf480434312678f6c35b229e9763ddd6fcda9f7cd18b9cc3",
    });
    expect(roller.sheetNames).toHaveLength(14);
  });

  it("keeps unstated effective dates null instead of guessing", () => {
    for (const sourceId of [
      "lotus-west-a26-v1",
      "polar-shades-dealer-book-current-2026-07-18",
      "onyx-reference-guide-2020-2021",
      "norman-dealer-pricing-snapshot-2026-07-20",
    ]) {
      expect(getSourceManifestEntry(sourceId).effectiveDate).toBeNull();
    }
  });

  it("quarantines the other-dealer portal PDF from every runtime authority", () => {
    expect(
      getSourceManifestEntry("norman-dealer-pricing-snapshot-2026-07-20"),
    ).toMatchObject({
      authorities: [],
      runtimeAuthority: false,
      accountScope: "Other Norman dealer account (not the current 805 account; identifier redacted)",
      quarantineReason: expect.stringMatching(/different dealer account.*must never drive current 805 pricing/i),
    });
  });

  it("pins the redacted current-account Onyx portal fixture without inventing an effective date", () => {
    expect(
      getSourceManifestEntry("onyx-us-made-vinyl-portal-2026-07-22"),
    ).toMatchObject({
      kind: "dealer_portal_snapshot",
      fileName: "Onyx US Made Vinyl Portal 2026-07-22.png",
      effectiveDate: null,
      sha256:
        "8396fc5fadef32982a5731ce007e2b41d133de038f769d00ac44681f037f7eaf",
      authorities: ["pricing"],
      accountScope: expect.stringMatching(/current 805.*cropped/i),
    });
  });

  it("constructs rule-level provenance from the pinned manifest", () => {
    expect(
      sourceProvenance("norman-roller-minmax-appendix-2026-08", {
        sheet: "Cassette",
        range: "D8:Z8",
      }),
    ).toEqual({
      sourceId: "norman-roller-minmax-appendix-2026-08",
      fileName: "Roller MinMax Appendix.xls",
      revision: "Revision Log updated 2026-07-08",
      effectiveDate: "2026-08-01",
      sha256:
        "ba286767b6c4d760bf480434312678f6c35b229e9763ddd6fcda9f7cd18b9cc3",
      url: "https://download.normanwindowcoverings.com/Document/Service/download/ProgramBinderSync/Blinds%20and%20Shades/Norman/Roller%20Shades/Roller%20MinMax%20Appendix.xls",
      sheet: "Cassette",
      range: "D8:Z8",
    });
  });

  it("fails closed for unknown source IDs", () => {
    expect(() => getSourceManifestEntry("missing-source")).toThrow(
      "Unknown quote V2 source: missing-source",
    );
  });
});
