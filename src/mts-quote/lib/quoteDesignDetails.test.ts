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
  it("shows Roller hardware choices while hiding generated motor charge routing", () => {
    const design={...miniBlindDesign(),product_type:"Roller Shades",motor_type:"Automate Home DC Adapter",options_json:{
      roller_hardware_v1:{version:1,installation:"Back / Wall Mount",shimLayers:2,raceway:true},
      motorization_selections:[{groupId:"automate_home",optionId:"power_distribution_panel",role:"accessory",units:1,billingScope:"once_per_line"}],
      roller_power_panel_group:"Panel 1",
    }};
    const details=getQuoteDesignDetails(design);
    expect(details).toContainEqual({label:"Bracket Installation",value:"Back / Wall Mount"});
    expect(details).toContainEqual({label:"Shim Layers per Bracket",value:"2"});
    expect(details).toContainEqual({label:"Raceway",value:"Yes"});
    expect(details.some(d=>/Version:|Group Id|Billing Scope|Hardware V1|Motorization Selections/.test(d.label+" "+d.value))).toBe(false);
    expect(details.some(d=>d.value==="Panel 1")).toBe(true);
  });

  it("renders saved atomic charging and clearance as customer choices without implementation metadata", () => {
    const design = {...miniBlindDesign(), product_type:"Sheer Shades", mount_type:"Outside Mount", options_json:{
      smartfold_charging_v1:{version:1,extraChargingKits:2,extensionCables:3,extensionColor:""},
      smartfold_clearance_v1:{version:1,mountingAreaHeight:.75,mountingSpaceHeight:1.5},
    }};
    const original=JSON.stringify(design);
    const details=getQuoteDesignDetails(design);
    expect(details).toContainEqual({label:"Extra Charging Kits for This Line",value:"2"});
    expect(details).toContainEqual({label:"Extension Cables for This Line",value:"3"});
    expect(details).toContainEqual({label:"Screw Mounting-Area Height (inches)",value:"0.75"});
    expect(details).toContainEqual({label:"Available Shade Mounting-Space Height (inches)",value:"1.5"});
    expect(details.some(d=>/V1|Version:|Extension Cable Color/.test(d.label+" "+d.value))).toBe(false);
    expect(JSON.stringify(design)).toBe(original);
    const inside=getQuoteDesignDetails({...design,mount_type:"Inside Mount"});
    expect(inside.some(d=>/Mounting-Area|Mounting-Space/.test(d.label))).toBe(false);
    expect(design.options_json.smartfold_clearance_v1.mountingAreaHeight).toBe(.75);
  });

  it("omits obsolete Roman banding from customer output after a style change without rewriting the saved record", () => {
    const design = {...miniBlindDesign(), product_type: "Roman Shades", options_json: {
      fold_style: "Soft Fold", roman_banding_layout: "Side Border", banding_color: "White",
    }};
    const details = getQuoteDesignDetails(design);
    expect(details.some(detail => /banding/i.test(detail.label))).toBe(false);
    const banded = getQuoteDesignDetails({...design, options_json: {...design.options_json, fold_style: "Ribbon Banded"}});
    expect(banded.some(detail => detail.value === "Side Border")).toBe(true);
    expect(banded.some(detail => detail.value === "White")).toBe(true);
    expect(design.options_json.roman_banding_layout).toBe("Side Border");
  });

  it("omits a stale motor position after a Roman draft changes to a manual control",()=>{
    const design={...miniBlindDesign(),product_type:"Roman Shades",lift_system:"Cordless",options_json:{quote_v2_backend:true,motor_position:"Right",poles:"Pole with Attachment",roman_pole_total_quantity:1}};
    expect(getQuoteDesignDetails(design).some(d=>d.label==="Motor Position")).toBe(false);
    expect(getQuoteDesignDetails({...design,lift_system:"Motorized"})).toContainEqual({label:"Motor Position",value:"Right"});
    expect(getQuoteDesignDetails(design)).toContainEqual({label:"Total Poles or Attachments for This Line",value:"1"});
    expect(design.options_json.motor_position).toBe("Right");
  });

  it("shows the current PerfectSheer guard without a contradictory legacy default", () => {
    const design = miniBlindDesign();design.product_type="Sheer Shades";
    design.options_json={perfectsheer_light_guard:"Premium Wood Light Guard",perfectsheer_light_guard_color:"049 Stone Gray",light_guard:"none",basic_light_guard:false};
    const details=getQuoteDesignDetails(design);
    expect(details.filter(d=>d.label==="Light Guard")).toEqual([{label:"Light Guard",value:"Premium Wood Light Guard"}]);
  });
  it("hides authoritative pricing metadata while preserving product options", () => {
    const design = miniBlindDesign();
    design.options_json = {
      control_side: "Left", authoritative_once_total: 30.02,
      manual_customer_charge_policy: "blind-shade-install-ship-v1", manual_merchandise_unit_price: 400, customer_charge_policy_version: "v1",
      authoritative_price_status: "authoritative", authoritative_price_error: "Internal pricing diagnostic",
      authoritative_v2_snapshot: { total: 300.02, dealerCost: 70 },
    };
    const details = getQuoteDesignDetails(design);
    expect(details).toContainEqual({ label: "Control Side", value: "Left" });
    expect(details.some((detail) => /authoritative|diagnostic|dealer|Manual Customer|Merchandise Unit|Policy Version/i.test(`${detail.label} ${detail.value}`))).toBe(false);
  });
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
  it("explains Lotus measurement conventions on customer output", () => {
    const design = miniBlindDesign();
    design.supplier = "Lotus";
    for (const [basis, text] of [["inside_opening", "Inside opening; manufacturer deducts ½ inch from width"], ["exact_finished_size", "Exact finished size; no manufacturer deduction"]]) {
      design.options_json = { lotus_measurement_basis: basis };
      expect(getQuoteDesignDetails(design)).toContainEqual({ label: "Measurements", value: text });
      expect(getQuoteDesignDetails(design).some(detail => detail.value === basis)).toBe(false);
    }
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

it("retains Synchrony customer selections without exposing saved engine identifiers", () => {
  const design = miniBlindDesign();
  design.product_type = "Vertical Blinds";
  design.options_json = {
    fabric_color_code: "8078", fabric_color_name: "Pure White", fabric_group: "S-Curved",
    vertical_hardware_color: "Nature", vertical_wand_drop_inches: 49, vertical_shim_layers: 2,
    quote_v2_backend: true, quote_v2_catalog_version: "internal-v1", quote_v2_catalog_as_of: "2026-09-19",
    priced_catalog_version: "internal-v1", priced_selection_fingerprint: "sha256:internal",
    norman_assembly_v1: { sourceId: "internal-source" }, norman_order_record_v1: { version: 1 },
  };
  const details = getQuoteDesignDetails(design);
  expect(details).toEqual(expect.arrayContaining([
    { label: "Fabric Color", value: "8078 - Pure White" },
    { label: "Hardware Color", value: "Nature" },
    { label: "Wand Drop (inches)", value: "49" },
    { label: "Shim Layers per Bracket", value: "2" },
  ]));
  expect(JSON.stringify(details)).not.toMatch(/internal|sha256|Quote V2|Priced|Norman Assembly|Norman Order Record/);
});


it("omits inactive SmartFold motor positions from cordless customer details while preserving saved history", () => {
 const design={...miniBlindDesign(),supplier:"Norman",product_type:"SmartFold Shades",lift_system:"PrecisionLift Cordless",options_json:{quote_v2_backend:true,motor_position:"Right"}} as SalesQuoteDesign;
 expect(getQuoteDesignDetails(design).some(d=>d.label==="Motor Position")).toBe(false);
 expect(getQuoteDesignDetails({...design,lift_system:"Motorized"})).toContainEqual({label:"Motor Position",value:"Right"});
 expect(design.options_json?.motor_position).toBe("Right");
});
