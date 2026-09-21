import { emptyValanceOnly, ULTIMATE_VALANCE } from "@/lib/quote/norman-valance-only";
import { emptyRollerValance } from "@/lib/quote/norman-roller-valance-only";
import { emptyReplacementRequest } from "@/lib/quote/norman-smartdrape-replacement";
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


describe("structured purchase summaries", () => {
  const detail = (options_json: Record<string, unknown>) => getQuoteDesignDetails({...miniBlindDesign(), options_json});

  it("resolves an exact Lotus part to its item and SKU without guessing unknown identities", () => {
    const options = {catalog_product_id:"lotus_dealer_listed_parts", lotus_observed_offering_id:"lotus_observed_78a1368bffb88b6fca36"};
    const rows = detail(options);
    expect(rows).toContainEqual({label:"SKU", value:"FCVCLIP0036"});
    expect(rows).toContainEqual({label:"Item", value:"1-3/4 Inch Crown Valance Clip for 2 Inch Faux Wood"});
    expect(detail({...options, lotus_observed_offering_id:"unknown"}).some(row => ["Item","SKU"].includes(row.label))).toBe(false);
    expect(detail({...options, catalog_product_id:"roller"}).some(row => row.label === "SKU")).toBe(false);
  });

  it("describes Roman cuts and pillow covers in their sold units, without exposing the record", () => {
    expect(detail({norman_roman_ancillary_v1:{version:1,kind:"yardage",colorCode:"F1085",yards:3}})).toEqual(expect.arrayContaining([
      {label:"Fabric Cut",value:"3 yards per cut"},
      {label:"Ancillary Fabric",value:"Sheer Elegance — F1085 - Dim Ecru"},
    ]));
    const rows = detail({norman_roman_ancillary_v1:{version:1,kind:"pillow_cover",colorCode:"",size:"14x14",edge:"piping",pattern:"standard"}});
    expect(rows).toContainEqual({label:"Pillow Cover",value:"14 × 14 inches; insert not included"});
    expect(rows).toContainEqual({label:"Pillow Edge",value:"Piping"});
    expect(rows.some(row => /V1|Version:/.test(row.label + row.value))).toBe(false);
  });

  it("retains purchased valance appearance and size while excluding fabrication layout", () => {
    const saved = {...emptyValanceOnly(ULTIMATE_VALANCE),style:"3-inch Crown",innerLengthInches:60,returns:"Both" as const,joinery:"Keystone" as const,keystoneCount:1,keystoneLocations:[30]};
    const original = JSON.stringify(saved);
    const rows = detail({norman_valance_only_v1:saved});
    expect(rows).toContainEqual({label:"Valance Length",value:"60 inches inner length"});
    expect(rows).toContainEqual({label:"Valance Returns",value:"Both"});
    expect(rows).toContainEqual({label:"Valance Keystones",value:"1 per valance"});
    expect(rows.some(row => /Locations|Layout|Source Color/.test(row.label + row.value))).toBe(false);
    expect(JSON.stringify(saved)).toBe(original);
    expect(detail({norman_roller_valance_choice_v1:{...emptyRollerValance(),style:"4.5-inch Square Fascia",width:70,fasciaColor:"Black",endCapColor:"Black",associatedLineIds:["private-line"]}})).toEqual(expect.arrayContaining([
      {label:"Valance Style",value:"4.5-inch Square Fascia"},{label:"Valance Width",value:"70 inches"},{label:"Fascia Color",value:"Black"},
    ]));
  });

  it("describes six-vane replacement packs without work-order or factory metadata", () => {
    const request = {...emptyReplacementRequest(),style:"B" as const,firstColor:"F1124",vaneLengthInches:80,originalWorkOrder:"private-wo"};
    const rows = detail({smartdrape_replacement_request_v1:request});
    expect(rows).toContainEqual({label:"Vane Pack",value:"Style B; 6 vanes per pack"});
    expect(rows).toContainEqual({label:"Vane Length",value:"80 inches"});
    expect(rows).toContainEqual({label:"Vane Colors",value:"Single Color: F1124 - Plain White"});
    expect(JSON.stringify(rows)).not.toContain("private-wo");
    expect(detail({smartdrape_replacement_request_v1:{...request,firstColor:"unknown"}}).some(row => row.label === "Vane Colors")).toBe(false);
  });

  it("resolves supported Onyx options to commercial labels and omits malformed or unknown fields", () => {
    const rows = detail({onyx_baseline_options_v1:{version:1,profileId:"onyx-baseline-91828",selections:{cassette:"Square",cassetteColor:"Black",fabricWrappedBottom:true,cordColor:"invented",private_id:"hidden"}}});
    expect(rows).toContainEqual({label:"Cassette",value:"Square"});
    expect(rows).toContainEqual({label:"Cassette color",value:"Black"});
    expect(rows).toContainEqual({label:"Fabric-wrapped bottom rail",value:"Yes"});
    expect(JSON.stringify(rows)).not.toMatch(/invented|hidden|91828/);
    expect(detail({onyx_baseline_options_v1:{version:1,profileId:"unknown",selections:{cassette:"Square"}}}).some(row => row.label === "Cassette")).toBe(false);
  });

  it("resolves woven liner and edge bindings only within the selected program", () => {
    const options = {catalog_program_id:"onyx_woven_wp_walden_premier_wp_walden_premier",onyx_woven_liner_id:"WPL_Black-OutBeige",onyx_woven_binding_id:"WPE_NarrowWhite"};
    expect(detail(options)).toEqual(expect.arrayContaining([{label:"Liner",value:"Black-Out Beige"},{label:"Edge Binding",value:"Narrow White"}]));
    expect(detail({...options,catalog_program_id:"unknown"}).some(row => row.label === "Liner")).toBe(false);
  });

  it("retains exact motor accessory quantities and counts a shared panel or hub only on its owning line", () => {
    const options = {
      motorization_selections:[
        {groupId:"automate_home",optionId:"power_distribution_panel",role:"accessory",units:1,billingScope:"once_per_line"},
        {groupId:"automate_home",optionId:"dc_connection_harness",role:"accessory",units:2},
        {groupId:"automate_home",optionId:"invented",role:"accessory",units:1},
      ],
      norman_order_record_v1:{version:1,family:"automate_home",chargePanel:true,ownerLineId:"line-1",panelId:"private-panel"},
      norman_assembly_v1:{sharedHub:{version:1,family:"automate_home",valid:true,chargeHub:true,ownerLineId:"line-1",fulfillmentQuantity:1,hubId:"private-hub"}},
    };
    const rows = detail(options).filter(row => row.label === "Motorization Accessory");
    expect(rows).toEqual([
      {label:"Motorization Accessory",value:"Power Distribution Panel × 1 for this line"},
      {label:"Motorization Accessory",value:"DC Connection Harness × 2 per quoted unit"},
      {label:"Motorization Accessory",value:"Hub × 1 for this line"},
    ]);
    const sibling = {...options,motorization_selections:[],norman_order_record_v1:{...options.norman_order_record_v1,chargePanel:false},norman_assembly_v1:{sharedHub:{...options.norman_assembly_v1.sharedHub,chargeHub:false,fulfillmentQuantity:0}}};
    expect(detail(sibling).some(row => row.label === "Motorization Accessory")).toBe(false);
  });

  it("retains panel sizes without raw panel identities or track channel routing", () => {
    const rows = detail({sundance_europanel_layout_v1:{version:1,productId:"sundance_europanels",fabricId:"private-fabric",openingWidth:80,openingHeight:70,notes:"",panels:[{id:"private-panel",width:22,height:70,channel:3}]}});
    expect(rows).toContainEqual({label:"Panel 1",value:"22 × 70 inches"});
    expect(JSON.stringify(rows)).not.toMatch(/private|channel/);
  });

  it("does not recursively publish unsupported objects, but preserves ordinary historical primitive choices", () => {
    const options = {unrecognized_record:{source:"private-source",lineId:"private-line"},unrecognized_list:[{id:"private-id"}],custom_note:"Customer-selected trim",custom_choice:true,selected_finishes:["White","Oak"]};
    const original = JSON.stringify(options);
    const rows = detail(options);
    expect(JSON.stringify(rows)).not.toContain("private");
    expect(rows).toContainEqual({label:"Custom Note",value:"Customer-selected trim"});
    expect(rows).toContainEqual({label:"Custom Choice",value:"Yes"});
    expect(rows).toContainEqual({label:"Selected Finishes",value:"White, Oak"});
    expect(JSON.stringify(options)).toBe(original);
  });
});


it("preserves the paid Onyx cord choice and shutter application", () => {
  const rows = getQuoteDesignDetails({...miniBlindDesign(),options_json:{
    onyx_order_type:"Bypass",onyx_baseline_options_v1:{version:1,profileId:"onyx-baseline-91833",selections:{cordLength:"Custom"}},
  }});
  expect(rows).toContainEqual({label:"Cord Choice",value:"Custom"});
  expect(rows).toContainEqual({label:"Shutter Type",value:"Bypass"});
});

it.each(["Net component size","Opening size — factory deduction required"])("describes a purchased vertical component without %s", sizeBasis => {
  const rows = getQuoteDesignDetails({...miniBlindDesign(),options_json:{sundance_vertical_component_v1:{version:1,kind:"Vanes only",fabricId:"private-fabric",sizeBasis,lengthInches:60,quantity:12}}});
  expect(rows).toContainEqual({label:"Vertical component",value:"Vanes only: 12 × 60 inches"});
  expect(JSON.stringify(rows)).not.toMatch(/factory|Net component|private-fabric/);
});
