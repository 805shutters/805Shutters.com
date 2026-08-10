import { describe, expect, it } from "vitest";
import { getQuoteDesignDetails } from "./quoteDesignDetails";
import type { SalesQuoteDesign } from "@mts/types/quote";

function miniBlindDesign(): SalesQuoteDesign {
  return {
    id: "design-1",
    line_item_id: "line-1",
    variant: "A",
    product_type: "Mini Blinds",
    supplier: "Norman",
    material: "CityLights Cordless Aluminum Blinds",
    louver_size: null,
    tilt_type: null,
    hinge_color: null,
    panel_config: null,
    mount_type: "Inside Mount",
    shade_type: null,
    lift_system: null,
    valance: null,
    fabric: null,
    motor_type: null,
    remote_type: null,
    hard_surface_install: false,
    ladder_over_15ft: false,
    requires_takedown: false,
    unit_price: 273,
    notes: null,
    options_json: {
      fabric_color_code: "7024",
      fabric_color_name: "Pure White",
      slat_size: '1"',
    },
    created_at: "",
  };
}

describe("getQuoteDesignDetails", () => {
  it("labels CityLights mini-blind colors as colors on customer output", () => {
    const details = getQuoteDesignDetails(miniBlindDesign());

    expect(details).toContainEqual({ label: "Color", value: "7024 - Pure White" });
    expect(details).toContainEqual({ label: "Slat Size", value: '1"' });
  });

  it("shows user-selected Lotus fields without generated catalog metadata", () => {
    const design = miniBlindDesign();
    design.product_type = "Faux Wood Blinds";
    design.supplier = "Lotus";
    design.material = null;
    design.options_json = {
      color: "Bright White",
      lotus_finish: "Smooth",
      lotus_blind_count: 1,
      catalog_product_id: "lotus_faux_wood_blinds",
      lotus_program_code: "FLX",
      catalog_product_type: "Faux Wood Blinds",
      quote_lab_program_id: "lotus_flx_2in_bright_white_custom",
      slat_size: '2"',
      product_line: "FLX",
      lotus_source_page: 99,
      catalog_program_id: "lotus_flx_2in_bright_white_custom",
      catalog_manufacturer: "Lotus",
      quote_lab_product_id: "lotus_faux_wood_blinds",
      lotus_configuration_version: "lotus-faux-v2",
    };

    expect(getQuoteDesignDetails(design)).toEqual([
      { label: "Supplier", value: "Lotus" },
      { label: "Mount Type", value: "Inside Mount" },
      { label: "Color", value: "Bright White" },
      { label: "Lotus Finish", value: "Smooth" },
      { label: "Slat Size", value: '2"' },
      { label: "Product Line", value: "FLX" },
    ]);
  });

  it("filters generated catalog metadata for every manufacturer", () => {
    const design = miniBlindDesign();
    design.material = null;
    design.options_json = {
      control_side: "Left",
      catalog_product_id: "roller",
      quote_lab_program_id: "program-1",
      norman_source_page: 42,
      onyx_program_code: "ONYX",
      polar_configuration_version: "v2",
      lotus_blind_count: 1,
    };

    expect(getQuoteDesignDetails(design)).toEqual([
      { label: "Supplier", value: "Norman" },
      { label: "Mount Type", value: "Inside Mount" },
      { label: "Control Side", value: "Left" },
    ]);
  });

  it("keeps only selected Onyx builder values and removes internal mirror metadata", () => {
    const design = miniBlindDesign();
    design.product_type = "Shutters";
    design.supplier = "Onyx";
    design.material = "Poly Composite";
    design.louver_size = '3 1/2"';
    design.tilt_type = "H2 - Hidden Tiltrod Notch On Louver";
    design.hinge_color = "Match";
    design.panel_config = "LR";
    design.mount_type = null;
    design.options_json = {
      color: "100_ Pure White",
      frame_type: "VZ Fine FS",
      onyx_mount: "IM",
      frame_sides: 4,
      catalog_product_id: "onyx_shutters",
      catalog_manufacturer: "Onyx",
      catalog_product_type: "Shutters",
      quote_lab_product_id: "onyx_shutters",
      onyx_program_code: "H2",
      requires_specialty_review: false,
    };

    expect(getQuoteDesignDetails(design)).toEqual([
      { label: "Supplier", value: "Onyx" },
      { label: "Material", value: "Poly Composite" },
      { label: "Louver Size", value: '3 1/2"' },
      { label: "Tilt Type", value: "H2 - Hidden Tiltrod Notch On Louver" },
      { label: "Hinge Color", value: "Match" },
      { label: "Panel Config", value: "LR" },
      { label: "Color", value: "100_ Pure White" },
      { label: "Frame Type", value: "VZ Fine FS" },
      { label: "Onyx Mount", value: "IM" },
      { label: "Frame Sides", value: "4" },
    ]);
  });
});
