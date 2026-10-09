import { NORMAN_SHUTTER_APPLICATIONS, NORMAN_SHUTTER_PANEL_RECORD, parseNormanPanelRecord } from "@/lib/quote/norman-shutter-panels";
import { NORMAN_SPECIALTY_SHAPES } from "@/lib/quote/norman-shutter-specialty";
import { NORMAN_SHUTTER_PROGRAMS, normanShutterFrame } from "@/lib/quote/norman-shutter-assortment";
import { FRENCH_DOOR_SKETCH_TYPES } from "@/lib/quote/specialty-shutter-illustrations";
import { formatInches } from "@/lib/quote/measurements";

/** Purchased shutter choices only; never serialize the factory panel worksheet. */
export function customerShutterDetails(options: Record<string, unknown>): Array<{ label: string; value: string }> {
  const record = parseNormanPanelRecord(options[NORMAN_SHUTTER_PANEL_RECORD]);
  if (!record) return [];
  const details: Array<{ label: string; value: string }> = [];
  const add = (label: string, value: string | undefined) => { if (value) details.push({ label, value }); };
  const frame = (value: string) => NORMAN_SHUTTER_PROGRAMS
    .map(program => normanShutterFrame(program.id, value)).find(Boolean)?.label;
  const layout = (value: string) => { if (/^[LRF]+(?:\/[LRF]+)*$/.test(value)) add("Panel configuration", value); };
  add("Shutter type", NORMAN_SHUTTER_APPLICATIONS.find(([id]) => id === record.application)?.[1]);
  if (record.motor === "perfect_tilt_g4") add("Motor", "Motorized tilt");
  if (record.motor === "other") add("Motor", "Other motorization");
  if (record.panels.some(panel => panel.divider === "present")) add("Divider rail", "Yes");
  const specifiedRails = record.panels.flatMap((panel, panelIndex) => {
    if (panel.divider !== "present" || !panel.dividerDetails) return [];
    const divider = panel.dividerDetails;
    const basis = { window: "window", max_frame: "max frame", panel: "panel", "": "" }[divider.measurementBasis];
    return divider.rails.flatMap((rail, railIndex) => {
      if (rail.location !== "specified") return [];
      const location = rail.centerInches == null ? "measurement not recorded" : `${formatInches(rail.centerInches)} to rail center`;
      return [`Panel ${panelIndex + 1}, rail ${railIndex + 1}: ${location}${basis ? ` (${basis} measurement)` : ""}${rail.exactLocation ? " — exact location" : ""}`];
    });
  });
  if (record.panels.some(panel => panel.dividerDetails && (["equal", "custom"].includes(panel.dividerDetails.splitTiltMode ?? '') || panel.dividerDetails.splitTiltCentersInches.length > 0))) add("Split tilt", "Yes");
  if (specifiedRails.length) add("Divider rail location", specifiedRails.join("; "));

  if (record.application === "specialty" && record.specialty) {
    const specialty = record.specialty;
    add("Specialty shape", NORMAN_SPECIALTY_SHAPES.find(([code]) => code === specialty.shapeCode)?.[1]);
    add("Arch style", { standard: "Standard", continuous: "Continuous" }[specialty.archStyle as "standard" | "continuous"]);
    add("Frame", frame(specialty.frameType));
    if (specialty.curvedTilt?.control === "rear_standard") add("Curved section tilt", "Rear standard tilt");
    if (specialty.curvedTilt?.control === "invisible") add("Curved section tilt", "Hidden tilt");
    if (specialty.curvedTilt?.topLouverFixed === true) add("Top louver", "Fixed");
  }
  if (record.application === "french_door" && record.frenchDoor) {
    const door = record.frenchDoor;
    add("Top shape", { rectangular: "Rectangular", arch: "Arch", quarter_arch: "Quarter arch" }[door.topShape as "rectangular" | "arch" | "quarter_arch"]);
    add("Frame", frame(door.lFrameCode));
    if (door.cutoutType) add("French-door cutout type", FRENCH_DOOR_SKETCH_TYPES.find(([, label]) => label.startsWith(`Type ${door.cutoutType}`))?.[1]);
    if (door.handleSide) add("Handle side", door.handleSide === "left" ? "Left" : "Right");
    if (door.topShape === "quarter_arch" && door.quarterArchSide) add("Quarter arch side", door.quarterArchSide === "left" ? "Left" : "Right");
    layout(door.panelDirection);
  }
  if (record.application === "double_hung" && record.doubleHung) layout(record.doubleHung.rowLayout);
  if (record.application === "bifold_180" && record.bifold180) {
    layout(record.bifold180.layout);
    const fascia = record.bifold180.construction?.fascia;
    if (fascia) add("Fascia", fascia === "deco" ? "Decorative" : "Plain");
  }
  if (record.application === "bifold_other" && record.bifold90) {
    const bifold = record.bifold90;
    add("Track system", { standard_90: "Bi-fold 90", multifold_90: "Multi-fold 90", floating_90: "Floating Bi-fold 90", frame_hinged: "Frame-hinged Bi-fold" }[bifold.kind as "standard_90" | "multifold_90" | "floating_90" | "frame_hinged"]);
    layout(bifold.layout);
    if (bifold.fascia) add("Fascia", bifold.fascia === "deco" ? "Decorative" : "Plain");
    if (bifold.kind === "frame_hinged" && bifold.frameHinged?.frame) add("Frame", bifold.frameHinged.frame);
  }
  if (["bypass_closed", "bypass_open"].includes(record.application) && record.bypass) {
    if (record.bypass.layout === "two_single_side_open") add("Panel configuration", "Two single panels, side opening");
    if (record.bypass.frontPanel) add("Front panel", record.bypass.frontPanel === "left" ? "Left" : "Right");
  }
  return details;
}
