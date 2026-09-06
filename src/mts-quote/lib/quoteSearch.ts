import { collectCrmPages } from "@/lib/crm/pagination";
import {
  excludeDeletedSalesQuotes,
  isMissingSalesQuoteDeletedAtColumn,
} from "@mts/lib/quoteDashboardFilters";

export type SearchableQuote = {
  quote_number?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  customer_address?: string | null;
};

type PageError = { code?: string; message: string };
type PageResult<T> = { data: T[] | null; error: PageError | null };

export type SalesQuotePageReader<T> = (
  from: number,
  to: number,
  excludeDeleted: boolean,
) => PromiseLike<PageResult<T>>;

/** Read the complete quote history while tolerating schemas without deleted_at. */
export async function loadAllSalesQuotes<T extends { deleted_at?: string | null }>(
  readPage: SalesQuotePageReader<T>,
): Promise<PageResult<T>> {
  let result = await collectCrmPages<T>((from, to) => readPage(from, to, true));

  if (isMissingSalesQuoteDeletedAtColumn(result.error)) {
    result = await collectCrmPages<T>((from, to) => readPage(from, to, false));
  }

  if (result.error) return result;
  return { data: excludeDeletedSalesQuotes(result.data || []), error: null };
}

/** Search the complete, deduplicated quote list before display pagination. */
export function searchQuotes<T extends SearchableQuote>(quotes: T[], query: string): T[] {
  const search = query.trim().toLowerCase();
  if (!search) return quotes;

  const terms = search.split(/\s+/);
  const phoneDigits = /^[+\d\s().-]+$/.test(search) ? search.replace(/\D/g, "") : "";

  return quotes.filter((quote) => {
    const fields = [
      quote.quote_number,
      quote.customer_name,
      quote.customer_phone,
      quote.customer_email,
      quote.customer_address,
    ].map((value) => (value || "").toLowerCase());

    return terms.every((term) => fields.some((field) => field.includes(term))) ||
      Boolean(phoneDigits && (quote.customer_phone || "").replace(/\D/g, "").includes(phoneDigits));
  });
}
