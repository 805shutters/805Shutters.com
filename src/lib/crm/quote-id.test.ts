import { describe, expect, it } from "vitest";
import {
  QUOTE_ID_CAPACITY,
  QUOTE_ID_CONFIG,
  QuoteIdExhaustedError,
  buildSideMark,
  canonicalQuoteNumber,
  deriveCustomerLastName,
  generateQuoteId,
  isLegacyQuoteId,
  isNewFormatQuoteId,
  legacyIdBodyPrefix,
  nextAutomaticSideMark,
  normalizeQuoteId,
  quoteIdConflictsWithLegacy,
  sameQuoteId,
  sideMarkForNewQuote,
  sideMarkIsFrozen,
} from "./quote-id";

const ALPHABET = QUOTE_ID_CONFIG.alphabet;

function bytes(...values: number[]): () => number {
  let index = 0;
  return () => values[index++] ?? values[values.length - 1] ?? 0;
}

function bodyIndex(character: string): number {
  const index = ALPHABET.indexOf(character);
  if (index < 0) throw new Error(`Character ${character} is not in the quote alphabet.`);
  return index;
}

describe("805 quote id formats", () => {
  it("uses a 32-character alphabet and 32,768 ids", () => {
    expect(ALPHABET).toHaveLength(32);
    expect(new Set(ALPHABET).size).toBe(32);
    expect(ALPHABET).toBe("ABCDEFGHJKMNPQRSTUVWXYZ123456789");
    expect(ALPHABET).not.toMatch(/[OIL0]/);
    expect(ALPHABET).toContain("1");
    expect(QUOTE_ID_CAPACITY).toBe(32 ** 3);
    expect(QUOTE_ID_CAPACITY).toBe(32768);
  });

  it("accepts new-format ids, including all digits, and normalizes case", () => {
    expect(isNewFormatQuoteId("805-A1B")).toBe(true);
    expect(isNewFormatQuoteId("805-257")).toBe(true);
    expect(isNewFormatQuoteId("805-zz9")).toBe(true);
    expect(normalizeQuoteId(" 805-a1b ")).toBe("805-A1B");
    expect(isNewFormatQuoteId("805-a1b")).toBe(true);
    expect(isNewFormatQuoteId("805-O1B")).toBe(false);
    expect(isNewFormatQuoteId("805-I1B")).toBe(false);
    expect(isNewFormatQuoteId("805-L1B")).toBe(false);
    expect(isNewFormatQuoteId("805-01B")).toBe(false);
    expect(isNewFormatQuoteId("805-A1")).toBe(false);
    expect(isNewFormatQuoteId("805-A1B2")).toBe(false);
  });

  it("keeps legacy shapes valid without treating them as the new format", () => {
    for (const legacy of ["805-0574", "805-0573", "805-1001", "805-0161-FUTURE", "805-0078-OA1B2C3D", "805-0257A"]) {
      expect(isLegacyQuoteId(legacy)).toBe(true);
      expect(isNewFormatQuoteId(legacy)).toBe(false);
    }
    expect(isLegacyQuoteId("805-0161-future")).toBe(true);
    expect(canonicalQuoteNumber("805-0574")).toBe("805-0574");
    expect(canonicalQuoteNumber("805-a1b")).toBe("805-A1B");
    expect(() => canonicalQuoteNumber("805-HELLO")).toThrow(/legacy number/i);
    expect(canonicalQuoteNumber("805-100", "805-100")).toBe("805-100");
  });

  it("treats 805-257 and 805-0257 as different exact ids", () => {
    expect(sameQuoteId("805-257", "805-0257")).toBe(false);
    expect(sameQuoteId("805-0257", "805-257")).toBe(false);
    expect(sameQuoteId("805-0257", "805-0257")).toBe(true);
    expect(legacyIdBodyPrefix("805-0257")).toBe("025");
    expect(legacyIdBodyPrefix("805-0257A")).toBe("025");
    expect(legacyIdBodyPrefix("805-1001")).toBe("100");
    expect(legacyIdBodyPrefix("805-0161-FUTURE")).toBe("016");
    expect(legacyIdBodyPrefix("805-0574")).toBe("057");
    expect(legacyIdBodyPrefix("805-257")).toBeNull();
    expect(quoteIdConflictsWithLegacy("257", ["805-0257", "805-1001"])).toBe(false);
    expect(quoteIdConflictsWithLegacy("025", ["805-0257"])).toBe(true);
    expect(quoteIdConflictsWithLegacy("100", ["805-1001"])).toBe(true);
  });
});

describe("quote id generator", () => {
  it("draws only from the alphabet and can issue an all-digit id", () => {
    const id = generateQuoteId({
      randomByte: bytes(bodyIndex("2"), bodyIndex("5"), bodyIndex("7")),
    });
    expect(id).toBe("805-257");
    expect(isNewFormatQuoteId(id)).toBe(true);
  });

  it("retries a taken id and never returns one that was already issued", () => {
    const taken = new Set(["805-257", "805-A1B"]);
    const id = generateQuoteId({
      taken,
      randomByte: bytes(
        bodyIndex("2"), bodyIndex("5"), bodyIndex("7"),
        bodyIndex("A"), bodyIndex("1"), bodyIndex("B"),
        bodyIndex("Z"), bodyIndex("Z"), bodyIndex("9"),
      ),
    });
    expect(id).toBe("805-ZZ9");
    expect(taken.has(id)).toBe(false);
  });

  it("skips a body that matches the first 3 characters of a legacy id", () => {
    const id = generateQuoteId({
      legacyQuoteNumbers: ["805-2578"],
      randomByte: bytes(
        bodyIndex("2"), bodyIndex("5"), bodyIndex("7"),
        bodyIndex("A"), bodyIndex("1"), bodyIndex("B"),
      ),
    });
    expect(id).toBe("805-A1B");
  });

  it("fails loudly when every attempt is already used", () => {
    expect(() =>
      generateQuoteId({
        taken: new Set(["805-AAA"]),
        maxAttempts: 2,
        randomByte: () => bodyIndex("A"),
      }),
    ).toThrow(QuoteIdExhaustedError);
    expect(() =>
      generateQuoteId({
        taken: new Set(["805-AAA"]),
        maxAttempts: 2,
        randomByte: () => bodyIndex("A"),
      }),
    ).toThrow(/32768/);
  });

  it("does not reuse an id that is only remembered as taken", () => {
    const retired = new Set(["805-K7M"]);
    const id = generateQuoteId({
      taken: retired,
      randomByte: bytes(
        bodyIndex("K"), bodyIndex("7"), bodyIndex("M"),
        bodyIndex("B"), bodyIndex("2"), bodyIndex("C"),
      ),
    });
    expect(id).toBe("805-B2C");
  });
});

describe("side marks", () => {
  it("uses the last name and the full id", () => {
    expect(buildSideMark("John DiCiacchio", "805-A1B")).toBe("DiCiacchio 805-A1B");
    expect(buildSideMark("  John   DiCiacchio Jr.  ", "805-257")).toBe("DiCiacchio 805-257");
    expect(buildSideMark("Maria de la Cruz", "805-A1B")).toBe("de la Cruz 805-A1B");
    expect(buildSideMark("Mary Anne Smith-Jones", "805-ZZ9")).toBe("Smith-Jones 805-ZZ9");
    expect(buildSideMark("DiCiacchio, John", "805-A1B")).toBe("DiCiacchio 805-A1B");
    expect(buildSideMark("John DiCiacchio, Jr.", "805-A1B")).toBe("DiCiacchio 805-A1B");
    expect(buildSideMark("Vincent van Gogh", "805-A1B")).toBe("van Gogh 805-A1B");
  });

  it("leaves an unclear last name empty", () => {
    expect(deriveCustomerLastName("Madonna")).toBeNull();
    expect(deriveCustomerLastName("ACME LLC")).toBeNull();
    expect(deriveCustomerLastName("The Smith Group")).toBeNull();
    expect(buildSideMark("ACME Shutters LLC", "805-A1B")).toBeNull();
    expect(buildSideMark("   ", "805-A1B")).toBeNull();
  });

  it("keeps a typed side mark and regenerates an automatic one only before the quote is sold", () => {
    expect(sideMarkForNewQuote("John DiCiacchio", "805-A1B", "  Shop mark  ")).toEqual({
      sideMark: "Shop mark",
      overridden: true,
    });
    expect(sideMarkForNewQuote("John DiCiacchio", "805-a1b")).toEqual({
      sideMark: "DiCiacchio 805-A1B",
      overridden: false,
    });
    expect(nextAutomaticSideMark({
      customerName: "John DiCiacchio",
      quoteNumber: "805-A1B",
      existingSideMark: "DiCiacchio 805-OLD",
      overridden: true,
      frozen: false,
      nameChanged: true,
      numberChanged: false,
    })).toBeUndefined();
    expect(nextAutomaticSideMark({
      customerName: "Mary DiCiacchio",
      quoteNumber: "805-A1B",
      existingSideMark: "Smith 805-A1B",
      overridden: false,
      frozen: false,
      nameChanged: true,
      numberChanged: false,
    })).toBe("DiCiacchio 805-A1B");
    expect(sideMarkIsFrozen({ status: "sold" })).toBe(true);
    expect(sideMarkIsFrozen({ status: "draft", signed_at: "2026-11-01" })).toBe(true);
    expect(nextAutomaticSideMark({
      customerName: "Mary DiCiacchio",
      quoteNumber: "805-A1B",
      existingSideMark: "Smith 805-A1B",
      overridden: false,
      frozen: true,
      nameChanged: true,
      numberChanged: true,
    })).toBeUndefined();
  });
});
