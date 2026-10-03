import type { QuoteV2StructureOperation } from "./quoteV2ServerClient";

/** Redirect edits already queued against the sent source to its copied IDs. */
export function remapQuoteV2RevisionOperations(
  operations: readonly QuoteV2StructureOperation[],
  identities: Readonly<Record<string, string>>,
): QuoteV2StructureOperation[] {
  const remap = (value: unknown): unknown => {
    if (typeof value === "string") return identities[value] ?? value;
    if (Array.isArray(value)) return value.map(remap);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [identities[key] ?? key, remap(item)]));
    }
    return value;
  };
  return operations.map(operation => {
    const mapped = remap(operation) as QuoteV2StructureOperation;
    if (mapped.type === "quote.update" && typeof mapped.patch.installerNotes === "string") {
      try {
        return { ...mapped, patch: { ...mapped.patch, installerNotes: JSON.stringify(remap(JSON.parse(mapped.patch.installerNotes))) } };
      } catch { /* Plain-text notes keep their original contents. */ }
    }
    return mapped;
  });
}
