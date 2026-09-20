import { normanShutterFrame, normanShutterProgram } from "@/lib/quote/norman-shutter-assortment";
import { resolveShutterFramePricing } from "@/lib/quote/shutter-frame-pricing";
import type { SelectionContext } from "./core";
import { sourceProvenance } from "./source-manifest";
const NORMAN_SHUTTER_FRAME_SOURCE = sourceProvenance(
  "norman-shutter-frame-pricing-2026-05",
  { pages: [1, 2, 3] },
);

export type NormanShutterWindowSizePricingResolution = Readonly<{
  applicable: boolean;
  supported: boolean;
  frameType: string | null;
  frameSides: 2 | 3 | 4 | null;
  mountType: "inside" | "outside" | null;
  perSidePricingAdditionInches: number | null;
  widthAdditionInches: number | null;
  heightAdditionInches: number | null;
  pricingWidthInches: number | null;
  pricingHeightInches: number | null;
  reason:
    | "not_applicable"
    | "invalid_dimensions"
    | "missing_frame"
    | "missing_frame_sides"
    | "mount_frame_mismatch"
    | "unsupported_frame"
    | null;
  source: typeof NORMAN_SHUTTER_FRAME_SOURCE;
}>;

function selectionText(context: SelectionContext, key: string): string | null {
  const value = context.configuration[key] ?? context.options[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function selectionFrameSides(context: SelectionContext): 2 | 3 | 4 | null {
  const value = context.configuration.frame_sides ?? context.options.frame_sides;
  const numeric = typeof value === "number" ? value : Number(value);
  return numeric === 3 || numeric === 4 || (numeric === 2 && context.catalogAsOf >= "2026-09-19") ? numeric : null;
}

function selectionMount(context: SelectionContext): "inside" | "outside" | null {
  const mount = selectionText(context, "mount_type")?.toLowerCase() ?? "";
  if (mount === "inside" || mount === "im" || mount.includes("inside")) return "inside";
  if (mount === "outside" || mount === "om" || mount.includes("outside")) return "outside";
  return null;
}

export function resolveNormanShutterWindowSizePricing(
  context: SelectionContext,
): NormanShutterWindowSizePricingResolution {
  const measurementBasis = selectionText(context, "measurement_basis");
  if (context.productId !== "norman_shutters" || measurementBasis !== "window_size") {
    return {
      applicable: false,
      supported: false,
      frameType: null,
      frameSides: null,
      mountType: null,
      perSidePricingAdditionInches: null,
      widthAdditionInches: null,
      heightAdditionInches: null,
      pricingWidthInches: null,
      pricingHeightInches: null,
      reason: "not_applicable",
      source: NORMAN_SHUTTER_FRAME_SOURCE,
    };
  }

  const selectedFrame = selectionText(context, "frame_type");
  const currentProgram = context.catalogAsOf >= "2026-09-19" ? normanShutterProgram(context.programId) : undefined;
  const frameType = currentProgram ? normanShutterFrame(currentProgram.id, selectedFrame)?.label ?? selectedFrame : selectedFrame;
  const source = currentProgram ? sourceProvenance(currentProgram.sourceId, { pages: currentProgram.id === "woodlore" ? [106,107,108] : currentProgram.id.startsWith("woodlore_") ? [140,141,142,143] : currentProgram.id === "brightwood" ? [138,139,140] : [148,149,150,151,152] }) : NORMAN_SHUTTER_FRAME_SOURCE;
  const frameSides = selectionFrameSides(context);
  const resolution = resolveShutterFramePricing({
    manufacturer: "Norman",
    widthInches: context.widthInches,
    heightInches: context.heightInches,
    measurementBasis: "window_size",
    mountType: selectionMount(context),
    frameType,
    frameSides,
  });

  return {
    applicable: true,
    supported: resolution.supported,
    frameType,
    frameSides,
    mountType: resolution.mountType,
    perSidePricingAdditionInches: resolution.perSidePricingAdditionInches,
    widthAdditionInches: resolution.widthAdditionInches,
    heightAdditionInches: resolution.heightAdditionInches,
    pricingWidthInches: resolution.pricingWidthInches,
    pricingHeightInches: resolution.pricingHeightInches,
    reason: resolution.reason,
    source,
  };
}
