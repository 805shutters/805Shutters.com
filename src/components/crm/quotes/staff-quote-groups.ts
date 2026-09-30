import type { QuoteTableRow } from "@mts/components/crm/quote-builder/QuotesTable";
import type { MobileQuoteRelationship } from "@/lib/crm/mobile-quotes";
import { staffQuoteView, type StaffQuoteFilter } from "./staff-quote-view";

export type StaffQuoteCustomer = {
  id: string;
  name: string;
  address: string | null;
  quotes: QuoteTableRow[];
};

/** Resolve only stored links; ambiguous customer relationships stay separate. */
export function staffQuoteCustomerId(links: MobileQuoteRelationship[], jobId: string | null, quoteId: string): string | null {
  const ids = new Set(links.filter(link => !link.meta?.deleted_at && link.customer_id &&
    ((jobId && link.job_id === jobId) || link.quote_id === quoteId)).map(link => link.customer_id!));
  return ids.size === 1 ? [...ids][0] : null;
}

export function staffQuoteLetter(quote: QuoteTableRow): string | null {
  const letter = (quote.quote_letter || quote.salesQuote?.quote_letter || "").trim().toUpperCase();
  return /^[A-Z]+$/.test(letter) ? letter : quote.quote_group_id ? null : "A";
}

/** Build identity components before filtering or paging, keeping alternatives together. */
export function groupStaffQuotes(quotes: QuoteTableRow[]): StaffQuoteCustomer[] {
  const parent = quotes.map((_, index) => index);
  const root = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  const anchors = new Map<string, number>();
  quotes.forEach((quote, index) => {
    for (const anchor of [quote.crm_job_id && `job:${quote.crm_job_id}`, quote.quote_group_id && `group:${quote.quote_group_id}`]) {
      if (!anchor) continue;
      const previous = anchors.get(anchor);
      if (previous !== undefined) parent[root(index)] = root(previous);
      anchors.set(anchor, index);
    }
  });
  const customerIds = new Map<number, Set<string>>();
  quotes.forEach((quote, index) => {
    if (!quote.customer_id) return;
    const component = root(index);
    const ids = customerIds.get(component) || new Set<string>();
    ids.add(quote.customer_id);
    customerIds.set(component, ids);
  });
  const groups = new Map<string, StaffQuoteCustomer>();
  quotes.forEach((quote, index) => {
    const component = root(index);
    const ids = customerIds.get(component);
    // Conflicting stored customers must not get merged through a shared anchor.
    const customerId = ids?.size === 1 ? [...ids][0] : quote.customer_id;
    const id = customerId ? `customer:${customerId}` : ids && ids.size > 1
      ? `quote:${quote.source}:${quote.id}` : `quotes:${quotes[component].source}:${quotes[component].id}`;
    const group = groups.get(id) || {
      id, name: quote.customer_name || "Customer name unavailable", address: quote.customer_address || null, quotes: [],
    };
    group.address ||= quote.customer_address || null;
    group.quotes.push(quote);
    groups.set(id, group);
  });
  for (const group of groups.values()) {
    // CRM delivery and builder copies can represent the same saved option.
    // Collapse only explicit option letters with the same number inside an
    // already identity-linked customer box; keep the newest visible record.
    const options = new Set<string>();
    group.quotes = group.quotes.filter(quote => {
      const savedLetter = quote.quote_letter || quote.salesQuote?.quote_letter;
      if (!savedLetter || !staffQuoteLetter(quote) || !quote.quote_number) return true;
      const key = `${staffQuoteLetter(quote)}:${quote.quote_number}`;
      if (options.has(key)) return false;
      options.add(key);
      return true;
    });
    group.quotes.sort((a, b) => {
      const aLetter = staffQuoteLetter(a), bLetter = staffQuoteLetter(b);
      if (aLetter && bLetter) return aLetter.length - bLetter.length || aLetter.localeCompare(bLetter) ||
        (a.quote_number || "").localeCompare(b.quote_number || "", undefined, { numeric: true });
      return aLetter ? -1 : bLetter ? 1 : 0;
    });
  }
  return [...groups.values()];
}

export function staffCustomerQuoteView(quotes: QuoteTableRow[], filter: StaffQuoteFilter, search: string) {
  const allCustomers = groupStaffQuotes(quotes);
  const visibleQuotes = allCustomers.flatMap(customer => customer.quotes);
  const view = staffQuoteView(visibleQuotes, filter, search);
  const matchingIds = new Set(view.matching.map(quote => `${quote.source}:${quote.id}`));
  const customers = allCustomers.filter(customer => customer.quotes.some(quote => matchingIds.has(`${quote.source}:${quote.id}`)));
  return { ...view, customers, matchingIds };
}
