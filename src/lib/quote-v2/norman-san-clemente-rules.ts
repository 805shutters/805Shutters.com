import { isSanClementeProduct, SAN_CLEMENTE_HONEYCOMB, SAN_CLEMENTE_SOURCE_ID, sanClementeColors } from "@/lib/quote/norman-san-clemente";
import type { SelectionContext, ValidationIssue } from "./core";
import { sourceProvenance } from "./source-manifest";

/** Ordered measurements; only the guide's standard inside deduction is applied. */
export function validateSanClemente(context: SelectionContext): ValidationIssue[] {
  if (!isSanClementeProduct(context.productId)) return [];
  const c = context.configuration;
  const text = (key: string) => String(c[key] ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const issues: ValidationIssue[] = [];
  const add = (rule: string, page: number, explanation: string) => issues.push({
    severity: "hard_block", ruleId: `norman.${context.productId}.${rule}`,
    source: sourceProvenance(SAN_CLEMENTE_SOURCE_ID, { page }), selectedValues: { ...c, width: context.widthInches, height: context.heightInches }, explanation,
  });
  const honeycomb = context.productId === SAN_CLEMENTE_HONEYCOMB;
  const inside = ["inside", "inside_mount", "semi_inside_mount"].includes(text("mount_type"));
  if (!inside && !["outside", "outside_mount"].includes(text("mount_type"))) add("mount", honeycomb ? 5 : 10, "Select inside or outside mount.");
  const w = context.widthInches - (inside ? .375 : 0), h = context.heightInches;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < (honeycomb ? 12 : 20) || w > 72 || h < (honeycomb ? 42 : 24) || h > (honeycomb ? 96 : 84)) add("dimensions", honeycomb ? 5 : 10, honeycomb ? "San Clemente honeycomb requires net width 12–72 inches and height 42–96 inches." : "San Clemente faux wood requires net width 20–72 inches and height 24–84 inches.");
  const color = sanClementeColors.find(row => row.productId === context.productId && row.colorCode === String(c.fabric_color_code ?? "").trim().toUpperCase());
  if (!color || color.programId !== context.programId || (c.fabric_color_id && c.fabric_color_id !== color.id)) add("color_program", honeycomb ? 7 : 12, "Select a current San Clemente color and its matching program. Portrait/Ultimate fabric identities and pricing do not apply.");
  if (text("application") && text("application") !== "standard") add("application", honeycomb ? 5 : 10, "San Clemente supports single standard shades or blinds; specialty and common-headrail applications are not documented.");
  if (c.motor_type || c.remote_type || (Array.isArray(c.motorization_selections) && c.motorization_selections.length)) add("motorization", honeycomb ? 4 : 9, "San Clemente is cordless only; motorization is not offered in this guide.");
  if (honeycomb) {
    if (!["cordless", "cordless_td_bu", "cordless_tdbu"].includes(text("lift_system"))) add("control", 4, "Choose Cordless or Cordless TDBU.");
    if (!["9_16_single", "9_16"].includes(text("cell_size"))) add("cell", 4, "San Clemente uses 9/16-inch single cell only.");
    if (h >= 90 && w < 20) add("tall_width", 5, "Honeycomb heights of 90 inches or more require at least 20 inches net width.");
    const minimumDepth = text("san_clemente_mount_fit") === "flush" ? 1.9375 : 1.375;
    if (inside && (!["flush", "semi_inside"].includes(text("san_clemente_mount_fit")) || !Number.isFinite(Number(c.mount_depth_inches)) || Number(c.mount_depth_inches) < minimumDepth)) add("mount_depth", 6, "Inside mount needs 1⅜ inches depth for semi-inside or 1 15/16 inches for flush mount.");
    for (const key of ["san_clemente_pole_36_quantity", "san_clemente_pole_60_quantity", "san_clemente_attachment_quantity"]) {
      const qty = Number(c[key] ?? 0);
      if (!Number.isInteger(qty) || qty < 0 || qty > 2) add(key, 8, "Each optional pole/attachment quantity must be a whole number from zero to two per shade.");
    }
    if (Number(c.san_clemente_pole_36_quantity ?? 0) + Number(c.san_clemente_pole_60_quantity ?? 0) > 2) add("pole_total", 8, "A shade can have at most two poles with attachments in total.");
  } else {
    if (text("lift_system") !== "cordless" || text("control_side") !== "left") add("control", 11, "San Clemente faux wood has cordless lift and a fixed left wand; custom wand sizes are unavailable.");
    if (text("slat_size") !== "2") add("slat", 9, "San Clemente faux wood has 2-inch slats only.");
    if (text("valance") !== "standard") add("valance", 13, "The standard valance is included; other valance styles are not offered in this guide.");
    const method = text("installation_method");
    if (!["top_back", "side_only", "side_with_top_support"].includes(method)) add("installation", 10, "Choose top/back, side-only or side with top support brackets.");
    if (method.startsWith("side") && !inside) add("side_mount", 12, "Side brackets are for inside mount only.");
    if (method === "side_only" && w > 37) add("side_width", 10, "Above 37 inches net width, side mount requires top support brackets.");
    if (inside && text("san_clemente_mount_fit") === "flush" && (method !== "side_only" || !Number.isFinite(Number(c.mount_depth_inches)) || Number(c.mount_depth_inches) < 3.4375)) add("flush_depth", 12, "The documented flush side mount requires net width up to 37 inches and depth of 3 7/16 inches.");
    if (inside && !["flush", "semi_inside"].includes(text("san_clemente_mount_fit"))) add("mount_fit", 12, "Select flush side mount or semi-inside mount.");
  }
  return issues;
}
