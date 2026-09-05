import type { CrmQuote } from "./types";
import { businessDate } from "./business-date";
export const reportableQuote = (q: CrmQuote) =>
  !q.meta?.deleted_at && !q.meta?.is_test && !q.meta?.test_mode;
export const acceptedOpportunityQuote = (q: CrmQuote) =>
  Boolean(
    q.signed_at ||
    q.sold_at ||
    q.approved_at ||
    ["approved", "sold", "ordered", "received", "installed", "paid"].includes(
      q.status,
    ),
  );
export function groupQuoteOpportunities(input: CrmQuote[]) {
  const quotes = input.filter(reportableQuote),
    counts = new Map<string, number>(),
    groups = new Map<string, CrmQuote[]>(),
    review: CrmQuote[] = [];
  quotes.forEach((q) => counts.set(q.job_id, (counts.get(q.job_id) || 0) + 1));
  for (const q of quotes) {
    const key = q.quote_group_id
      ? `group:${q.job_id}:${q.quote_group_id}`
      : counts.get(q.job_id) === 1
        ? `quote:${q.id}`
        : null;
    if (!key) {
      review.push(q);
      continue;
    }
    groups.set(key, [...(groups.get(key) || []), q]);
  }
  return { groups, review };
}
export function currentOfferedQuotes(
  input: CrmQuote[],
  from: string,
  through: string,
) {
  const { groups } = groupQuoteOpportunities(input);
  const result: CrmQuote[] = [];
  for (const versions of groups.values()) {
    if (versions.some(acceptedOpportunityQuote)) continue;
    const latest = versions
      .filter(
        (q) => businessDate(q.sent_at) && businessDate(q.sent_at)! <= through,
      )
      .sort(
        (a, b) =>
          (b.sent_at || "").localeCompare(a.sent_at || "") ||
          b.id.localeCompare(a.id),
      )[0];
    if (
      !latest ||
      ["lost", "declined", "archived", "canceled"].includes(latest.status) ||
      businessDate(latest.sent_at)! < from
    )
      continue;
    result.push(latest);
  }
  return result;
}
