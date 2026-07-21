import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BACK_FABRIC_CODE_DETAIL,
  BACK_FABRIC_COLOR_ID_DETAIL,
  parseDeferredNumberDraft,
  withoutBackFabricColorDetails,
} from "./DesignCard";
import {
  HONEYCOMB_FRAME_APPLICATIONS,
  HONEYCOMB_FRAME_TYPES,
  HONEYCOMB_SLOPED_FRAME_TYPES,
  HONEYCOMB_SPECIALTY_SHAPES,
  ROOM_PRESETS,
  VERTICAL_COLORS,
} from "@mts/lib/quoteConstants";

describe("V2 exact-interface contract", () => {
  it("keeps lab diagnostics hidden and makes only V2 prices authoritative", () => {
    const source = readFileSync(fileURLToPath(new URL("./DesignCard.tsx", import.meta.url)), "utf8");
    expect(source).toContain("{showLabCatalogControls && (");
    expect(source).not.toContain("{isolated && (");
    expect(source).toContain("allowManualPriceEditing={!authoritativeV2}");
    expect(source).toContain('aria-label="Authoritative price"');
    expect(source).toContain("if (authoritativeV2) return;");
    expect(source).toContain("Authoritative pricing blocked");
    expect(source).toContain("authoritativeV2 && designs.some");
  });

  it("places the selected manufacturer stamp immediately after the measurements", () => {
    const source = readFileSync(fileURLToPath(new URL("./DesignCard.tsx", import.meta.url)), "utf8");
    const measurement = source.indexOf("quote-line-card-size-value");
    const stamp = source.indexOf("quote-line-manufacturer-stamp");
    const summary = source.indexOf("quote-line-card-summary");
    expect(measurement).toBeGreaterThan(-1);
    expect(stamp).toBeGreaterThan(measurement);
    expect(summary).toBeGreaterThan(stamp);
    expect(source).toContain('data-testid="manufacturer-stamp"');
    expect(source).toContain("{manufacturerStamp.label}");
    const quoteBuilderSource = readFileSync(
      fileURLToPath(new URL("./QuoteBuilder.tsx", import.meta.url)),
      "utf8",
    );
    expect(quoteBuilderSource).toContain('data-testid="stacked-manufacturer-stamp"');
    expect(quoteBuilderSource).toContain("resolveSelectedQuoteDesign(designs)");
    expect(quoteBuilderSource).toContain(
      "[QUOTE_V2_SELECTED_DESIGN_MARKER]",
    );
  });

  it("stores rear color evidence without deleting front color evidence", () => {
    const options = {
      fabric_color_id: "front-id",
      fabric_color_code: "F100",
      [BACK_FABRIC_COLOR_ID_DETAIL]: "back-id",
      [BACK_FABRIC_CODE_DETAIL]: "B200",
      back_fabric_color: "B200 - Back",
    };
    expect(withoutBackFabricColorDetails(options)).toEqual({
      fabric_color_id: "front-id",
      fabric_color_code: "F100",
    });
  });

  it("keeps actual room presets and exposes the 46 active Vertical colors", () => {
    expect(ROOM_PRESETS).toHaveLength(20);
    expect(ROOM_PRESETS.some((room) => /^Room \d+$/.test(room))).toBe(false);
    expect(VERTICAL_COLORS).toHaveLength(46);
    expect(VERTICAL_COLORS.filter((color) => color.endsWith(": S-Curved"))).toHaveLength(5);
    expect(VERTICAL_COLORS).not.toContain("Cloud Collection: Willow");
    expect(VERTICAL_COLORS.some((color) => /Silver Cloud|Coffee|Onyx/.test(color))).toBe(false);
  });

  it("renders the documented Honeycomb application fields from exact source labels", () => {
    const source = readFileSync(fileURLToPath(new URL("./DesignCard.tsx", import.meta.url)), "utf8");
    expect(source).toContain('application === "Specialty Shapes"');
    expect(source).toContain('application === "Patio Door Vertical"');
    expect(source).toContain("HONEYCOMB_FRAME_APPLICATIONS as readonly string[]");
    expect(source).toContain('field: "json:slope_angle_degrees"');
    expect(source).toContain('field: "json:rear_cell_size"');
    expect(source).toContain('field: "json:honeycomb_actual_cell_size"');
    expect(source).toContain('field: `json:honeycomb_panel_${panelIndex}_net_width`');
    expect(source).toContain('field: `json:honeycomb_panel_${panelIndex}_net_height`');
    expect(source).toContain('field: "json:specialty_left_leg_height"');
    expect(source).toContain('field: "json:specialty_right_leg_height"');
    expect(source).toContain('field: "json:non_operable"');
    expect(source).toContain('field: "json:vertical_left_width_inches"');
    expect(source).toContain('field: "json:vertical_right_width_inches"');
    expect(source).toContain('field: "json:cutout_width_inches"');
    expect(source).toContain('field: "json:vertical_cutout_rail"');
    expect(source).toContain("max: 3");
    expect(HONEYCOMB_FRAME_APPLICATIONS).toEqual([
      "SmartFit with Frame",
      "SmartFit for Sloped Windows with Frame",
    ]);
    expect(HONEYCOMB_FRAME_TYPES).toHaveLength(12);
    expect(HONEYCOMB_SLOPED_FRAME_TYPES).toEqual([
      "Beaded L Frame",
      '2" Belair Z Frame',
      '2" Bullnose Z Frame',
    ]);
    expect(HONEYCOMB_SPECIALTY_SHAPES).toHaveLength(12);
  });

  it("captures an exact width for every coupled or LightGuard 360 component", () => {
    const source = readFileSync(fileURLToPath(new URL("./DesignCard.tsx", import.meta.url)), "utf8");
    expect(source).toContain("roller_component_width_1");
    expect(source).toContain("roller_component_width_2");
    expect(source).toContain("componentIndex <= rollerComponentCount");
    expect(source).toContain('field === "json:coupled_shade_count"');
    expect(source).toContain('field === "json:lightguard_360_shade_count"');
  });

  it("adds Onyx mechanical evidence only to the authoritative V2 card", () => {
    const source = readFileSync(fileURLToPath(new URL("./DesignCard.tsx", import.meta.url)), "utf8");
    expect(source).toContain("getStandardShutterGridOptions(workingDesign, authoritativeV2)");
    expect(source).toContain("if (!authoritativeV2) return options;");
    expect(source).toContain('field: "json:frame_extension_inches"');
    expect(source).toContain('field: "json:available_depth_inches"');
    expect(source).toContain('field: "json:opening_diagonal_difference_inches"');
    expect(source).toContain('field: `json:onyx_panel_${panelIndex}_width_inches`');
    expect(source).toContain('field: `json:onyx_panel_${panelIndex}_height_inches`');
    expect(source).toContain('field: `json:onyx_tilt_section_${sectionIndex}_inches`');
    expect(source).toContain('field: "json:onyx_tilt_section_count"');
    expect(source).toContain('field: "json:onyx_t_post_count"');
    expect(source).toContain('field: `json:onyx_t_post_${tPostIndex}_position_inches`');
  });

  it("distinguishes an explicitly entered zero from a cleared numeric field", () => {
    expect(parseDeferredNumberDraft("0")).toBe(0);
    expect(parseDeferredNumberDraft("0.0")).toBe(0);
    expect(parseDeferredNumberDraft("0.0625")).toBe(0.0625);
    expect(parseDeferredNumberDraft("")).toBeNull();
    expect(parseDeferredNumberDraft("   ")).toBeNull();
    expect(parseDeferredNumberDraft("not-a-number")).toBeUndefined();

    const source = readFileSync(fileURLToPath(new URL("./DesignCard.tsx", import.meta.url)), "utf8");
    expect(source).toContain("const lastCommittedRef = useRef<number | null>");
    expect(source).toContain("onClearRef.current()");
    expect(source).toContain(
      "onClear={authoritativeV2 ? () => handleUpdate(opt.field, null) : undefined}",
    );
  });

  it("uses real quote-line IDs for V2 side-by-side pairing without changing legacy cards", () => {
    const designCardSource = readFileSync(
      fileURLToPath(new URL("./DesignCard.tsx", import.meta.url)),
      "utf8",
    );
    const quoteBuilderSource = readFileSync(
      fileURLToPath(new URL("./QuoteBuilder.tsx", import.meta.url)),
      "utf8",
    );
    expect(designCardSource).toContain("Paired Quote Line");
    expect(designCardSource).toContain("value={option.lineId}");
    expect(designCardSource).toContain("showSideBySidePairSelector =\n    authoritativeV2");
    expect(designCardSource).toContain('field: "json:side_by_side"');
    expect(designCardSource).toContain(
      'productType === "Roman Shades" && romanSideBySideEnabled',
    );
    expect(designCardSource).toContain('? { side_by_side: "Yes" }');
    expect(designCardSource).toContain('? { side_by_side: "No" }');
    expect(designCardSource).toContain("side_by_side_match_line_id: lineItem.id");
    expect(designCardSource).toContain("side_by_side_matches: null");
    expect(quoteBuilderSource).toContain(
      "label: `${candidateRange?.label ?? \"#?\"} • ${candidate.room_name} • ID ${candidate.id}`",
    );
    expect(quoteBuilderSource).toContain(
      "authoritativeV2 && lineItems.length >= QUOTE_LAB_MAX_LINES",
    );
    expect(quoteBuilderSource).not.toContain(
      "isolated && lineItems.length >= QUOTE_LAB_MAX_LINES",
    );
  });
});
