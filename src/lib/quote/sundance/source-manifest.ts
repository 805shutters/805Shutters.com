import sources from "../../../../scripts/sundance/sources.lock.json";
import type { SourceManifestEntry } from "@/lib/quote-v2/source-manifest";

/** Retail books are authority for their cells, never for account discounts. */
export const SUNDANCE_SOURCE_MANIFEST: readonly SourceManifestEntry[] = sources.map((source) => ({
  id: source.sourceId,
  manufacturer: "Sundance",
  kind: "price_book",
  format: "pdf",
  fileName: source.file,
  title: source.file,
  revision: source.sha256.slice(0, 12),
  effectiveDate: source.file === "J-Sundance-Horizontal-Blinds-12-25.pdf" ? "2025-12-01" : null,
  effectiveDateEvidence: source.file === "J-Sundance-Horizontal-Blinds-12-25.pdf"
    ? "Printed page footer: Effective December 1, 2025"
    : "Use the effective date printed on each source page; retrieval/upload dates are not effective dates.",
  receivedDate: "2026-09-14",
  modifiedDate: null,
  sha256: source.sha256,
  authorities: ["pricing", "restrictions", "assortment", "options"],
  pageCount: source.pages,
  sourceUrl: source.url,
}));
