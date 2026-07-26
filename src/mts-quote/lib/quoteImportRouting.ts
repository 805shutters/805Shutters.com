import type { CrmQuote } from "@/lib/crm/types";

type CrmQuoteLinkSource = Pick<CrmQuote, "id" | "meta"> & {
  external_id?: unknown;
};

export type CrmQuoteBuilderRoute =
  | {
      kind: "v2";
      crmQuoteId: string;
      salesQuoteId: string;
    }
  | {
      kind: "legacy_unimported";
      crmQuoteId: string;
      sourceSystemQuoteId: string | null;
      reason: "missing_link" | "dangling_link" | "conflicting_links";
    };

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function externalQuoteId(value: unknown): string | null {
  const externalId = nonEmptyString(value);
  if (!externalId?.startsWith("quote:")) return null;
  return nonEmptyString(externalId.slice("quote:".length));
}

/**
 * A CRM quote may retain the UUID from the MTS/source database. That UUID is
 * only a usable V2 link when the corresponding sales_quotes row exists in this
 * database. Treating the source UUID as a local row ID opens an empty $0 V2
 * builder, so callers must resolve it against locally loaded sales quote IDs.
 */
export function crmQuoteSourceSalesQuoteId(quote: CrmQuoteLinkSource): string | null {
  return (
    nonEmptyString(quote.meta?.target_sales_quote_id) ||
    nonEmptyString(quote.meta?.sales_quote_id) ||
    nonEmptyString(quote.meta?.mts_quote_id) ||
    externalQuoteId(quote.external_id)
  );
}

export function resolveCrmQuoteBuilderRoute(
  quote: CrmQuoteLinkSource,
  localSalesQuoteIds: ReadonlySet<string>,
): CrmQuoteBuilderRoute {
  const typedTargetSalesQuoteId = nonEmptyString(quote.meta?.target_sales_quote_id);
  const explicitSalesQuoteId = nonEmptyString(quote.meta?.sales_quote_id);
  const mtsSourceQuoteId = nonEmptyString(quote.meta?.mts_quote_id);
  const externalSourceQuoteId = externalQuoteId(quote.external_id);
  const candidateIds = typedTargetSalesQuoteId
    ? [typedTargetSalesQuoteId]
    : Array.from(
        new Set(
          [explicitSalesQuoteId, mtsSourceQuoteId, externalSourceQuoteId].filter(
            (value): value is string => Boolean(value),
          ),
        ),
      );
  const sourceSystemQuoteId = candidateIds[0] ?? null;

  if (candidateIds.length > 1) {
    return {
      kind: "legacy_unimported",
      crmQuoteId: quote.id,
      sourceSystemQuoteId,
      reason: "conflicting_links",
    };
  }

  if (sourceSystemQuoteId && localSalesQuoteIds.has(sourceSystemQuoteId)) {
    return {
      kind: "v2",
      crmQuoteId: quote.id,
      salesQuoteId: sourceSystemQuoteId,
    };
  }

  return {
    kind: "legacy_unimported",
    crmQuoteId: quote.id,
    sourceSystemQuoteId,
    reason: sourceSystemQuoteId ? "dangling_link" : "missing_link",
  };
}
