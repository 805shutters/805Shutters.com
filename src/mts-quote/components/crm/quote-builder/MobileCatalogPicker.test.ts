import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  MobileCatalogPicker,
  createMobileCatalogPickerState,
  filterMobileCatalogPickerItems,
  reduceMobileCatalogPickerState,
  selectMobileCatalogPickerItem,
  type MobileCatalogPickerItem,
} from "./MobileCatalogPicker";

const rows: MobileCatalogPickerItem[] = [
  { id: "linen:f100", name: "Platinum White", code: "F100", collection: "Linen", detail: "Light Filtering" },
  { id: "linen:f200", name: "Black", code: "F200", collection: "Linen", disabled: true },
  { id: "weave:f300", name: "Pearl", code: "F300", collection: "Natural Weave" },
];

describe("MobileCatalogPicker", () => {
  it("filters across name, code, and collection before presentation limits", () => {
    expect(filterMobileCatalogPickerItems(rows, "linen platinum").map((row) => row.id)).toEqual(["linen:f100"]);
    expect(filterMobileCatalogPickerItems(rows, "f300").map((row) => row.id)).toEqual(["weave:f300"]);
    expect(filterMobileCatalogPickerItems(rows, "natural").map((row) => row.id)).toEqual(["weave:f300"]);
  });

  it("retains a confirmed selection while searching and canceling", () => {
    const selected = rows[0];
    let state = createMobileCatalogPickerState(true);
    state = reduceMobileCatalogPickerState(state, { type: "reopen" });
    state = reduceMobileCatalogPickerState(state, { type: "query", query: "black" });
    expect(state).toMatchObject({ isOpen: true, query: "black" });
    expect(selected).toBe(rows[0]);
    state = reduceMobileCatalogPickerState(state, { type: "cancel", hasSelection: true });
    expect(state).toEqual(createMobileCatalogPickerState(true));
  });

  it("blocks disabled choices and wires the exact catalog object to selection callbacks", () => {
    const onSelect = vi.fn();
    expect(selectMobileCatalogPickerItem(rows[1], onSelect)).toBe(false);
    expect(onSelect).not.toHaveBeenCalled();
    expect(selectMobileCatalogPickerItem(rows[2], onSelect)).toBe(true);
    expect(onSelect).toHaveBeenCalledWith(rows[2]);
  });

  it("collapses after selection and reopens with a fresh search page", () => {
    let state = createMobileCatalogPickerState(false);
    state = reduceMobileCatalogPickerState(state, { type: "query", query: "white" });
    state = reduceMobileCatalogPickerState(state, { type: "choose" });
    expect(state).toMatchObject({ isOpen: false, query: "" });
    state = reduceMobileCatalogPickerState(state, { type: "reopen" });
    expect(state).toEqual({ isOpen: true, query: "", visibleCount: 24 });
  });

  it("renders a compact selected button and an accessible two-column picker shell", () => {
    const selectedHtml = renderToStaticMarkup(createElement(MobileCatalogPicker, {
      label: "Color", selectedItem: rows[0], items: rows, onSelect: () => undefined, onClear: () => undefined,
      noResultsLabel: "No colors match.",
    }));
    expect(selectedHtml).toContain("Change selection");
    expect(selectedHtml).toContain("Platinum White");
    expect(selectedHtml).not.toContain("Search colors or codes");

    const openHtml = renderToStaticMarkup(createElement(MobileCatalogPicker, {
      label: "Fabric", selectedItem: null, items: rows, onSelect: () => undefined, onClear: () => undefined,
      noResultsLabel: "No fabrics match.",
    }));
    expect(openHtml).toContain("Search colors or codes");
    expect(openHtml).toContain('aria-label="Fabric choices"');
    expect(openHtml).toContain("Light Filtering");
    expect(openHtml).toContain("disabled");

    const emptyHtml = renderToStaticMarkup(createElement(MobileCatalogPicker, {
      label: "Color", selectedItem: null, items: [], onSelect: () => undefined, onClear: () => undefined,
      noResultsLabel: "No colors match this search.",
    }));
    expect(emptyHtml).toContain('role="status"');
    expect(emptyHtml).toContain("No colors match this search.");
  });
});
