import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  BACK_FABRIC_CODE_DETAIL,
  BACK_FABRIC_COLOR_ID_DETAIL,
  buildAuthoritativeShutterRouteUpdate,
  buildCatalogSelectionPatch,
  buildCleanCatalogSelectionOptions,
  buildDraftShutterDesign,
  buildFauxWoodColorIdentityPatch,
  buildLegacyHoneycombApplicationFrameOptions,
  buildLegacyHoneycombCellSizeFrameOptions,
  buildLegacyQuoteLabCatalogSelectionOptions,
  buildLegacyRollerLiftSystemUpdate,
  buildLegacyRollerTopTreatmentUpdate,
  buildLegacyRomanLiftSystemUpdate,
  buildLegacyShutterRouteUpdate,
  canonicalRollerMotorizationSelections,
  ManufacturerCatalogStampChooser,
  needsShutterRoutePatch,
  parseDeferredNumberDraft,
  reconcileRollerTopTreatmentSelection,
  resetHoneycombFrameOptions,
  shouldApplyAutomaticShutterRoutePatch,
  shutterRoutePatchStateKey,
  usableCatalogProductsForLine,
  withoutBackFabricColorDetails,
} from "./DesignCard";
import {
  HONEYCOMB_FRAME_APPLICATIONS,
  HONEYCOMB_FRAME_TYPES,
  HONEYCOMB_SLOPED_FRAME_TYPES,
  HONEYCOMB_SPECIALTY_SHAPES,
  ROOM_PRESETS,
  VERTICAL_COLORS,
} from "@mts-v1/lib/quoteConstants";
import { getAutoShutterRoutePatch } from "@mts-v1/lib/quoteShutterRouting";
import type { QuoteLabCatalogProduct } from "@/lib/quote-lab/types";
import type { SalesQuoteDesign } from "@mts-v1/types/quote";

function catalogProduct(
  id: string,
  manufacturer: string,
  programs: QuoteLabCatalogProduct["programs"],
  overrides: Partial<QuoteLabCatalogProduct> = {},
): QuoteLabCatalogProduct {
  return {
    id,
    name: `${manufacturer} Roller`,
    productType: "Roller Shades",
    manufacturer,
    system: `${manufacturer} Roller`,
    priceBasis: "dealer_net",
    provisional: false,
    source: "test",
    programs,
    surcharges: [],
    motorizationGroups: [],
    ...overrides,
  };
}

describe("V2 exact-interface contract", () => {
  it("preserves the exact legacy Roller lift and top-treatment update shapes", () => {
    const legacyDesign = {
      motor_type: "Legacy saved motor",
    } as SalesQuoteDesign;
    const legacyOptions = {
      cord_loop_release: "Saved release",
      hub_required: "Yes",
      power_configuration: "Legacy battery",
      tube_class: "All Tubes",
      customer_option: "keep",
    };

    expect(
      buildLegacyRollerLiftSystemUpdate(
        legacyOptions,
        legacyDesign,
        "Cordless",
      ),
    ).toEqual({
      lift_system: "Cordless",
      motor_type: null,
      remote_type: null,
      options_json: {
        cord_loop_release: null,
        hub_required: null,
        power_configuration: null,
        tube_class: "All Tubes",
        customer_option: "keep",
      },
    });

    const motorized = buildLegacyRollerLiftSystemUpdate(
      legacyOptions,
      legacyDesign,
      "Motorized",
    );
    expect(motorized).toEqual({
      lift_system: "Motorized",
      motor_type: "Legacy saved motor",
      remote_type: null,
      options_json: {
        cord_loop_release: null,
        hub_required: "Yes",
        power_configuration: "Legacy battery",
        tube_class: null,
        customer_option: "keep",
      },
    });
    expect(motorized.options_json).not.toHaveProperty("motorization_selections");

    const topTreatment = buildLegacyRollerTopTreatmentUpdate(
      legacyOptions,
      "Square Fascia",
    );
    expect(topTreatment).toEqual({
      valance: "Square Fascia*",
      options_json: {
        ...legacyOptions,
        top_treatment_class: "Square Fascia",
      },
    });
    expect(topTreatment).not.toHaveProperty("lift_system");
    expect(topTreatment).not.toHaveProperty("motor_type");
    expect(topTreatment.options_json).not.toHaveProperty("motorization_selections");
  });

  it("keeps legacy Roman lift cleanup hub-only", () => {
    const update = buildLegacyRomanLiftSystemUpdate(
      {
        chain_type: "Metal",
        chain_color: "Black",
        chain_location: "Left",
        chain_length: "48",
        headrail_size: "Large",
        poles: "1",
        pole_length: "36",
        hub_required: "Yes",
        power_configuration: "Legacy power",
        customer_option: "keep",
      },
      undefined,
      "Cordless",
    );

    expect(update).toEqual({
      lift_system: "Cordless",
      motor_type: null,
      remote_type: null,
      options_json: {
        chain_type: null,
        chain_color: null,
        chain_location: null,
        chain_length: null,
        headrail_size: null,
        poles: "1",
        pole_length: "36",
        hub_required: null,
        power_configuration: "Legacy power",
        customer_option: "keep",
      },
    });
    expect(update.options_json).not.toHaveProperty("motorization_selections");
  });

  it("keeps V2 catalog identity out of legacy catalog and color patches", () => {
    const legacyCatalog = buildLegacyQuoteLabCatalogSelectionOptions(
      { customer_option: "keep" },
      { id: "roller", manufacturer: "Norman" },
      "roller_pg1",
    );
    expect(legacyCatalog).toEqual({
      customer_option: "keep",
      quote_lab_product_id: "roller",
      quote_lab_program_id: "roller_pg1",
      catalog_manufacturer: "Norman",
      catalog_program_id: "roller_pg1",
      surcharges: [],
    });
    expect(legacyCatalog).not.toHaveProperty("catalog_product_id");
    expect(legacyCatalog).not.toHaveProperty("motorization_selections");

    const legacyFaux = buildFauxWoodColorIdentityPatch(
      { color: "Bright White" },
      {
        productId: "smartprivacy_faux",
        programId: "smartprivacy_faux_2in_and_2_1_2in_slats_cordless",
      },
      false,
    );
    expect(legacyFaux).toEqual({
      optionsJson: {
        color: "Bright White",
        product_line: "SmartPrivacy",
      },
      designFields: {},
    });
    expect(legacyFaux.optionsJson).not.toHaveProperty("catalog_product_id");

    const legacyDraft = buildDraftShutterDesign("B", false);
    expect(legacyDraft.options_json).toMatchObject({
      material_type: "Composite",
      composite_subtype: "Woodlore",
    });
    expect(legacyDraft.options_json).not.toHaveProperty("catalog_product_id");
    expect(legacyDraft.options_json).not.toHaveProperty("quote_lab_product_id");
    expect(legacyDraft.options_json).not.toHaveProperty("motorization_selections");

    const v2Draft = buildDraftShutterDesign("B", true);
    expect(v2Draft.options_json).toMatchObject({
      catalog_product_id: "norman_shutters",
      quote_lab_product_id: "norman_shutters",
      catalog_program_id: "woodlore",
      quote_lab_program_id: "woodlore",
    });
  });

  it("keeps legacy Honeycomb frame cleanup identical to the old cascades", () => {
    const sloped = buildLegacyHoneycombApplicationFrameOptions(
      {
        frame_t_post_count: 2,
        frame_t_post_1_location: 24,
        sill_plate: "Yes",
        frame_notch_out: "Yes",
        frame_notch_a_inches: 2,
        honeycomb_panel_2_net_width: 20,
        slope_angle_degrees: 45,
      },
      "SmartFit for Sloped Windows with Frame",
      true,
    );
    expect(sloped).toEqual({
      frame_t_post_count: null,
      frame_t_post_1_location: null,
      frame_t_post_2_location: null,
      frame_t_post_3_location: null,
      sill_plate: "Yes",
      frame_notch_out: "Yes",
      frame_notch_a_inches: 2,
      honeycomb_panel_2_net_width: 20,
      slope_angle_degrees: 45,
    });

    const standardCell = buildLegacyHoneycombCellSizeFrameOptions(
      {
        honeycomb_frame_type: "L Frame",
        honeycomb_actual_cell_size: '3/4" Single Cell',
        frame_qty: "2",
        pre_drilled: "Yes",
        frame_t_post_count: 2,
        frame_t_post_1_location: 24,
        sill_plate: "Yes",
        frame_notch_out: "Yes",
        honeycomb_panel_1_net_width: 20,
        slope_angle_degrees: 45,
      },
      '3/4" Single Cell',
    );
    expect(standardCell).toEqual({
      honeycomb_frame_type: "L Frame",
      honeycomb_actual_cell_size: '3/4" Single Cell',
      frame_qty: null,
      pre_drilled: null,
      frame_t_post_count: null,
      frame_t_post_1_location: null,
      frame_t_post_2_location: null,
      frame_t_post_3_location: null,
      sill_plate: "Yes",
      frame_notch_out: "Yes",
      honeycomb_panel_1_net_width: 20,
      slope_angle_degrees: 45,
    });
  });

  it("gates every new cleanup and Faux Wood identity branch to V2", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./DesignCard.tsx", import.meta.url)),
      "utf8",
    );
    expect(source).toContain(
      'productType === "Sheer Shades" &&\n      authoritativeV2 &&\n      field === "lift_system"',
    );
    expect(source).toContain(
      'productType === "Smart Drapes" &&\n      authoritativeV2 &&\n      field === "json:control_type"',
    );
    expect(source).toContain(
      'productType === "Faux Wood Blinds" &&\n      authoritativeV2 &&\n      field === "json:product_line"',
    );
    expect(source).toContain(
      "buildLegacyRollerLiftSystemUpdate(currentJson, design, value)",
    );
    expect(source).toContain(
      "buildLegacyRomanLiftSystemUpdate(currentJson, design, value)",
    );
    expect(source).toContain(
      "buildLegacyRollerTopTreatmentUpdate(currentJson, topTreatment)",
    );
    expect(source).toContain(
      "buildLegacyQuoteLabCatalogSelectionOptions(\n        options,",
    );
    expect(source).toContain(
      "buildLegacyHoneycombApplicationFrameOptions(\n          nextJson,",
    );
    expect(source).toContain(
      "buildLegacyHoneycombCellSizeFrameOptions(nextJson, nextSize)",
    );
    expect(source).toContain(
      "needsShutterRoutePatch(design, patch, authoritativeV2)",
    );
  });

  it("never auto-routes or clears an existing shutter design in legacy mode", () => {
    const legacyDesign = {
      id: "legacy-design",
      supplier: "Norman",
      material: "Woodlore",
      louver_size: '4 1/2"',
      tilt_type: "Invisible Tilt",
      hinge_color: "White",
      panel_config: "L",
      mount_type: "Inside",
      fabric: "keep-fabric",
      motor_type: "keep-motor",
      remote_type: "keep-remote",
      options_json: { customer_option: "keep-me" },
    } as unknown as SalesQuoteDesign;
    const patch = getAutoShutterRoutePatch("B");

    const matchingLegacyRoute = {
      ...legacyDesign,
      supplier: patch!.supplier,
      material: patch!.material,
      options_json: { ...patch!.options, customer_option: "keep-me" },
    } as SalesQuoteDesign;
    expect(needsShutterRoutePatch(matchingLegacyRoute, patch!)).toBe(false);
    expect(needsShutterRoutePatch(matchingLegacyRoute, patch!, true)).toBe(true);

    expect(
      shouldApplyAutomaticShutterRoutePatch(false, legacyDesign, patch),
    ).toBe(false);
    expect(
      shouldApplyAutomaticShutterRoutePatch(true, legacyDesign, patch),
    ).toBe(true);

    const explicitUpdate = buildLegacyShutterRouteUpdate(
      patch!,
      legacyDesign,
      "louver_size",
      '3 1/2"',
    );
    expect(explicitUpdate).toMatchObject({
      supplier: "Norman",
      material: null,
      louver_size: '3 1/2"',
      options_json: {
        customer_option: "keep-me",
        material_type: "Composite",
        composite_subtype: "Woodlore",
      },
    });
    expect(explicitUpdate).not.toHaveProperty("tilt_type");
    expect(explicitUpdate).not.toHaveProperty("hinge_color");
    expect(explicitUpdate).not.toHaveProperty("panel_config");
    expect(explicitUpdate).not.toHaveProperty("mount_type");
    expect(explicitUpdate).not.toHaveProperty("fabric");
    expect(explicitUpdate).not.toHaveProperty("motor_type");
    expect(explicitUpdate).not.toHaveProperty("remote_type");

    const authoritativeFirstClick = buildAuthoritativeShutterRouteUpdate(
      patch!,
      legacyDesign,
      "louver_size",
      '3 1/2"',
    );
    expect(authoritativeFirstClick).toMatchObject({
      supplier: "Norman",
      material: null,
      louver_size: '3 1/2"',
      tilt_type: null,
      hinge_color: null,
      options_json: {
        quote_lab_product_id: "norman_shutters",
        catalog_product_id: "norman_shutters",
        quote_lab_program_id: "woodlore",
        catalog_program_id: "woodlore",
      },
    });

    const healedDesign = {
      ...legacyDesign,
      supplier: patch!.supplier,
      material: patch!.material,
      options_json: {
        quote_lab_product_id: patch!.productId,
        catalog_product_id: patch!.productId,
        quote_lab_program_id: patch!.programId,
        catalog_program_id: patch!.programId,
        ...patch!.options,
      },
    } as SalesQuoteDesign;
    const missingIdentityOptions = { ...healedDesign.options_json };
    delete missingIdentityOptions.catalog_product_id;
    const missingIdentityDesign = {
      ...healedDesign,
      options_json: missingIdentityOptions,
    };
    expect(shutterRoutePatchStateKey("B", healedDesign, patch!)).not.toBe(
      shutterRoutePatchStateKey("B", missingIdentityDesign, patch!),
    );
  });

  it("keeps lab diagnostics hidden and makes only V2 prices authoritative", () => {
    const source = readFileSync(fileURLToPath(new URL("./DesignCard.tsx", import.meta.url)), "utf8");
    expect(source).toContain("{showLabCatalogControls && !authoritativeV2 && (");
    expect(source).not.toContain("{isolated && (");
    expect(source).toContain("allowManualPriceEditing={!authoritativeV2}");
    expect(source).toContain('aria-label="Authoritative price"');
    expect(source).toContain("if (authoritativeV2) return;");
    expect(source).toContain("Authoritative pricing blocked");
    expect(source).toContain("authoritativeV2 && designs.some");
    expect(source).toContain("{!authoritativeV2 && (\n            <SurchargePicker");
    expect(source).toContain("function SurchargePicker(");
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
    expect(source).toContain(
      "{authoritativeV2 ? (\n                <ManufacturerCatalogStampChooser",
    );
    expect(source).toContain(
      "manufacturerStamp && (\n                  <span",
    );
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

  it("stores one exact source-backed motor identity for a Roller power system", () => {
    expect(canonicalRollerMotorizationSelections("Automate ARC Motor", {
      application: "Single Shade",
      couplingArrangement: null,
      componentCount: null,
    })).toEqual([
      {
        groupId: "automate_home",
        optionId: "motor_rechargeable_battery_pack",
        role: "base_motor",
        units: 1,
      },
    ]);
    expect(canonicalRollerMotorizationSelections("Automate ARC Motor", {
      application: "Independently Operated Coupled Shades",
      couplingArrangement: "Independently Operated",
      componentCount: 2,
    })[0]?.units).toBe(2);
    expect(canonicalRollerMotorizationSelections("Mystery Motor", {
      application: "Single Shade",
      couplingArrangement: null,
      componentCount: null,
    })).toEqual([]);
  });

  it("prunes and rederives the Roller motor BOM when Valance changes the appendix sheet", () => {
    const transition = reconcileRollerTopTreatmentSelection(
      {
        roller_application: "Single Shade",
        top_treatment_class: "No Top Treatment",
        tube_class: '1 3/4" (43mm) Tube',
        power_configuration:
          "Norman Smart Rechargeable Battery with Charging Wand & AC Adapter Charger",
        motorization_selections: [
          {
            groupId: "smart_motorization",
            optionId: "motor",
            role: "base_motor",
            units: 1,
          },
        ],
      },
      "Cassette",
      "Motorized",
    );

    expect(transition).toMatchObject({
      liftSystem: "Motorized",
      motorType: null,
      powerChanged: true,
      optionsJson: {
        top_treatment_class: "Cassette",
        tube_class: '1 3/4" (43mm) Tube',
        power_configuration: null,
        motorization_selections: [],
      },
    });
  });

  it("removes hidden Honeycomb frame fields when the application changes", () => {
    const stale = {
      honeycomb_frame_type: "L Frame",
      honeycomb_actual_cell_size: '3/4" Single Cell',
      frame_qty: "2",
      pre_drilled: "Yes",
      frame_t_post_count: 2,
      frame_t_post_1_location: 20,
      sill_plate: "Yes",
      frame_notch_out: "Yes",
      frame_notch_a_inches: 1,
      slope_angle_degrees: 60,
      honeycomb_panel_1_net_width: 20,
      honeycomb_panel_2_net_width: 20,
    };
    const standard = resetHoneycombFrameOptions(stale, "standard");
    expect(standard.slope_angle_degrees).toBeNull();
    expect(standard.frame_t_post_count).toBe(2);
    const sloped = resetHoneycombFrameOptions(stale, "sloped");
    expect(sloped.frame_t_post_count).toBeNull();
    expect(sloped.sill_plate).toBeNull();
    expect(sloped.honeycomb_panel_2_net_width).toBeNull();
    expect(sloped.honeycomb_panel_1_net_width).toBe(20);
    const none = resetHoneycombFrameOptions(stale, "none");
    expect(none.honeycomb_frame_type).toBeNull();
    expect(none.honeycomb_actual_cell_size).toBeNull();
    expect(none.honeycomb_panel_1_net_width).toBeNull();
  });

  it("drops hidden product pricing identity when switching catalog products", () => {
    const options = buildCleanCatalogSelectionOptions(
      {
        quote_v2_backend: true,
        quote_v2_catalog_as_of: "2026-08-01",
        discount_percent: 10,
        fabric_program_id: "stale-program",
        power_configuration: "stale-power",
        authoritative_price_status: "authoritative",
        authoritative_price_error: "",
        authoritative_price_breakdown: { total: 757.5 },
        authoritative_cost_breakdown: { landedCost: 260 },
        authoritative_once_total: 25,
        authoritative_v2_snapshot: { stale: true },
        priced_selection_fingerprint: "old-selection",
        priced_catalog_version: "old-catalog",
        sent_price_snapshot: { total: 757.5 },
        base_price: 610,
        surcharge_total: 147.5,
      },
      { id: "smartprivacy_faux", manufacturer: "Norman" },
      "smartprivacy_faux_2in_and_2_1_2in_slats_cordless",
    );
    expect(options).toMatchObject({
      quote_v2_backend: true,
      quote_v2_catalog_as_of: "2026-08-01",
      discount_percent: 10,
      quote_lab_product_id: "smartprivacy_faux",
      catalog_product_id: "smartprivacy_faux",
      quote_lab_program_id: "smartprivacy_faux_2in_and_2_1_2in_slats_cordless",
      motorization_selections: [],
    });
    expect(options).not.toHaveProperty("fabric_program_id");
    expect(options).not.toHaveProperty("power_configuration");
    expect(options).not.toHaveProperty("authoritative_price_status");
    expect(options).not.toHaveProperty("authoritative_price_breakdown");
    expect(options).not.toHaveProperty("authoritative_cost_breakdown");
    expect(options).not.toHaveProperty("authoritative_once_total");
    expect(options).not.toHaveProperty("authoritative_v2_snapshot");
    expect(options).not.toHaveProperty("priced_selection_fingerprint");
    expect(options).not.toHaveProperty("priced_catalog_version");
    expect(options).not.toHaveProperty("sent_price_snapshot");
    expect(options).not.toHaveProperty("base_price");
    expect(options).not.toHaveProperty("surcharge_total");
  });

  it("requires an exact program when an alternate catalog product has multiple programs", () => {
    const polar = catalogProduct("polar_interior_roller", "Polar", [
      { id: "group_1", name: "Price Group 1", priceAxis: "wh" },
      { id: "group_2", name: "Price Group 2", priceAxis: "wh" },
    ]);
    const unresolved = buildCatalogSelectionPatch(
      {
        quote_v2_backend: true,
        quote_v2_catalog_version: "test-v2",
        fabric_color_code: "stale-color",
        power_configuration: "stale-power",
      },
      polar,
    );

    expect(unresolved).toMatchObject({
      supplier: "Polar",
      material: null,
      fabric: null,
      lift_system: null,
      motor_type: null,
      unit_price: 0,
      options_json: {
        quote_v2_backend: true,
        quote_v2_catalog_version: "test-v2",
        catalog_product_id: "polar_interior_roller",
        quote_lab_product_id: "polar_interior_roller",
        catalog_program_id: null,
        quote_lab_program_id: null,
        catalog_manufacturer: "Polar",
      },
    });
    expect(unresolved.options_json).not.toHaveProperty("fabric_color_code");
    expect(unresolved.options_json).not.toHaveProperty("power_configuration");

    const exact = buildCatalogSelectionPatch(
      unresolved.options_json as Record<string, unknown>,
      polar,
      "group_2",
    );
    expect(exact).toMatchObject({
      supplier: "Polar",
      material: "Price Group 2",
      options_json: {
        catalog_product_id: "polar_interior_roller",
        quote_lab_product_id: "polar_interior_roller",
        catalog_program_id: "group_2",
        quote_lab_program_id: "group_2",
      },
    });
  });

  it("shows the compact chooser only for V2 categories with multiple usable products", () => {
    const norman = catalogProduct("roller", "Norman", [
      { id: "norman_pg1", name: "Norman PG1", priceAxis: "wh" },
    ]);
    const polar = catalogProduct("polar_interior_roller", "Polar", [
      { id: "polar_pg1", name: "Polar PG1", priceAxis: "wh" },
      { id: "polar_pg2", name: "Polar PG2", priceAxis: "wh" },
    ]);
    const lotus = catalogProduct("lotus_roller_shades", "Lotus", [
      { id: "lotus_custom", name: "Lotus Custom", priceAxis: "width" },
    ]);
    const unavailable = catalogProduct(
      "unavailable_roller",
      "Unavailable",
      [{ id: "none", name: "None", priceAxis: "wh" }],
      { priceBasis: "unavailable" },
    );
    const empty = catalogProduct("empty_roller", "Empty", []);
    const products = [norman, polar, lotus, unavailable, empty];

    expect(
      usableCatalogProductsForLine(products, "Roller Shades").map(
        (product) => product.id,
      ),
    ).toEqual(["roller", "polar_interior_roller", "lotus_roller_shades"]);

    const normanHtml = renderToStaticMarkup(
      createElement(ManufacturerCatalogStampChooser, {
        productType: "Roller Shades",
        design: {
          supplier: "Norman",
          options_json: {
            catalog_product_id: "roller",
            catalog_program_id: "norman_pg1",
          },
        } as unknown as SalesQuoteDesign,
        manufacturerStamp: { label: "Norman", tone: "norman" },
        onUpdateFields: () => undefined,
        catalogProducts: products,
      }),
    );
    expect(normanHtml).toContain('data-catalog-chooser="product"');
    expect(normanHtml).not.toContain('data-testid="manufacturer-program-chooser"');

    const polarHtml = renderToStaticMarkup(
      createElement(ManufacturerCatalogStampChooser, {
        productType: "Roller Shades",
        design: {
          supplier: "Polar",
          options_json: {
            catalog_product_id: "polar_interior_roller",
            catalog_program_id: null,
          },
        } as unknown as SalesQuoteDesign,
        manufacturerStamp: { label: "Polar", tone: "polar" },
        onUpdateFields: () => undefined,
        catalogProducts: products,
      }),
    );
    expect(polarHtml).toContain('data-catalog-chooser="product"');
    expect(polarHtml).toContain('data-testid="manufacturer-program-chooser"');

    const legacyShapeHtml = renderToStaticMarkup(
      createElement(ManufacturerCatalogStampChooser, {
        productType: "Roller Shades",
        design: {
          supplier: "Norman",
          options_json: { catalog_product_id: "roller" },
        } as unknown as SalesQuoteDesign,
        manufacturerStamp: { label: "Norman", tone: "norman" },
        onUpdateFields: () => undefined,
        catalogProducts: [norman],
      }),
    );
    expect(legacyShapeHtml).not.toContain('data-catalog-chooser="product"');
    expect(legacyShapeHtml).toContain('aria-label="Manufacturer: Norman"');
  });

  it("renders a usable manufacturer chooser for a brand-new design with no identity", () => {
    const norman = catalogProduct("roller", "Norman", [
      { id: "norman_pg1", name: "Norman PG1", priceAxis: "wh" },
    ]);
    const polar = catalogProduct("polar_interior_roller", "Polar", [
      { id: "polar_pg1", name: "Polar PG1", priceAxis: "wh" },
      { id: "polar_pg2", name: "Polar PG2", priceAxis: "wh" },
    ]);

    const blankHtml = renderToStaticMarkup(
      createElement(ManufacturerCatalogStampChooser, {
        productType: "Roller Shades",
        design: undefined,
        manufacturerStamp: null,
        onUpdateFields: () => undefined,
        catalogProducts: [norman, polar],
      }),
    );
    expect(blankHtml).toContain('data-catalog-chooser="product"');
    expect(blankHtml).toContain('data-selection-state="empty"');
    expect(blankHtml).toContain('aria-label="Choose manufacturer or product"');
    expect(blankHtml).toContain("Choose");

    const loadingHtml = renderToStaticMarkup(
      createElement(ManufacturerCatalogStampChooser, {
        productType: "Roller Shades",
        design: undefined,
        manufacturerStamp: null,
        onUpdateFields: () => undefined,
      }),
    );
    expect(loadingHtml).toContain('data-catalog-chooser="product"');
    expect(loadingHtml).toContain('data-selection-state="empty"');
    expect(loadingHtml).toContain("disabled");

    const singleProductHtml = renderToStaticMarkup(
      createElement(ManufacturerCatalogStampChooser, {
        productType: "Roller Shades",
        design: undefined,
        manufacturerStamp: null,
        onUpdateFields: () => undefined,
        catalogProducts: [norman],
      }),
    );
    expect(singleProductHtml).toContain('data-catalog-chooser="product"');
    expect(singleProductHtml).toContain('data-selection-state="empty"');

    expect(buildCatalogSelectionPatch({}, polar, "polar_pg2")).toMatchObject({
      supplier: "Polar",
      material: "Polar PG2",
      unit_price: 0,
      options_json: {
        catalog_product_id: "polar_interior_roller",
        quote_lab_product_id: "polar_interior_roller",
        catalog_program_id: "polar_pg2",
        quote_lab_program_id: "polar_pg2",
        catalog_manufacturer: "Polar",
      },
    });
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
