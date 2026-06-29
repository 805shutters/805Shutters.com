const QUOTE_LETTERS = "ABCDEFGHIJ".split("");

export type QuoteGroupTabQuote = {
  id: string;
  quote_letter?: string | null;
};

function normalizedQuoteLetter(letter: string | null | undefined): string {
  return (letter || "A").trim().toUpperCase() || "A";
}

export function nextQuoteLetter(existing: (string | null | undefined)[]): string {
  const used = new Set(existing.map(normalizedQuoteLetter));
  return QUOTE_LETTERS.find((letter) => !used.has(letter)) ?? `Option ${used.size + 1}`;
}

export function buildVisibleQuoteTabs<T extends QuoteGroupTabQuote>(
  activeQuote: T | null | undefined,
  groupQuotes: T[]
): T[] {
  const quotesById = new Map<string, T>();

  for (const quote of groupQuotes) {
    quotesById.set(quote.id, quote);
  }

  if (activeQuote && !quotesById.has(activeQuote.id)) {
    quotesById.set(activeQuote.id, activeQuote);
  }

  return [...quotesById.values()].sort((a, b) =>
    normalizedQuoteLetter(a.quote_letter).localeCompare(normalizedQuoteLetter(b.quote_letter))
  );
}

export function createQuoteGroupId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}
