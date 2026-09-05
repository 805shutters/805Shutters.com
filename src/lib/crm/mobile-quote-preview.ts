import type { SalesQuoteDesign, SalesQuoteLineItem } from "@mts/types/quote";
import { CrmAuthError } from "@/lib/crm/auth";
import { parseSalesQuoteV2StructureBody } from "@/lib/crm/sales-quote-v2-structure";

type Json = Record<string, unknown>;

const PREVIEW_LINE_FIELDS = [
  "id", "room_name", "product_type", "width_whole", "width_fraction",
  "height_whole", "height_fraction", "quantity", "sort_order",
] as const;
const PREVIEW_DESIGN_FIELDS = [
  "id", "line_item_id", "variant", "product_type", "supplier", "material",
  "louver_size", "tilt_type", "hinge_color", "panel_config", "mount_type",
  "shade_type", "lift_system", "valance", "fabric", "motor_type", "remote_type",
  "hard_surface_install", "ladder_over_15ft", "requires_takedown", "notes", "options_json",
] as const;

function record(value: unknown, label: string): Json {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CrmAuthError(400, `${label} must be an object.`);
  }
  return value as Json;
}

function assertKeys(value: Json, allowed: readonly string[], label: string) {
  const accepted = new Set(allowed);
  const unexpected = Object.keys(value).filter((key) => !accepted.has(key));
  if (unexpected.length) throw new CrmAuthError(400, `${label} rejected field: ${unexpected[0]}.`);
}

export function parseMobileQuotePreview(value: unknown): Readonly<{
  lines: readonly SalesQuoteLineItem[];
  designs: readonly SalesQuoteDesign[];
}> {
  const body = record(value, "Mobile quote preview");
  assertKeys(body, ["lines"], "Mobile quote preview");
  if (!Array.isArray(body.lines) || body.lines.length < 1 || body.lines.length > 40) {
    throw new CrmAuthError(400, "Mobile quote preview requires 1-40 lines.");
  }
  const lineIds = new Set<string>();
  const designIds = new Set<string>();
  const operations = body.lines.flatMap((entry, index) => {
    const row = record(entry, `lines[${index}]`);
    assertKeys(row, ["line", "design"], `lines[${index}]`);
    const line = record(row.line, `lines[${index}].line`);
    const design = record(row.design, `lines[${index}].design`);
    assertKeys(line, PREVIEW_LINE_FIELDS, `lines[${index}].line`);
    assertKeys(design, PREVIEW_DESIGN_FIELDS, `lines[${index}].design`);
    if (typeof line.id !== "string" || lineIds.has(line.id)) {
      throw new CrmAuthError(400, "Preview line IDs must be unique UUIDs.");
    }
    if (typeof design.id !== "string" || designIds.has(design.id)) {
      throw new CrmAuthError(400, "Preview design IDs must be unique UUIDs.");
    }
    if (design.line_item_id !== line.id) {
      throw new CrmAuthError(400, `lines[${index}].design must belong to its line.`);
    }
    if (design.variant !== "A") {
      throw new CrmAuthError(400, `lines[${index}].design.variant must be A.`);
    }
    lineIds.add(line.id);
    designIds.add(design.id);
    return [
      {
        type: "line.create",
        lineItemId: line.id,
        patch: {
          roomName: line.room_name,
          productType: line.product_type,
          widthWhole: line.width_whole,
          widthFraction: line.width_fraction,
          heightWhole: line.height_whole,
          heightFraction: line.height_fraction,
          quantity: line.quantity,
          sortOrder: line.sort_order,
        },
      },
      {
        type: "design.upsert",
        lineItemId: line.id,
        designId: design.id,
        variant: "A",
        selectDesign: true,
        patch: {
          productType: design.product_type,
          supplier: design.supplier,
          material: design.material,
          louverSize: design.louver_size,
          tiltType: design.tilt_type,
          hingeColor: design.hinge_color,
          panelConfig: design.panel_config,
          mountType: design.mount_type,
          shadeType: design.shade_type,
          liftSystem: design.lift_system,
          valance: design.valance,
          fabric: design.fabric,
          motorType: design.motor_type,
          remoteType: design.remote_type,
          hardSurfaceInstall: design.hard_surface_install,
          ladderOver15ft: design.ladder_over_15ft,
          requiresTakedown: design.requires_takedown,
          notes: design.notes,
          optionsJson: design.options_json,
        },
      },
    ];
  });
  const parsed = parseSalesQuoteV2StructureBody({
    expectedRevision: 1,
    idempotencyKey: "mobile-preview-validation",
    operations,
  });
  const lines: SalesQuoteLineItem[] = [];
  const designs: SalesQuoteDesign[] = [];
  for (let index = 0; index < parsed.operations.length; index += 2) {
    const lineOperation = parsed.operations[index];
    const designOperation = parsed.operations[index + 1];
    if (
      lineOperation.type !== "line.create" ||
      !lineOperation.lineItemId ||
      designOperation.type !== "design.upsert" ||
      !designOperation.designId
    ) {
      throw new CrmAuthError(400, "Mobile quote preview line structure is invalid.");
    }
    const linePatch = lineOperation.patch;
    const designPatch = designOperation.patch;
    lines.push({
      id: lineOperation.lineItemId,
      quote_id: "00000000-0000-4000-8000-000000000000",
      room_name: String(linePatch.roomName),
      product_type: String(linePatch.productType),
      width_whole: Number(linePatch.widthWhole),
      width_fraction: String(linePatch.widthFraction),
      height_whole: Number(linePatch.heightWhole),
      height_fraction: String(linePatch.heightFraction),
      quantity: Number(linePatch.quantity),
      sort_order: Number(linePatch.sortOrder),
      selected_design_id: designOperation.designId,
      created_at: new Date(0).toISOString(),
    });
    designs.push({
      id: designOperation.designId,
      line_item_id: lineOperation.lineItemId,
      variant: "A",
      product_type: designPatch.productType as string | null,
      supplier: designPatch.supplier as string | null,
      material: designPatch.material as string | null,
      louver_size: designPatch.louverSize as string | null,
      tilt_type: designPatch.tiltType as string | null,
      hinge_color: designPatch.hingeColor as string | null,
      panel_config: designPatch.panelConfig as string | null,
      mount_type: designPatch.mountType as string | null,
      shade_type: designPatch.shadeType as string | null,
      lift_system: designPatch.liftSystem as string | null,
      valance: designPatch.valance as string | null,
      fabric: designPatch.fabric as string | null,
      motor_type: designPatch.motorType as string | null,
      remote_type: designPatch.remoteType as string | null,
      hard_surface_install: Boolean(designPatch.hardSurfaceInstall),
      ladder_over_15ft: Boolean(designPatch.ladderOver15ft),
      requires_takedown: Boolean(designPatch.requiresTakedown),
      notes: designPatch.notes as string | null,
      unit_price: 0,
      options_json: { ...(designPatch.optionsJson as Json), quote_v2_backend: true },
      created_at: new Date(0).toISOString(),
    });
  }
  return { lines, designs };
}
