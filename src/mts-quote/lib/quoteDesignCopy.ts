import type { SalesQuoteDesign, SalesQuoteLineItem } from "@mts/types/quote";

export const COPY_EXCLUDED_LINE_ITEM_FIELDS = [
  "room_name",
  "width_whole",
  "width_fraction",
  "height_whole",
  "height_fraction",
] as const;

export function buildCopiedLineItemPatch(sourceItem: SalesQuoteLineItem) {
  return {
    product_type: sourceItem.product_type,
  };
}

export function buildCopiedDesignRows(sourceDesigns: SalesQuoteDesign[], targetLineItemId: string) {
  return sourceDesigns.map((sd) => ({
    line_item_id: targetLineItemId,
    variant: sd.variant,
    product_type: sd.product_type,
    supplier: sd.supplier,
    material: sd.material,
    louver_size: sd.louver_size,
    tilt_type: sd.tilt_type,
    hinge_color: sd.hinge_color,
    panel_config: sd.panel_config,
    mount_type: sd.mount_type,
    shade_type: sd.shade_type,
    lift_system: sd.lift_system,
    valance: sd.valance,
    fabric: sd.fabric,
    motor_type: sd.motor_type,
    remote_type: sd.remote_type,
    hard_surface_install: sd.hard_surface_install,
    ladder_over_15ft: sd.ladder_over_15ft,
    requires_takedown: sd.requires_takedown,
    unit_price: sd.unit_price,
    notes: sd.notes,
    options_json: sd.options_json,
  }));
}
