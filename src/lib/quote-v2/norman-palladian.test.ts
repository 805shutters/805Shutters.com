import { describe, expect, it } from "vitest";
import type { SelectionContext } from "./core";
import { deriveNormanOrderRecords } from "./norman-assemblies";
import { validateNormanFamilyRules } from "./norman-family-rules";
import { PALLADIAN_FINISHES } from "@/lib/quote/norman-current-assortment";

function line(id: string, productId = "palladian_shelf", config: SelectionContext["configuration"] = {}) {
  const selection: SelectionContext = { manufacturerId: "Norman", productId, programId: productId === "palladian_shelf" ? "palladian_shelf_palladian_shelf_with_product" : "test", catalogAsOf: "2026-09-19", catalogVersion: "test", widthInches: 36, heightInches: 60, quantity: 1, options: {}, configuration: { mount_type: "Inside Mount", color: "Winchester White 2010", shelf_depth: 2.125, shelf_measurement_basis: "Default", shelf_supported_weight_lbs: 20, accompanying_product_id: "roman", accompanying_line_id: "shade", ...config } };
  return { lineId: id, selection };
}
const paired = (config: SelectionContext["configuration"] = {}) => [line("shelf", "palladian_shelf", config), line("shade", "roman")];
const rules = (rows: ReturnType<typeof paired>) => deriveNormanOrderRecords(rows).map(issue => issue.ruleId);

describe("Palladian current dealer guide", () => {
  it("pins all 42 distinct coded finishes including 066", () => {
    expect(PALLADIAN_FINISHES).toHaveLength(42);
    expect(new Set(PALLADIAN_FINISHES.map(f => f.code)).size).toBe(42);
    expect(PALLADIAN_FINISHES.find(f => f.code === "066")?.name).toBe("Winchester White 2010");
    for (const finish of PALLADIAN_FINISHES) expect(validateNormanFamilyRules(line("shelf", "palladian_shelf", {color: finish.name}).selection)).toEqual([]);
  });
  it.each([[6,2,50,true],[5.9375,2,20,false],[96,4,50,true],[96.0625,4,20,false],[36,2.0625,20,false],[36,2.125,50.1,false]])("checks width %s depth %s load %s", (width, depth, load, valid) => {
    const s = line("shelf", "palladian_shelf", {shelf_depth: depth, shelf_supported_weight_lbs: load}).selection;
    s.widthInches = width;
    expect(validateNormanFamilyRules(s).length === 0).toBe(valid);
  });
  it("requires actual load and measurement basis instead of assuming them", () => {
    const issues = validateNormanFamilyRules(line("shelf", "palladian_shelf", {shelf_supported_weight_lbs:null,shelf_measurement_basis:null}).selection);
    expect(issues.map(i=>i.ruleId)).toEqual(expect.arrayContaining(["norman.palladian_shelf.load","norman.palladian_shelf.measurement_basis"]));
  });
  it("derives default deductions and preserves them identically on save/reopen", () => {
    const rows=paired({norman_assembly_v1:{finishedShelfWidth:99}});
    expect(rules(rows)).toEqual([]);
    expect(rows[0].selection.configuration.norman_assembly_v1).toMatchObject({finishedShelfWidth:35.96875,shadeHeightDeduction:"factory_when_ordered_on_same_line",finishCode:"066",shelfQuantity:1});
    const reopened=JSON.parse(JSON.stringify(rows));
    expect(rules(reopened)).toEqual([]);
    expect(reopened).toEqual(rows);
  });
  it("retains custom finished sizes and charges shelf line quantity once", () => {
    const rows=paired({shelf_measurement_basis:"Custom"});rows[1].selection.quantity=2;rows[0].selection.quantity=2;
    expect(rules(rows)).toEqual([]);
    expect(rows[0].selection.configuration.norman_assembly_v1).toMatchObject({finishedShelfWidth:36,shadeHeightDeduction:"none",shelfQuantity:2});
    rows.push(line("extra", "palladian_shelf", {shelf_measurement_basis:"Custom"}));
    expect(rules(rows)).toContain("norman.palladian.quantity");
  });
  it("keeps separately ordered shelf dimensions unchanged without a companion", () => {
    const shelf=line("shelf");shelf.selection.programId="palladian_shelf_palladian_shelf_without_product";
    expect(rules([shelf])).toEqual([]);
    expect(shelf.selection.configuration.norman_assembly_v1).toMatchObject({finishedShelfWidth:36,accompanyingLineId:null,shadeHeightDeduction:"none"});
  });
  it.each(["SmartFit with Frame","SmartFit Dual Shade with Frame","SmartFit for Sloped Windows with Frame","Motorized Skylight"])("rejects paired %s", application=>{
    const rows=[line("shelf","palladian_shelf",{accompanying_product_id:"honeycomb"}),line("shade","honeycomb",{application})];
    expect(rules(rows)).toContain("norman.palladian.honeycomb_application");
  });
  it("keeps specialty shade height measured above the shelf",()=>{
    const rows=[line("shelf","palladian_shelf",{accompanying_product_id:"honeycomb"}),line("shade","honeycomb",{application:"Specialty Shape"})];
    expect(rules(rows)).toEqual([]);
    expect(rows[0].selection.configuration.norman_assembly_v1).toMatchObject({shadeHeightDeduction:"none",shadeHeightOrigin:"top_of_shelf"});
  });
  it("checks selected companion, mount and matching default opening",()=>{
    expect(rules([line("shelf")])).toContain("norman.palladian.accompanying_line_required");
    const rows=paired();rows[1].selection.widthInches=40;rows[1].selection.configuration={...rows[1].selection.configuration,mount_type:"Outside Mount"};
    expect(rules(rows)).toEqual(expect.arrayContaining(["norman.palladian.opening_width","norman.palladian.accompanying_mount"]));
    for(const productId of ["smartdrape","san_clemente_faux_wood","san_clemente_honeycomb","faux_wood","synchrony_vertical"]) {
      expect(rules([line("shelf","palladian_shelf",{accompanying_product_id:productId}),line("shade",productId)])).toContain("norman.palladian.accompanying_line_required");
    }
  });
  it("requires individual common-valance widths totaling strictly below 96",()=>{
    const rows=paired({shelf_measurement_basis:"Custom"});rows[1].selection.configuration={...rows[1].selection.configuration,shade_type:"Common Valance"};
    expect(rules(rows)).toContain("norman.palladian.common_widths");
    rows[1].selection.configuration={...rows[1].selection.configuration,common_valance_panel_widths:[48,48]};
    expect(rules(rows)).toContain("norman.palladian.common_width");
    rows[1].selection.configuration={...rows[1].selection.configuration,common_valance_panel_widths:[48,47.9375]};
    expect(rules(rows)).toEqual([]);
  });
  it("does not rewrite pre-revision saved assemblies",()=>{
    const rows=paired();rows.forEach(row=>row.selection.catalogAsOf="2026-09-18");
    deriveNormanOrderRecords(rows);
    expect(rows[0].selection.configuration.norman_assembly_v1).toBeUndefined();
  });
});
