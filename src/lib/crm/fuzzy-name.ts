/** Fuzzy sidemark fallback. Never an automatic COGS or ship-date write. */

export const FUZZY_NAME_MAX_DISTANCE = 2;

const MIN_COMPARE_LENGTH = 4;

/** Quote and job statuses that are sold or further along. Approved is still before sold. */
export const SOLD_OR_LATER_STATUSES = new Set([
  "sold",
  "ordered",
  "received",
  "installed",
  "invoiced",
  "paid",
  "closed",
]);

export type FuzzyNamePerson = {
  quoteId: string | null;
  quoteNumber: string | null;
  jobId: string | null;
  customerName: string | null;
  signerName: string | null;
  /** When set, only sold-or-later rows are eligible. Omitted means the caller already filtered. */
  status?: string | null;
};

export type FuzzyNameSuggestion = {
  quoteId: string | null;
  quoteNumber: string | null;
  jobId: string | null;
  customerName: string | null;
  signerName: string | null;
  distance: number;
};

export function levenshtein(left: string, right: string, max = FUZZY_NAME_MAX_DISTANCE) {
  if (left === right) return 0;
  if (Math.abs(left.length - right.length) > max) return max + 1;
  if (!left.length || !right.length) return Math.max(left.length, right.length);
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left.charCodeAt(i - 1) === right.charCodeAt(j - 1) ? 0 : 1;
      const value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      current[j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return max + 1;
    previous = current;
  }
  return previous[right.length];
}

/**
 * Strip a leading dealer code such as CHE01-, then lowercase and remove punctuation.
 * The last token is the last name after the first name is dropped.
 */
export function normalizeSidemark(value: string) {
  const withoutDealer = value.trim().replace(/^(?=[A-Za-z]*\d)[A-Za-z0-9]+-/, "");
  const full = withoutDealer
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = full.split(" ").filter(Boolean);
  const last = tokens.length > 1 ? tokens[tokens.length - 1] : full;
  return { full, last };
}

function compareKeys(value: string | null | undefined) {
  const { full, last } = normalizeSidemark(value || "");
  const keys = new Set<string>();
  if (full.length >= MIN_COMPARE_LENGTH) keys.add(full);
  if (last.length >= MIN_COMPARE_LENGTH) keys.add(last);
  return [...keys];
}

export function is805QuoteNumber(quoteNumber: string | null | undefined) {
  if (!quoteNumber?.trim()) return true;
  return quoteNumber.trim().toLowerCase().startsWith("805");
}

export function isSoldOrLater(status: string | null | undefined) {
  if (!status) return true;
  return SOLD_OR_LATER_STATUSES.has(status);
}

function bestDistance(left: string[], right: string[]) {
  let best: number | null = null;
  for (const probe of left) {
    for (const target of right) {
      const distance = levenshtein(probe, target);
      if (distance > FUZZY_NAME_MAX_DISTANCE) continue;
      if (best === null || distance < best) best = distance;
    }
  }
  return best;
}

function personKeys(person: FuzzyNamePerson) {
  return [...new Set([...compareKeys(person.customerName), ...compareKeys(person.signerName)])];
}

/** Sidemark against customer last name, customer full name, and contract-signer name. */
export function suggestFuzzyNames(sidemark: string, people: FuzzyNamePerson[]): FuzzyNameSuggestion[] {
  const probes = compareKeys(sidemark);
  if (!probes.length) return [];
  const byKey = new Map<string, FuzzyNameSuggestion>();
  for (const person of people) {
    if (!isSoldOrLater(person.status) || !is805QuoteNumber(person.quoteNumber)) continue;
    const distance = bestDistance(probes, personKeys(person));
    if (distance === null) continue;
    const key = person.quoteId || (person.jobId ? `job:${person.jobId}` : person.customerName || person.signerName || "");
    if (!key) continue;
    const current = byKey.get(key);
    if (current && current.distance <= distance) continue;
    byKey.set(key, {
      quoteId: person.quoteId,
      quoteNumber: person.quoteNumber,
      jobId: person.jobId,
      customerName: person.customerName,
      signerName: person.signerName,
      distance,
    });
  }
  return [...byKey.values()].sort((left, right) =>
    left.distance - right.distance
    || (left.quoteNumber || "").localeCompare(right.quoteNumber || "")
    || (left.quoteId || "").localeCompare(right.quoteId || ""));
}

export function fuzzyReviewReason(suggestions: FuzzyNameSuggestion[]) {
  if (suggestions.length === 1) return `fuzzy_name, distance ${suggestions[0].distance}`;
  const listed = suggestions.map(item => {
    const label = item.quoteNumber || item.quoteId || item.jobId || "quote";
    const name = item.customerName || item.signerName || "";
    return `${label}${name ? ` ${name}` : ""} distance ${item.distance}`;
  }).join("; ");
  return `fuzzy_name; candidates: ${listed}`;
}

export function shippingReviewQuoteText(input: { detail: string | null; quoteNumber: string | null; quoteId?: string | null }) {
  if (!input.detail?.startsWith("fuzzy_name")) return input.quoteNumber;
  if (/^fuzzy_name, distance \d+$/.test(input.detail)) {
    const quote = input.quoteNumber || input.quoteId || "";
    return quote ? `Suggested ${quote}` : input.detail;
  }
  const listed = input.detail.replace(/^fuzzy_name;\s*candidates:\s*/, "");
  return `Suggested ${listed}`;
}

export function shippingReviewWhyText(detail: string | null) {
  if (!detail?.startsWith("fuzzy_name")) return null;
  return detail.match(/^fuzzy_name, distance \d+/)?.[0] || "fuzzy_name";
}
