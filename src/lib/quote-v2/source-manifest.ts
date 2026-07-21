import type { ISODate, SourceProvenance } from "./core";

export type SourceDocumentKind =
  | "price_book"
  | "pricing_evidence"
  | "program_binder"
  | "product_guide"
  | "dealer_portal_snapshot"
  | "color_workbook"
  | "restriction_workbook";

export type SourceAuthority =
  | "pricing"
  | "restrictions"
  | "assortment"
  | "options"
  | "freight"
  | "dealer_program";

export interface SourceManifestEntry {
  id: string;
  manufacturer: string;
  kind: SourceDocumentKind;
  format: "pdf" | "xlsx" | "xls" | "png";
  fileName: string;
  title: string;
  revision: string;
  effectiveDate: ISODate | null;
  effectiveDateEvidence: string;
  receivedDate: ISODate;
  modifiedDate: ISODate | null;
  sha256: string;
  authorities: readonly SourceAuthority[];
  pageCount?: number;
  sheetNames?: readonly string[];
  sourceUrl?: string;
}

/**
 * Immutable identities for every source supplied for the V2 rebuild.
 *
 * A null effective date is deliberate: the supplied source did not state one,
 * so the engine must not invent one. Replacing any file requires a new manifest
 * entry/version rather than editing its hash in place.
 */
export const QUOTE_V2_SOURCE_MANIFEST = [
  {
    id: "norman-retail-guide-2026-07",
    manufacturer: "Norman",
    kind: "price_book",
    format: "pdf",
    fileName: "2026Jul Retail Price Guide (1).pdf",
    title: "2026 Retail Guide",
    revision: "2026-07",
    effectiveDate: "2026-07-01",
    effectiveDateEvidence: "Cover: Effective July 1st, 2026",
    receivedDate: "2026-07-20",
    modifiedDate: "2026-06-15",
    sha256: "ae102c19b833e5c20070c11ecaad61d68a79bf6b52b5402fad55415e2602d2f3",
    authorities: ["pricing", "freight", "options"],
    pageCount: 40,
  },
  {
    id: "lotus-west-a26-v1",
    manufacturer: "Lotus & Windoware",
    kind: "price_book",
    format: "pdf",
    fileName: "Lotus.pdf",
    title: "Cost Book & Supplier Manual",
    revision: "West A26.v1",
    effectiveDate: null,
    effectiveDateEvidence: "No effective date stated in the supplied document",
    receivedDate: "2026-07-20",
    modifiedDate: "2026-04-01",
    sha256: "4e9aba91a601e1212a3e8a1531c361caf033c28ef6ca1fdac3ad6247502a982f",
    authorities: ["pricing", "restrictions", "options", "freight"],
    pageCount: 113,
  },
  {
    id: "polar-shades-dealer-book-current-2026-07-18",
    manufacturer: "Polar Shades",
    kind: "price_book",
    format: "pdf",
    fileName: "_Polar Shades Dealer Book - CURRENT.pdf",
    title: "Interior & Exterior Shades Pricing & Reference Guide",
    revision: "CURRENT",
    effectiveDate: null,
    effectiveDateEvidence: "No effective date stated in the supplied document",
    receivedDate: "2026-07-20",
    modifiedDate: "2026-07-18",
    sha256: "52eb859d583174c311e9682a09da3c33f8d081b2e772866a40dc025e2dcd0b0e",
    authorities: ["pricing", "restrictions", "assortment", "options", "freight"],
    pageCount: 246,
  },
  {
    id: "onyx-reference-guide-2020-2021",
    manufacturer: "Onyx Shutters",
    kind: "program_binder",
    format: "pdf",
    fileName: "OnyxProgramBinder2020 (1).pdf",
    title: "Onyx Shutters Reference Guide",
    revision: "2017 Reference Menu; PDF modified 2020-11-16",
    effectiveDate: null,
    effectiveDateEvidence: "No effective date stated in the supplied document",
    receivedDate: "2026-07-20",
    modifiedDate: "2020-11-16",
    sha256: "eafb25916b3ff57947596206f05bae4867a7e95d6d46d9c58e2ffd030891f26b",
    authorities: ["pricing", "restrictions", "options"],
    pageCount: 18,
  },
  {
    id: "onyx-price-screenshot-2026-07-20",
    manufacturer: "Onyx Shutters",
    kind: "pricing_evidence",
    format: "png",
    fileName: "Onyx U.S. Made Vinyl Pricing 2026-07-20.png",
    title: "Onyx Material Dealer-Cost Pricing",
    revision: "User-supplied pricing screenshot received 2026-07-20",
    effectiveDate: null,
    effectiveDateEvidence:
      "The supplied screenshot states prices but no effective date",
    receivedDate: "2026-07-20",
    modifiedDate: "2026-07-20",
    sha256: "ffd0dc5d5a337a7a6a4a3ec55446119cb596445b04816afa095af4b0e9e94500",
    authorities: ["pricing"],
  },
  {
    id: "norman-dealer-pricing-snapshot-2026-07-20",
    manufacturer: "Norman",
    kind: "dealer_portal_snapshot",
    format: "pdf",
    fileName: "NORMAN PRICING.pdf",
    title: "Product Pricing",
    revision: "Dealer portal print dated 2026-07-20",
    effectiveDate: null,
    effectiveDateEvidence: "Capture dated 7/20/2026; no separate effective date stated",
    receivedDate: "2026-07-20",
    modifiedDate: "2026-07-20",
    sha256: "fdf0af921d137d778d6890b7afa97342045bd50d05a4838afc116b6c400f3044",
    authorities: ["pricing", "freight", "dealer_program"],
    pageCount: 3,
  },
  {
    id: "norman-honeycomb-guide-2026-07",
    manufacturer: "Norman",
    kind: "product_guide",
    format: "pdf",
    fileName: "Honeycomb Shade Guide (1).pdf",
    title: "Portrait Honeycomb Shades Program Reference Guide",
    revision: "July 2026",
    effectiveDate: "2026-07-01",
    effectiveDateEvidence: "Revision summary: Effective 7/1/2026",
    receivedDate: "2026-07-20",
    modifiedDate: "2026-06-15",
    sha256: "94cba8c6b2bc7c73e134d8bfd4a4ccfbfba82392d220bfb6ec0bd5f4d210495b",
    authorities: ["restrictions", "assortment", "options"],
    pageCount: 52,
  },
  {
    id: "norman-roller-guide-2026-07",
    manufacturer: "Norman",
    kind: "product_guide",
    format: "pdf",
    fileName: "Roller Shade Guide (2).pdf",
    title: "Soluna Roller Shades Program Reference Guide",
    revision: "July 2026",
    effectiveDate: "2026-07-15",
    effectiveDateEvidence: "Latest revision summary entry: Effective 7/15/2026",
    receivedDate: "2026-07-20",
    modifiedDate: "2026-07-16",
    sha256: "ec8f0521adaabe04d6a156f603b3ee1a409e59211b4f4b0a7b6569dda3886f87",
    authorities: ["restrictions", "assortment", "options"],
    pageCount: 75,
  },
  {
    id: "norman-roman-guide-2026-05",
    manufacturer: "Norman",
    kind: "product_guide",
    format: "pdf",
    fileName: "Roman Shade Guide.pdf",
    title: "Centerpiece Roman Shades Program Reference Guide",
    revision: "May 2026",
    effectiveDate: "2026-05-25",
    effectiveDateEvidence: "Latest revision summary entry: 5/25/2026",
    receivedDate: "2026-07-20",
    modifiedDate: "2026-06-02",
    sha256: "6973ff6c97c13a68e62308bbe131273f164a7ebed58b4d71513a223a7081afdc",
    authorities: ["restrictions", "assortment", "options"],
    pageCount: 49,
  },
  {
    id: "norman-vertical-blinds-guide-2026-06",
    manufacturer: "Norman",
    kind: "product_guide",
    format: "pdf",
    fileName: "Vertical Blinds Guide.pdf",
    title: "Synchrony Vertical Blinds Program Reference Guide",
    revision: "June 2026",
    effectiveDate: "2026-06-26",
    effectiveDateEvidence: "Latest revision summary entry: 6/26/2026",
    receivedDate: "2026-07-20",
    modifiedDate: "2026-06-23",
    sha256: "3d77bce8fa7d621898cb2f2dbb64db3c48fd1584a059d165b7786a43dc8b6245",
    authorities: ["restrictions", "assortment", "options"],
    pageCount: 13,
  },
  {
    id: "norman-honeycomb-color-coordination-2026-07",
    manufacturer: "Norman",
    kind: "color_workbook",
    format: "xlsx",
    fileName: "HC Color Coordination.xlsx",
    title: "Honeycomb Shade Fabric Color Options and Color Coordination",
    revision: "Workbook modified 2026-06-15T19:26:55Z",
    effectiveDate: "2026-07-01",
    effectiveDateEvidence: "Latest workbook changes state availability on 7/1/2026",
    receivedDate: "2026-07-20",
    modifiedDate: "2026-06-15",
    sha256: "56676b753c0255618439c77cf837ee93de579b555fe0bee33dada1e0f9b521e4",
    authorities: ["assortment", "restrictions"],
    sheetNames: [
      "Fabric List",
      "All Rail Colors",
      "9-16\"S (7 Rail Colors)",
      "Sloped (4 Rail Colors)",
      "Vertical(6 Rail Colors)",
      "MotorizedSkylight(4 RailColors)",
      "Palladian Shelf Colors",
    ],
    sourceUrl:
      "https://download.normanwindowcoverings.com/Document/Service/download/ProgramBinderSync/Blinds%20and%20Shades/Norman/Honeycomb%20Shades/HC%20Color%20Coordination.xlsx",
  },
  {
    id: "norman-roller-minmax-appendix-2026-08",
    manufacturer: "Norman",
    kind: "restriction_workbook",
    format: "xls",
    fileName: "Roller MinMax Appendix.xls",
    title: "Roller MinMax Appendix",
    revision: "Revision Log updated 2026-07-08",
    effectiveDate: "2026-08-01",
    effectiveDateEvidence: "Revision Log: updated 2026-07-08, effective 2026-08-01",
    receivedDate: "2026-07-20",
    modifiedDate: "2026-07-08",
    sha256: "ba286767b6c4d760bf480434312678f6c35b229e9763ddd6fcda9f7cd18b9cc3",
    authorities: ["restrictions", "assortment", "options"],
    sheetNames: [
      "Revision Log",
      "Fabric Code List",
      "Single(Non-LG360)&Common",
      "LG360&w T-post split & housing",
      "LG360 with T-Post (2 ) (Std)",
      "LG360 with T-Post (2 ) (Ind)",
      "LG360 with T-Post (3 Shades)",
      "LG360 with T-Post (4 Shades)",
      "Standard Coupled Shade(2)",
      "Independently Coupled Shade(2)",
      "Dual",
      "Cassette",
      "Coupled Shades(3)",
      "Coupled Shades(4)",
    ],
    sourceUrl:
      "https://download.normanwindowcoverings.com/Document/Service/download/ProgramBinderSync/Blinds%20and%20Shades/Norman/Roller%20Shades/Roller%20MinMax%20Appendix.xls",
  },
] as const satisfies readonly SourceManifestEntry[];

export type SourceManifestId =
  (typeof QUOTE_V2_SOURCE_MANIFEST)[number]["id"];

export const SOURCE_MANIFEST_BY_ID = Object.freeze(
  Object.fromEntries(
    QUOTE_V2_SOURCE_MANIFEST.map((source) => [source.id, source]),
  ),
) as unknown as Readonly<Record<SourceManifestId, SourceManifestEntry>>;

export function getSourceManifestEntry(sourceId: string): SourceManifestEntry {
  const source = SOURCE_MANIFEST_BY_ID[sourceId as SourceManifestId];
  if (!source) throw new Error(`Unknown quote V2 source: ${sourceId}`);
  return source;
}

export type SourceLocation = Pick<
  SourceProvenance,
  "page" | "pages" | "sheet" | "range"
>;

/** Build rule-level provenance without duplicating mutable source metadata. */
export function sourceProvenance(
  sourceId: SourceManifestId,
  location: SourceLocation = {},
): SourceProvenance {
  const source = getSourceManifestEntry(sourceId);
  return {
    sourceId: source.id,
    fileName: source.fileName,
    revision: source.revision,
    effectiveDate: source.effectiveDate,
    sha256: source.sha256,
    ...(source.sourceUrl ? { url: source.sourceUrl } : {}),
    ...location,
  };
}
