import type { SelectionContext } from "./core";
import { sourceProvenance } from "./source-manifest";

const ONYX_PRICING_SIZE_SOURCE = sourceProvenance(
  "onyx-reference-guide-2020-2021",
  { pages: [4, 9, 13] },
);

/**
 * Total pricing additions for the three inside-mount Z frames documented in
 * the binder's window-size pricing table. These are total dimension additions,
 * not per-edge face widths.
 */
export const ONYX_INSIDE_MOUNT_PRICING_ADDITIONS = Object.freeze({
  "Z Frame Trim": Object.freeze({
    widthAdditionInches: 0.75,
    fourSidedHeightAdditionInches: 0.75,
    threeSidedHeightAdditionInches: 0.375,
  }),
  "Z Frame Fine": Object.freeze({
    widthAdditionInches: 2,
    fourSidedHeightAdditionInches: 2,
    threeSidedHeightAdditionInches: 1,
  }),
  "Z Frame Crown": Object.freeze({
    widthAdditionInches: 4.25,
    fourSidedHeightAdditionInches: 4.25,
    threeSidedHeightAdditionInches: 2.125,
  }),
  "Z Frame Crest": Object.freeze({
    widthAdditionInches: 4.25,
    fourSidedHeightAdditionInches: 4.25,
    threeSidedHeightAdditionInches: 2.125,
  }),
  "Vinyl Z Frame Small": Object.freeze({
    widthAdditionInches: 4,
    fourSidedHeightAdditionInches: 4,
    threeSidedHeightAdditionInches: 2,
  }),
  "Vinyl Z Frame Large": Object.freeze({
    widthAdditionInches: 5,
    fourSidedHeightAdditionInches: 5,
    threeSidedHeightAdditionInches: 2.5,
  }),
} as const);

/**
 * Total pricing additions from the binder's outside-mount window-size table.
 * Width always includes both side edges. Height includes both top and bottom
 * for a four-sided frame and only the top for a three-sided frame.
 */
export const ONYX_OUTSIDE_MOUNT_PRICING_ADDITIONS = Object.freeze({
  "L Frame": Object.freeze({
    widthAdditionInches: 3.5,
    fourSidedHeightAdditionInches: 3.5,
    threeSidedHeightAdditionInches: 1.75,
  }),
  "Decor Frame 2": Object.freeze({
    widthAdditionInches: 5.5,
    fourSidedHeightAdditionInches: 5.5,
    threeSidedHeightAdditionInches: 2.75,
  }),
  "Decor Frame 3": Object.freeze({
    widthAdditionInches: 7.5,
    fourSidedHeightAdditionInches: 7.5,
    threeSidedHeightAdditionInches: 3.75,
  }),
} as const);

const INSIDE_FRAME_ALIASES: Readonly<
  Record<string, keyof typeof ONYX_INSIDE_MOUNT_PRICING_ADDITIONS>
> = {
  "Z Frame Trim": "Z Frame Trim",
  "Z Trim": "Z Frame Trim",
  "Z Frame Fine": "Z Frame Fine",
  "Z Fine": "Z Frame Fine",
  "Z Frame Crown": "Z Frame Crown",
  "Z Crown": "Z Frame Crown",
  "Z Crown FS": "Z Frame Crown",
  "VZ Crown": "Z Frame Crown",
  "VZ Crown FS": "Z Frame Crown",
  "Z Frame Crest": "Z Frame Crest",
  "Z Crest": "Z Frame Crest",
  "Z Crest FS": "Z Frame Crest",
  "VZ Crest": "Z Frame Crest",
  "VZ Crest FS": "Z Frame Crest",
  "Vinyl Z Frame Small": "Vinyl Z Frame Small",
  "VZ Small": "Vinyl Z Frame Small",
  "Vinyl Z Frame Large": "Vinyl Z Frame Large",
  "VZ Large": "Vinyl Z Frame Large",
  "Z Fine FS": "Z Frame Fine",
  "VZ Fine": "Z Frame Fine",
  "VZ Fine FS": "Z Frame Fine",
};

const OUTSIDE_FRAME_ALIASES: Readonly<
  Record<string, keyof typeof ONYX_OUTSIDE_MOUNT_PRICING_ADDITIONS>
> = {
  "L Frame": "L Frame",
  "L Outside": "L Frame",
  "L Outside FS": "L Frame",
  "L Frame Bullnose": "L Frame",
  "L Bullnose Outside": "L Frame",
  "L Bullnose Outside FS": "L Frame",
  "Vinyl L Frame": "L Frame",
  "VL Outside": "L Frame",
  "VL Outside FS": "L Frame",
  "Decor Frame 2": "Decor Frame 2",
  "Decor 2": "Decor Frame 2",
  "Decor 2 FS": "Decor Frame 2",
  "VDecor 2": "Decor Frame 2",
  "Decor Frame 3": "Decor Frame 3",
  "Decor 3": "Decor Frame 3",
  "Decor 3 FS": "Decor Frame 3",
};

export type OnyxInternalPricingSize = Readonly<{
  frameType: string;
  canonicalFrameType: keyof typeof ONYX_INSIDE_MOUNT_PRICING_ADDITIONS | null;
  frameSides: 3 | 4;
  supported: boolean;
  widthAdditionInches: number | null;
  heightAdditionInches: number | null;
  pricingWidthInches: number | null;
  pricingHeightInches: number | null;
  source: typeof ONYX_PRICING_SIZE_SOURCE;
}>;

export type OnyxOutsideMountPricingSize = Readonly<{
  frameType: string;
  canonicalFrameType: keyof typeof ONYX_OUTSIDE_MOUNT_PRICING_ADDITIONS | null;
  frameSides: 3 | 4;
  supported: boolean;
  widthAdditionInches: number | null;
  heightAdditionInches: number | null;
  pricingWidthInches: number | null;
  pricingHeightInches: number | null;
  source: typeof ONYX_PRICING_SIZE_SOURCE;
}>;

export type OnyxWindowSizePricingResolution = Readonly<{
  applicable: boolean;
  mountType: string | null;
  frameType: string | null;
  frameSides: 3 | 4 | null;
  supported: boolean;
  widthAdditionInches: number | null;
  heightAdditionInches: number | null;
  pricingWidthInches: number | null;
  pricingHeightInches: number | null;
  reason:
    | "not_applicable"
    | "missing_frame_sides"
    | "unsupported_mount"
    | "undocumented_frame_or_invalid_opening"
    | null;
  source: typeof ONYX_PRICING_SIZE_SOURCE;
}>;

function validOpening(widthInches: number, heightInches: number): boolean {
  return (
    Number.isFinite(widthInches) &&
    widthInches > 0 &&
    Number.isFinite(heightInches) &&
    heightInches > 0
  );
}

/**
 * Returns the pricing-only footprint for an inside-mount window-size quote.
 * Profile-derived rows retain page 4 provenance; named pricing rows are
 * cross-checked against page 13.
 */
export function onyxInsideMountPricingSize(
  windowWidthInches: number,
  windowHeightInches: number,
  frameType: string | null | undefined,
  frameSides: 3 | 4,
): OnyxInternalPricingSize {
  const exactFrameType = frameType?.trim() ?? "";
  const canonicalFrameType = INSIDE_FRAME_ALIASES[exactFrameType] ?? null;
  if (
    !canonicalFrameType ||
    (frameSides !== 3 && frameSides !== 4) ||
    !validOpening(windowWidthInches, windowHeightInches)
  ) {
    return {
      frameType: exactFrameType,
      canonicalFrameType,
      frameSides,
      supported: false,
      widthAdditionInches: null,
      heightAdditionInches: null,
      pricingWidthInches: null,
      pricingHeightInches: null,
      source: ONYX_PRICING_SIZE_SOURCE,
    };
  }
  const additions = ONYX_INSIDE_MOUNT_PRICING_ADDITIONS[canonicalFrameType];
  const heightAdditionInches =
    frameSides === 4
      ? additions.fourSidedHeightAdditionInches
      : additions.threeSidedHeightAdditionInches;
  return {
    frameType: exactFrameType,
    canonicalFrameType,
    frameSides,
    supported: true,
    widthAdditionInches: additions.widthAdditionInches,
    heightAdditionInches,
    pricingWidthInches: windowWidthInches + additions.widthAdditionInches,
    pricingHeightInches: windowHeightInches + heightAdditionInches,
    source: ONYX_PRICING_SIZE_SOURCE,
  };
}

/**
 * Returns the pricing-only footprint for an outside-mount Onyx shutter quoted
 * from its window opening. Callers must explicitly provide three or four
 * sides; the quote model does not silently decide whether a sill is framed.
 */
export function onyxOutsideMountPricingSize(
  windowWidthInches: number,
  windowHeightInches: number,
  frameType: string | null | undefined,
  frameSides: 3 | 4,
): OnyxOutsideMountPricingSize {
  const exactFrameType = frameType?.trim() ?? "";
  const canonicalFrameType = OUTSIDE_FRAME_ALIASES[exactFrameType] ?? null;
  if (
    !canonicalFrameType ||
    (frameSides !== 3 && frameSides !== 4) ||
    !validOpening(windowWidthInches, windowHeightInches)
  ) {
    return {
      frameType: exactFrameType,
      canonicalFrameType,
      frameSides,
      supported: false,
      widthAdditionInches: null,
      heightAdditionInches: null,
      pricingWidthInches: null,
      pricingHeightInches: null,
      source: ONYX_PRICING_SIZE_SOURCE,
    };
  }
  const additions = ONYX_OUTSIDE_MOUNT_PRICING_ADDITIONS[canonicalFrameType];
  const heightAdditionInches =
    frameSides === 4
      ? additions.fourSidedHeightAdditionInches
      : additions.threeSidedHeightAdditionInches;
  return {
    frameType: exactFrameType,
    canonicalFrameType,
    frameSides,
    supported: true,
    widthAdditionInches: additions.widthAdditionInches,
    heightAdditionInches,
    pricingWidthInches: windowWidthInches + additions.widthAdditionInches,
    pricingHeightInches: windowHeightInches + heightAdditionInches,
    source: ONYX_PRICING_SIZE_SOURCE,
  };
}

function selectionText(context: SelectionContext, key: string): string | null {
  const value = context.configuration[key] ?? context.options[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function selectionFrameSides(context: SelectionContext): 3 | 4 | null {
  const value = context.configuration.frame_sides ?? context.options.frame_sides;
  const numeric = typeof value === "number" ? value : Number(value);
  return numeric === 3 || numeric === 4 ? numeric : null;
}

/**
 * The only engine-facing Onyx window-size resolver. Selection dimensions stay
 * equal to the measured opening; this resolver supplies the internal pricing
 * footprint and its exact binder provenance.
 */
export function resolveOnyxWindowSizePricing(
  context: SelectionContext,
): OnyxWindowSizePricingResolution {
  const measurementBasis = selectionText(context, "measurement_basis");
  if (context.productId !== "onyx_shutters" || measurementBasis !== "window_size") {
    return {
      applicable: false,
      mountType: null,
      frameType: null,
      frameSides: null,
      supported: false,
      widthAdditionInches: null,
      heightAdditionInches: null,
      pricingWidthInches: null,
      pricingHeightInches: null,
      reason: "not_applicable",
      source: ONYX_PRICING_SIZE_SOURCE,
    };
  }

  const mountType = selectionText(context, "mount_type")?.toLowerCase() ?? null;
  const frameType = selectionText(context, "frame_type");
  const frameSides = selectionFrameSides(context);
  if (frameSides === null) {
    return {
      applicable: true,
      mountType,
      frameType,
      frameSides,
      supported: false,
      widthAdditionInches: null,
      heightAdditionInches: null,
      pricingWidthInches: null,
      pricingHeightInches: null,
      reason: "missing_frame_sides",
      source: ONYX_PRICING_SIZE_SOURCE,
    };
  }

  const result =
    mountType === "inside"
      ? onyxInsideMountPricingSize(
          context.widthInches,
          context.heightInches,
          frameType,
          frameSides,
        )
      : mountType === "outside"
        ? onyxOutsideMountPricingSize(
            context.widthInches,
            context.heightInches,
            frameType,
            frameSides,
          )
        : null;

  if (!result) {
    return {
      applicable: true,
      mountType,
      frameType,
      frameSides,
      supported: false,
      widthAdditionInches: null,
      heightAdditionInches: null,
      pricingWidthInches: null,
      pricingHeightInches: null,
      reason: "unsupported_mount",
      source: ONYX_PRICING_SIZE_SOURCE,
    };
  }

  return {
    applicable: true,
    mountType,
    frameType,
    frameSides,
    supported: result.supported,
    widthAdditionInches: result.widthAdditionInches,
    heightAdditionInches: result.heightAdditionInches,
    pricingWidthInches: result.pricingWidthInches,
    pricingHeightInches: result.pricingHeightInches,
    reason: result.supported ? null : "undocumented_frame_or_invalid_opening",
    source: result.source,
  };
}
