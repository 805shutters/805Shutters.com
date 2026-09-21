import { describe, expect, it } from "vitest";
import { customerShutterDetails } from "./customer-shutter-details";
import { NORMAN_SHUTTER_PANEL_RECORD, type NormanShutterPanelRecord } from "@/lib/quote/norman-shutter-panels";
import { emptyNormanSpecialtyRecord } from "@/lib/quote/norman-shutter-specialty";
import { emptyNormanSpecialtyGeometry } from "@/lib/quote/norman-shutter-specialty-geometry";
import { emptyNormanBifold90 } from "@/lib/quote/norman-shutter-bifold90";
import { emptyNormanBypassRecord } from "@/lib/quote/norman-shutter-bypass";

const base = (): NormanShutterPanelRecord => ({ version: 1, application: "regular", motor: "none", existingDoorGlassOrSidelight: false, panels: [{ heightInches: 75, widthInches: 25, divider: "none" }] });
const project = (record: NormanShutterPanelRecord) => customerShutterDetails({ [NORMAN_SHUTTER_PANEL_RECORD]: record });

describe("customer shutter details", () => {
  it("preserves the purchased specialty shape, frame and control without source geometry or mutation", () => {
    const record: NormanShutterPanelRecord = { ...base(), application: "specialty", motor: "perfect_tilt_g4", specialty: {
      ...emptyNormanSpecialtyRecord(), shapeCode: "YS05", archStyle: "continuous", frameType: "Direct Mount (No Frame)",
      geometry: { ...emptyNormanSpecialtyGeometry(), widthInches: 42, heightInches: 81, templateReference: "private-template.pdf" },
      curvedTilt: { version: 1, control: "rear_standard", topLouverFixed: true },
    } };
    const original = structuredClone(record);
    expect(project(record)).toEqual([
      { label: "Shutter type", value: "Specialty Shape" }, { label: "Motor", value: "Motorized tilt" },
      { label: "Specialty shape", value: "Louvered Arch" }, { label: "Arch style", value: "Continuous" },
      { label: "Frame", value: "Direct Mount (No Frame)" }, { label: "Curved section tilt", value: "Rear standard tilt" },
    ]);
    expect(record).toEqual(original);
  });
  it.each(["standard_90", "multifold_90", "floating_90", "frame_hinged"] as const)("retains the %s purchased track choice", kind => {
    const details = project({ ...base(), application: "bifold_other", bifold90: { ...emptyNormanBifold90(), kind, layout: "LLRR", referenceWidthInches: 90 } });
    expect(details).toContainEqual({ label: "Panel configuration", value: "LLRR" });
    expect(details.some(detail => detail.label === "Track system")).toBe(true);
    expect(JSON.stringify(details)).not.toMatch(/reference|90 inches|support|template/i);
  });
  it.each(["bypass_open", "bypass_closed"] as const)("retains %s and its panel arrangement", application => {
    const details = project({ ...base(), application, bypass: { ...emptyNormanBypassRecord(), layout: "two_single_side_open", frontPanel: "left", windowWidthInches: 88 } });
    expect(details).toContainEqual({ label: "Shutter type", value: application === "bypass_open" ? "Open Bypass" : "Closed Bypass" });
    expect(details).toContainEqual({ label: "Front panel", value: "Left" });
    expect(JSON.stringify(details)).not.toContain("88");
  });
  it("keeps French-door shape and cutout without its measurement form", () => {
    const details = project({ ...base(), application: "french_door", frenchDoor: {
      version: 1, panelDirection: "R", cutoutType: "B", topShape: "quarter_arch", lFrameCode: "",
      measurementFormReference: "private-door-form.pdf",
    } });
    expect(details).toEqual([
      { label: "Shutter type", value: "French Door" }, { label: "Top shape", value: "Quarter arch" },
      { label: "French-door cutout", value: "Yes" }, { label: "Panel configuration", value: "R" },
    ]);
  });
  it("keeps Bi-fold 180 and Double Hung layouts without their construction references", () => {
    expect(project({ ...base(), application: "bifold_180", bifold180: { version: 1, layout: "LLRR", flatMountingSurface: true } }))
      .toEqual([{ label: "Shutter type", value: "Bi-fold 180" }, { label: "Panel configuration", value: "LLRR" }]);
    expect(project({ ...base(), application: "double_hung", doubleHung: {
      version: 1, rowLayout: "LR", divisionMode: "custom", customDivisionPointInches: 39,
      customReference: "private-division-plan", horizontalTPost: true, tPostSectionLengthsInches: [24],
    } })).toEqual([{ label: "Shutter type", value: "Double Hung" }, { label: "Panel configuration", value: "LR" }]);
  });
  it("does not expose stale inactive specialty records, unknown shapes or arbitrary nested data", () => {
    expect(project({ ...base(), specialty: { ...emptyNormanSpecialtyRecord(), shapeCode: "private-unrecognized-value" } })).toEqual([{ label: "Shutter type", value: "Regular" }]);
    expect(customerShutterDetails({ [NORMAN_SHUTTER_PANEL_RECORD]: { source: "internal", version: 2 } })).toEqual([]);
    expect(customerShutterDetails({})).toEqual([]);
  });
});
