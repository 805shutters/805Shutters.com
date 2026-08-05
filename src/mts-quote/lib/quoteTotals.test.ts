import { describe, expect, it } from "vitest";
import { QUOTE_V2_SELECTED_DESIGN_MARKER } from "@/lib/quote-v2/selected-design";
import {
  buildQuoteInstallerNotesMeta,
  calculateLineItemDesignTotal,
  calculateQuoteDesignSubtotal,
  getQuoteBuilderNote,
  hasPricedQuoteDesigns,
  parseQuoteAdminControls,
  resolveQuoteTotalDesign,
  selectedQuoteTotalDesigns,
} from "./quoteTotals";

describe("quote note metadata", () => {
  it("treats plain legacy installer notes as the general job note", () => {
    expect(getQuoteBuilderNote({ installer_notes: "Bring Norman samples." })).toBe(
      "Bring Norman samples."
    );
  });

  it("returns only the metadata-backed general job note when present", () => {
    const installerNotes = JSON.stringify({
      __quoteBuilderNote: "Check side-mount clearance before ordering.",
      __customerEmailNote: "Customer-safe email copy.",
    });

    expect(getQuoteBuilderNote({ installer_notes: installerNotes })).toBe(
      "Check side-mount clearance before ordering."
    );
  });

  it("hides blank or whitespace-only general job notes", () => {
    expect(getQuoteBuilderNote({ installer_notes: null })).toBe("");
    expect(getQuoteBuilderNote({ installer_notes: "   \n  " })).toBe("");
    expect(getQuoteBuilderNote({ installer_notes: JSON.stringify({ __quoteBuilderNote: "  " }) })).toBe("");
  });

  it("preserves admin controls and unrelated metadata when updating the general job note", () => {
    const source = {
      installer_notes: JSON.stringify({
        __adminControls: { showDiscount: true, discountPercent: 10 },
        __customerEmailNote: "Thanks again.",
        stackedLineItemIds: ["line-1", "line-2"],
      }),
    };

    const updated = buildQuoteInstallerNotesMeta(source, {
      __quoteBuilderNote: "Confirm motor side with Jessica.",
    });
    const parsed = JSON.parse(updated) as Record<string, unknown>;

    expect(parsed.__quoteBuilderNote).toBe("Confirm motor side with Jessica.");
    expect(parsed.__customerEmailNote).toBe("Thanks again.");
    expect(parsed.stackedLineItemIds).toEqual(["line-1", "line-2"]);
    expect(parseQuoteAdminControls({ installer_notes: updated })).toMatchObject({
      showDiscount: true,
      discountPercent: 10,
    });
  });
});

describe("selected-design quote totals", () => {
  it("preserves cumulative A/B/C totals in the legacy runtime", () => {
    const designs = [
      { line_item_id: "line-1", variant: "A", unit_price: 100 },
      { line_item_id: "line-1", variant: "B", unit_price: 200 },
      {
        line_item_id: "line-1",
        variant: "C",
        unit_price: 300,
        [QUOTE_V2_SELECTED_DESIGN_MARKER]: true,
      },
    ];

    expect(resolveQuoteTotalDesign(designs)?.variant).toBe("C");
    expect(
      calculateLineItemDesignTotal({ id: "line-1", quantity: 2 }, designs)
    ).toBe(1_200);
  });

  it("totals only the explicitly selected alternative in authoritative V2", () => {
    const designs = [
      { line_item_id: "line-1", variant: "A", unit_price: 100 },
      { line_item_id: "line-1", variant: "B", unit_price: 200 },
      {
        line_item_id: "line-1",
        variant: "C",
        unit_price: 300,
        [QUOTE_V2_SELECTED_DESIGN_MARKER]: true,
      },
    ];

    expect(
      calculateLineItemDesignTotal(
        { id: "line-1", quantity: 2 },
        designs,
        { mode: "authoritative_v2" },
      )
    ).toBe(600);
  });

  it("falls back to A instead of cumulatively totaling unmarked alternatives", () => {
    const designs = [
      { line_item_id: "line-1", variant: "C", unit_price: 300 },
      { line_item_id: "line-1", variant: "A", unit_price: 100 },
      { line_item_id: "line-1", variant: "B", unit_price: 200 },
    ];

    expect(resolveQuoteTotalDesign(designs)?.variant).toBe("A");
    expect(
      calculateLineItemDesignTotal(
        { id: "line-1", quantity: 1 },
        designs,
        { mode: "authoritative_v2" },
      )
    ).toBe(100);
  });

  it("selects exactly one design independently for every quote line", () => {
    const designs = [
      { line_item_id: "line-1", variant: "A", unit_price: 100 },
      {
        line_item_id: "line-1",
        variant: "C",
        unit_price: 275,
        [QUOTE_V2_SELECTED_DESIGN_MARKER]: true,
      },
      { line_item_id: "line-2", variant: "B", unit_price: 500 },
      { line_item_id: "line-2", variant: "A", unit_price: 80 },
    ];

    expect(selectedQuoteTotalDesigns(designs).map((design) => design.variant)).toEqual([
      "C",
      "A",
    ]);
    expect(
      calculateQuoteDesignSubtotal(
        [
          { id: "line-1", quantity: 2 },
          { id: "line-2", quantity: 3 },
        ],
        designs,
        { mode: "authoritative_v2" },
      )
    ).toBe(790);
  });

  it("adds an authoritative once-per-line amount once, never once per quantity", () => {
    const designs = [
      {
        line_item_id: "line-1",
        variant: "A",
        unit_price: 100,
        options_json: { authoritative_once_total: 25 },
        [QUOTE_V2_SELECTED_DESIGN_MARKER]: true,
      },
      {
        line_item_id: "line-1",
        variant: "B",
        unit_price: 999,
        options_json: { authoritative_once_total: 500 },
      },
    ];

    expect(
      calculateLineItemDesignTotal(
        { id: "line-1", quantity: 3 },
        designs,
        { mode: "authoritative_v2" },
      )
    ).toBe(325);
    expect(
      calculateLineItemDesignTotal({ id: "line-1", quantity: 3 }, designs)
    ).toBe(3_297);
  });

  it("does not treat a priced unselected alternative as the sold price", () => {
    expect(
      hasPricedQuoteDesigns([
        { line_item_id: "line-1", variant: "A", unit_price: 0 },
        { line_item_id: "line-1", variant: "B", unit_price: 900 },
      ], { mode: "authoritative_v2" })
    ).toBe(false);

    expect(
      hasPricedQuoteDesigns([
        { line_item_id: "line-1", variant: "A", unit_price: 0 },
        { line_item_id: "line-1", variant: "B", unit_price: 900 },
      ])
    ).toBe(true);
  });
});
