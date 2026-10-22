import { describe, expect, it } from "vitest";
import { getQuoteType, newQuoteTypeFields } from "./quoteType";
import { buildQuoteInstallerNotesMeta, getQuoteBuilderNote, getQuoteCustomerNotes } from "./quoteTotals";

describe("quote type at creation", () => {
  it("leaves existing residential inserts and old quotes unchanged", () => {
    expect(newQuoteTypeFields("residential")).toEqual({});
    for (const quote of [null, {}, { installer_notes: null }, { installer_notes: "Existing installer note" }, { installer_notes: '{"__adminControls":{}}' }]) {
      expect(getQuoteType(quote)).toBe("residential");
    }
  });

  it("requires the explicit commercial choice and reads it back from saved notes", () => {
    expect(getQuoteType(newQuoteTypeFields("commercial"))).toBe("commercial");
    for (const notes of ['{"__quoteType":"Residential"}', '{"__quoteType":true}', 'null', '[]', '{"__quoteType":"unknown"}']) {
      expect(getQuoteType({ installer_notes: notes })).toBe("residential");
    }
  });

  it("retains commercial classification when the builder note and controls change", () => {
    const quote = newQuoteTypeFields("commercial");
    const installer_notes = buildQuoteInstallerNotesMeta(quote, {
      __quoteBuilderNote: "Field measure required",
      __adminControls: { showTax: true, taxPercent: 7.25 },
    });
    expect(getQuoteType({ installer_notes })).toBe("commercial");
    expect(getQuoteBuilderNote({ installer_notes })).toBe("Field measure required");
    expect(getQuoteCustomerNotes(installer_notes)).toBeNull();
    expect(JSON.parse(installer_notes).__adminControls.taxPercent).toBe(7.25);
  });

  it("inherits commercial for a new version without copying its notes or prices", () => {
    const source = { installer_notes: '{"__quoteType":"commercial","__quoteBuilderNote":"Existing project note","__adminControls":{"discountPercent":15}}' };
    expect(newQuoteTypeFields(getQuoteType(source))).toEqual({ installer_notes: '{"__quoteType":"commercial"}' });
  });
});
