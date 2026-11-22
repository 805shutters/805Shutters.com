/**
 * 805 quote IDs and side marks.
 *
 * Every choice for new quote IDs lives in `QUOTE_ID_CONFIG`. The database
 * allocator in
 * `supabase/migrations/20261114200000_new_quote_ids_and_side_marks.sql`
 * repeats the same alphabet, length, retry count, and lock name. Change both
 * together.
 *
 * New IDs are `805-` plus exactly 3 characters from a 32-character alphabet:
 * A–Z without O, I, and L, plus digits 1–9. That is 32^3 = 32,768 IDs.
 * All-digit IDs such as `805-257` are allowed. There is no option suffix.
 *
 * Legacy IDs stay valid as exact text: `805-0574`, `805-1001`,
 * `805-0161-FUTURE`, `805-0078-O…`, and an existing trailing suffix such as
 * `805-0257A`. They are never parsed into a number, padded, or stripped.
 *
 * Side mark policy:
 * - On create, the side mark is the customer's last name, a space, and the
 *   full quote ID, when the last name can be read cleanly.
 * - A typed side mark is stored and marked overridden. Later automatic
 *   updates do not replace it.
 * - Before the quote is sold, a customer-name or quote-number change
 *   regenerates an automatic side mark. After it is sold (sold status, or a
 *   signed/sold timestamp), the automatic side mark stays put.
 * - If the last name is ambiguous, the side mark is left empty for a person.
 */

export const QUOTE_ID_CONFIG = {
  prefix: "805-",
  /** A–Z minus O, I, and L, plus digits 1–9. Digit 0 is excluded. */
  alphabet: "ABCDEFGHJKMNPQRSTUVWXYZ123456789",
  length: 3,
  /** Same advisory lock the old 4-digit allocator held. */
  allocationLockKey: "quote-v2-number-allocation:805",
  /** Random draws before the allocator fails instead of inventing another shape. */
  maxAttempts: 64,
} as const;

/** 32^3. All-digit IDs are included. */
export const QUOTE_ID_CAPACITY = 32 ** 3;

const ALPHABET_SET = new Set(QUOTE_ID_CONFIG.alphabet.split(""));

const GENERATIONAL_SUFFIXES = new Set([
  "jr",
  "sr",
  "ii",
  "iii",
  "iv",
  "v",
  "vi",
  "esq",
  "esquire",
  "junior",
  "senior",
  "2nd",
  "3rd",
  "4th",
]);

const NAME_PARTICLES = new Set([
  "de",
  "da",
  "del",
  "della",
  "di",
  "van",
  "von",
  "der",
  "den",
  "la",
  "le",
  "st",
  "ste",
  "ten",
  "ter",
  "du",
  "dos",
  "das",
  "bin",
  "ibn",
  "al",
  "el",
]);

const COMPANY_TOKENS = new Set([
  "llc",
  "inc",
  "incorporated",
  "corp",
  "corporation",
  "co",
  "company",
  "ltd",
  "limited",
  "llp",
  "pllc",
  "pc",
  "trust",
  "associates",
  "holdings",
  "group",
  "enterprises",
  "services",
  "solutions",
]);

const LEGACY_QUOTE_ID =
  /^805-(?:\d{4}|\d{4}[A-Z0-9]+|\d{4}-FUTURE|\d{4}-O[0-9A-F]+)$/;

const FROZEN_QUOTE_STATUSES = new Set([
  "sold",
  "approved",
  "ordered",
  "received",
  "installed",
  "invoiced",
  "paid",
]);

export class QuoteIdExhaustedError extends Error {
  constructor(attempts: number) {
    super(
      `No unused 805 quote ID could be issued after ${attempts} attempts. The 32-character alphabet has ${QUOTE_ID_CAPACITY} IDs. Refusing to roll into a 4-digit number.`,
    );
    this.name = "QuoteIdExhaustedError";
  }
}

export function normalizeQuoteId(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function isNewFormatQuoteId(value: string): boolean {
  const normalized = normalizeQuoteId(value);
  if (!normalized.startsWith(QUOTE_ID_CONFIG.prefix)) return false;
  const body = normalized.slice(QUOTE_ID_CONFIG.prefix.length);
  if (body.length !== QUOTE_ID_CONFIG.length) return false;
  return [...body].every((character) => ALPHABET_SET.has(character));
}

/** Exact legacy shapes already stored in production. Not a numeric parse. */
export function isLegacyQuoteId(value: string): boolean {
  return LEGACY_QUOTE_ID.test(normalizeQuoteId(value));
}

/**
 * First 3 characters after `805-` on a legacy ID, as text.
 * `805-0257` → `025`, `805-1001` → `100`, `805-0161-FUTURE` → `016`.
 * New-format IDs are not legacy and return null.
 */
export function legacyIdBodyPrefix(value: string): string | null {
  const normalized = normalizeQuoteId(value);
  if (!isLegacyQuoteId(normalized)) return null;
  return normalized.slice(QUOTE_ID_CONFIG.prefix.length, QUOTE_ID_CONFIG.prefix.length + QUOTE_ID_CONFIG.length);
}

export function sameQuoteId(left: string, right: string): boolean {
  return normalizeQuoteId(left) === normalizeQuoteId(right);
}

/**
 * Keep a previously stored number when it is unchanged. New values must be a
 * new-format ID or one of the legacy shapes. Nothing is padded or parsed.
 */
export function canonicalQuoteNumber(value: string, previous?: string | null): string {
  const normalized = normalizeQuoteId(value);
  if (!normalized) {
    throw new Error("A quote number is required.");
  }
  if (previous && normalizeQuoteId(previous) === normalized) return normalized;
  if (isNewFormatQuoteId(normalized) || isLegacyQuoteId(normalized)) return normalized;
  throw new Error(
    "Quote number must be 805- plus 3 letters or digits (no O, I, L, or 0), or an existing legacy number such as 805-0574.",
  );
}

export function quoteIdConflictsWithLegacy(candidateBody: string, legacyQuoteNumbers: readonly string[]): boolean {
  return legacyQuoteNumbers.some((quoteNumber) => legacyIdBodyPrefix(quoteNumber) === candidateBody);
}

function randomAlphabetIndex(randomByte: () => number): number {
  // 256 is divisible by 32, so a full random byte maps evenly onto the alphabet.
  return randomByte() % QUOTE_ID_CONFIG.alphabet.length;
}

function defaultRandomByte(): number {
  const bytes = new Uint8Array(1);
  crypto.getRandomValues(bytes);
  return bytes[0] ?? 0;
}

export function generateQuoteId(input: {
  taken?: ReadonlySet<string>;
  legacyQuoteNumbers?: readonly string[];
  randomByte?: () => number;
  maxAttempts?: number;
} = {}): string {
  const taken = input.taken ?? new Set<string>();
  const legacyQuoteNumbers = input.legacyQuoteNumbers ?? [];
  const randomByte = input.randomByte ?? defaultRandomByte;
  const maxAttempts = input.maxAttempts ?? QUOTE_ID_CONFIG.maxAttempts;
  const blockedBodies = new Set(
    legacyQuoteNumbers
      .map((quoteNumber) => legacyIdBodyPrefix(quoteNumber))
      .filter((prefix): prefix is string => Boolean(prefix)),
  );

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let body = "";
    for (let index = 0; index < QUOTE_ID_CONFIG.length; index += 1) {
      body += QUOTE_ID_CONFIG.alphabet[randomAlphabetIndex(randomByte)];
    }
    if (blockedBodies.has(body)) continue;
    const quoteId = `${QUOTE_ID_CONFIG.prefix}${body}`;
    if (taken.has(quoteId)) continue;
    return quoteId;
  }

  throw new QuoteIdExhaustedError(maxAttempts);
}

function collapseSpaces(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function bareToken(token: string): string {
  return token.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isGenerationalSuffix(token: string): boolean {
  return GENERATIONAL_SUFFIXES.has(bareToken(token));
}

function isCompanyToken(token: string): boolean {
  return COMPANY_TOKENS.has(bareToken(token)) || token.includes("&");
}

function stripGenerationalSuffixes(tokens: string[], keepOne: boolean): string[] {
  const remaining = [...tokens];
  while (remaining.length > (keepOne ? 1 : 0) && isGenerationalSuffix(remaining[remaining.length - 1] ?? "")) {
    remaining.pop();
  }
  return remaining;
}

function looksLikeCompany(tokens: string[]): boolean {
  return tokens.some((token) => isCompanyToken(token));
}

function explicitLastName(tokens: string[]): string | null {
  if (!tokens.length || looksLikeCompany(tokens)) return null;
  const lastName = tokens.join(" ");
  if (!/[a-z]/i.test(lastName) || /^[a-z]\.?$/i.test(lastName)) return null;
  return lastName;
}

function lastNameFromGivenAndSurname(tokens: string[]): string | null {
  const name = stripGenerationalSuffixes(tokens, true);
  if (name.length < 2 || looksLikeCompany(name)) return null;
  const surname = [name[name.length - 1] ?? ""];
  for (let index = name.length - 2; index >= 1; index -= 1) {
    if (!NAME_PARTICLES.has(bareToken(name[index] ?? ""))) break;
    surname.unshift(name[index] ?? "");
  }
  return explicitLastName(surname);
}

/**
 * Last name only. Returns null when the name is a single word, a company, or
 * otherwise not clearly a person's surname.
 */
export function deriveCustomerLastName(customerName: string): string | null {
  const cleaned = collapseSpaces(customerName);
  if (!cleaned) return null;

  const comma = cleaned.indexOf(",");
  if (comma >= 0) {
    const left = stripGenerationalSuffixes(collapseSpaces(cleaned.slice(0, comma)).split(" ").filter(Boolean), true);
    const right = stripGenerationalSuffixes(collapseSpaces(cleaned.slice(comma + 1)).split(" ").filter(Boolean), false);
    if (right.length === 0) return lastNameFromGivenAndSurname(left);
    return explicitLastName(left);
  }

  return lastNameFromGivenAndSurname(cleaned.split(" ").filter(Boolean));
}

export function buildSideMark(customerName: string, quoteId: string): string | null {
  const lastName = deriveCustomerLastName(customerName);
  const id = normalizeQuoteId(quoteId);
  if (!lastName || !id) return null;
  return `${lastName} ${id}`;
}

export function sideMarkForNewQuote(
  customerName: string,
  quoteId: string,
  override?: string | null,
): { sideMark: string | null; overridden: boolean } {
  const typed = override?.trim() ?? "";
  if (typed) return { sideMark: typed, overridden: true };
  return { sideMark: buildSideMark(customerName, quoteId), overridden: false };
}

export function sideMarkIsFrozen(quote: {
  status?: string | null;
  signed_at?: string | null;
  sold_at?: string | null;
}): boolean {
  if (quote.signed_at || quote.sold_at) return true;
  return FROZEN_QUOTE_STATUSES.has(String(quote.status || ""));
}

export function nextAutomaticSideMark(input: {
  customerName: string;
  quoteNumber: string;
  existingSideMark: string | null;
  overridden: boolean;
  frozen: boolean;
  nameChanged: boolean;
  numberChanged: boolean;
}): string | null | undefined {
  if (input.overridden || input.frozen) return undefined;
  if (!input.nameChanged && !input.numberChanged) return undefined;
  return buildSideMark(input.customerName, input.quoteNumber);
}
