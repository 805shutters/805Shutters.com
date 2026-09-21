import { parseNormanPanelRecord, NORMAN_SHUTTER_PANEL_RECORD } from '../quote/norman-shutter-panels';
import { normanShutterColor, normanShutterLouvers, normanShutterProgram, normanShutterHinges, normanShutterTilts, normanShutterFrame, normanShutterMounts, NORMAN_SHUTTER_FRAME_SOURCE } from "@/lib/quote/norman-shutter-assortment";
import type { SelectionContext, ValidationIssue } from "./core";
import { sourceProvenance } from "./source-manifest";
import { NORMAN_STILE_PROFILES, NORMAN_PANEL_CLOSURES, normanStileWidths, normanStileJoins, normanRegularPanelCount, normanConstructionPages, normanRegularPanelMaxWidth } from "@/lib/quote/norman-shutter-construction";

export function validateNormanShutterAssortment(s: SelectionContext): ValidationIssue[] {
  if (s.productId !== "norman_shutters" || s.catalogAsOf < "2026-09-19") return [];
  const p = normanShutterProgram(s.programId);
  if (!p) return []; // Unknown program is rejected by the engine's catalog validation.
  const issues: ValidationIssue[] = [];
  const add = (id: string, explanation: string, pages: readonly number[] = p.pages) => issues.push({ severity: "hard_block", ruleId: `norman.shutter.assortment.${id}`, source: sourceProvenance(p.sourceId, { pages }), selectedValues: { programId: s.programId, color: s.configuration.color ?? null, louver_size: s.configuration.louver_size ?? null }, explanation });
  const c = s.configuration;
  const panelRecord = s.catalogAsOf >= '2026-09-20' ? parseNormanPanelRecord(c[NORMAN_SHUTTER_PANEL_RECORD]) : null;
  const application = panelRecord?.application;
  const noSpecialtyHinges = application === 'specialty' && panelRecord?.specialty?.hinges === false;
  const bifold180 = application === 'bifold_180';
  const bypass = application === 'bypass_closed' || application === 'bypass_open';
  const specialty = application === 'specialty';
  const dedicatedTrack = bifold180 || bypass || specialty;
  const color = normanShutterColor(p.id, s.configuration.color ?? s.configuration.fabric_color_code);
  if (!color) add("color", "Choose a documented finish for the selected Norman shutter program.");
  if (color && s.configuration.fabric_color_code && normanShutterColor(p.id, s.configuration.fabric_color_code)?.code !== color.code) add("color_identity", "The saved finish code and displayed finish do not agree. Reselect the Norman finish.");
  if (!normanShutterLouvers(p.id).includes(String(s.configuration.louver_size) as never)) add("louver", p.id === "woodlore_aquashield" ? "Woodlore Plus with AquaShield does not offer 1⅞-inch louvers. Choose 2½, 3, 3½ or 4½ inches." : "Choose a documented Norman louver size.");
  const hardwarePages = p.id === "woodlore" ? [39] : p.id.startsWith("woodlore_") ? [46] : [40];
  if (!noSpecialtyHinges && s.configuration.hinge_color && !normanShutterHinges(p.id, normanShutterFrame(p.id, s.configuration.frame_type)?.label ?? s.configuration.frame_type).includes(String(s.configuration.hinge_color))) add("hinge", p.id === "woodlore_aquashield" ? "AquaShield requires stainless-steel hinges." : "This hinge finish is unavailable for the selected Norman frame or direct-mount hinge.", hardwarePages);
  if (s.configuration.tilt_type && !normanShutterTilts(p.id).includes(String(s.configuration.tilt_type))) add("tilt", p.id === "woodlore_aquashield" ? "AquaShield does not offer standard or offset tilt rods. Choose Invisible Tilt." : "Choose a documented Norman tilt system.", p.id.startsWith("woodlore_") ? [40, 41] : p.pages);
  if (!dedicatedTrack && s.configuration.frame_type && !normanShutterFrame(p.id, s.configuration.frame_type)) issues.push({
    severity: "hard_block", ruleId: "norman.shutter.assortment.frame",
    source: sourceProvenance(NORMAN_SHUTTER_FRAME_SOURCE),
    selectedValues: { programId: p.id, frame_type: s.configuration.frame_type },
    explanation: "This frame is not offered for the selected Norman shutter program. Reselect a compatible frame.",
  });
  const mount = String(s.configuration.mount_type ?? "");
  const mountLabel = /inside|^im$|^i$/i.test(mount) ? "Inside Mount" : /outside|^om$|^o$/i.test(mount) ? "Outside Mount" : null;
  if (!dedicatedTrack && mountLabel && !normanShutterMounts(p.id, s.configuration.frame_type).includes(mountLabel)) add("frame_mount", "The selected Norman frame does not offer this mount type. Reselect the frame or mount.", p.id === "woodlore" ? [16,17,18,19,20] : p.id.startsWith("woodlore_") ? [20,21,22,23,24] : p.id === "brightwood" ? [17,18,19,20,21] : [18,19,20,21,22]);
  const constructionPages = normanConstructionPages(p.id);
  const mixedBifold = ["LLR", "LRR"].includes(String(c.panel_config ?? "").replace(/\s+/g, "").toUpperCase());
  if (!dedicatedTrack && mixedBifold && Number(c.widest_panel_width_inches) > normanRegularPanelMaxWidth(p.id, c.louver_size, "LL")) add("mixed_panel_width", "This mixed hinged/bifold layout needs individual finished panel widths to verify the narrower bifold limit.", p.id.startsWith("woodlore_") ? [38] : [32]);
  if (!dedicatedTrack && c.widest_panel_width_inches != null && c.widest_panel_width_inches !== "" && (!Number.isFinite(Number(c.widest_panel_width_inches)) || Number(c.widest_panel_width_inches) < 6 || Number(c.widest_panel_width_inches) > normanRegularPanelMaxWidth(p.id, c.louver_size, c.panel_config))) add("panel_width", "Finished panel width is outside the documented limit for this program, louver and regular panel layout.", p.id.startsWith("woodlore_") ? [38] : [32]);
  if (!dedicatedTrack && (c.stile_width || c.stile_join || c.panel_closure) && normanRegularPanelCount(c.panel_config) === null) add("construction_layout", "Stile and panel-closure rules for this T-post or specialized layout still require manufacturer verification.", constructionPages);
  if (!dedicatedTrack && c.stile_profile && !NORMAN_STILE_PROFILES.includes(String(c.stile_profile) as never)) add("stile_profile", "Choose Beaded or Chamfer stile profile.", constructionPages);
  if (!bypass && !specialty && c.stile_width && !normanStileWidths(p.id, c.widest_panel_width_inches, application).includes(String(c.stile_width))) add("stile_width", p.id === "woodlore_aquashield" ? "AquaShield requires 2-inch stiles." : "1⅝-inch stiles require finished panel widths of 12 inches or less; otherwise choose 2 or 2¼ inches.", constructionPages);
  if (!bypass && !specialty && c.stile_join && !normanStileJoins(c.panel_config, c.widest_panel_width_inches, application).includes(String(c.stile_join))) add("stile_join", "The selected stile join is incompatible with this regular panel configuration and finished panel width.", constructionPages);
  if (!dedicatedTrack && c.stile_join && normanRegularPanelCount(c.panel_config) === 1 && !(Number(c.widest_panel_width_inches) >= 9)) add("single_panel_join", "Single panels below 9 inches require the exact finished panel width and hang-strip placement to verify the stile join.", constructionPages);
  if (!dedicatedTrack && c.panel_closure && (!NORMAN_PANEL_CLOSURES.includes(String(c.panel_closure) as never) || normanRegularPanelCount(c.panel_config) === 1)) add("panel_closure", "Panel closure is available only for a compatible multi-panel configuration.", constructionPages);
  // Premium finishes remain selectable, with an explicit unresolved price exception.
  if (color?.premium) add("premium_price", "This Normandy premium finish is documented, but its current account surcharge has not been verified.");
  return issues;
}
