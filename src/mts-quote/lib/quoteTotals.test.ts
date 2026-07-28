import { describe, expect, it } from "vitest";
import {
  buildQuoteInstallerNotesMeta,
  getQuoteBuilderNote,
  parseQuoteAdminControls,
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

  it("preserves the original raw general job-note behavior", () => {
    expect(getQuoteBuilderNote({ installer_notes: null })).toBe("");
    expect(getQuoteBuilderNote({ installer_notes: "   \n  " })).toBe("   \n  ");
    expect(getQuoteBuilderNote({ installer_notes: JSON.stringify({ __quoteBuilderNote: "  " }) })).toBe("  ");
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
