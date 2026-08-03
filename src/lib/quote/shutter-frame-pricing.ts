export type ShutterFrameManufacturer = "Norman" | "Onyx";
export type ShutterMeasurementBasis = "window_size" | "frame_to_frame";
export type ShutterMountType = "inside" | "outside";
export type ShutterFrameSides = 3 | 4;
export type ShutterFramePricingInput = {
  manufacturer: ShutterFrameManufacturer;
  widthInches: number;
  heightInches: number;
  measurementBasis: ShutterMeasurementBasis;
  mountType?: ShutterMountType | null;
  frameType?: string | null;
  frameSides?: ShutterFrameSides | null;
};

export type ShutterFramePricingResolution = {
  supported: boolean;
  manufacturer: ShutterFrameManufacturer;
  measurementBasis: ShutterMeasurementBasis;
  mountType: ShutterMountType | null;
  frameType: string | null;
  canonicalFrameType: string | null;
  frameSides: ShutterFrameSides | null;
  perSidePricingAdditionInches: number | null;
  widthAdditionInches: number | null;
  heightAdditionInches: number | null;
  pricingWidthInches: number | null;
  pricingHeightInches: number | null;
  reason:
    | "invalid_dimensions"
    | "missing_frame"
    | "missing_frame_sides"
    | "mount_frame_mismatch"
    | "unsupported_frame"
    | null;
  source: {
    sourceId: string;
    pages: readonly number[];
  };
};

type FrameDefinition = {
  canonicalFrameType: string;
  perSidePricingAdditionInches: number;
  mounts: readonly ShutterMountType[];
  aliases: readonly string[];
};

const NORMAN_SOURCE = Object.freeze({
  sourceId: "norman-shutter-frame-pricing-2026-05",
  pages: Object.freeze([1, 2, 3]),
});

const ONYX_SOURCE = Object.freeze({
  sourceId: "onyx-reference-guide-2020-2021",
  pages: Object.freeze([4, 9, 13]),
});

const NORMAN_FRAMES: readonly FrameDefinition[] = [
  frame('2" Camber Deco Frame', 2, ["outside"], ["2 camber deco", "camber deco"]),
  frame('2" Classic Deco Frame', 2, ["outside"], ["2 classic deco", "classic deco"]),
  frame('3" Ridge Deco Frame', 3, ["outside"], ["3 ridge deco", "ridge deco"]),
  frame('2 1/2" Mission Deco Frame', 2.5, ["outside"], [
    "2 1/2 mission deco",
    "2.5 mission deco",
    "mission deco",
  ]),
  frame('3" Crown Z Frame', 2.25, ["inside"], ["3 crown z", "crown z"]),
  frame('2" Bel Air Z Frame', 1.25, ["inside"], [
    "2 bel air z",
    "2 belair z",
    "bel air z",
    "belair z",
  ]),
  frame('2" Bullnose Z Frame', 1.25, ["inside"], ["2 bullnose z"]),
  frame('1 1/2" Bullnose Z Frame', 1, ["inside"], [
    "1 1/2 bullnose z",
    "1.5 bullnose z",
  ]),
  frame('1 1/2" Deep Bullnose Z Frame', 1, ["inside"], [
    "1 1/2 deep bullnose z",
    "1.5 deep bullnose z",
  ]),
  frame('1 1/4" Beaded Z Frame', 1, ["inside"], [
    "1 1/4 beaded z",
    "1.25 beaded z",
  ]),
  frame("Tilt Out Z Frame", 1, ["inside"], ["tilt out z", "bullnose tilt out z"]),
  frame("Colonial L Frame", 1.125, ["outside"], ["colonial l"]),
  frame("L Frame", 1.5, ["outside"], [
    "beaded l",
    "vintage l",
    "plain l",
    "deep plain l",
  ]),
  frame("Vintage Hang Strip", 1.5, ["outside"], [
    "vintage hang strip",
    "7/8 vintage hang strip",
  ]),
  frame("Traditional Hang Strip", 1.5, ["outside"], [
    "traditional hang strip",
    "7/8 traditional hang strip",
  ]),
  frame("Direct Mount (No Frame)", 0, ["inside", "outside"], [
    "direct mount",
    "no frame",
    "panel only",
  ]),
];

const ONYX_FRAMES: readonly FrameDefinition[] = [
  frame("L Frame Series", 1.75, ["outside"], [
    "l frame",
    "l outside",
    "l frame bullnose",
    "l bullnose outside",
    "vinyl l frame",
    "vl outside",
  ]),
  frame("Decor Frame 2", 2.75, ["outside"], [
    "decor frame 2",
    "decor 2",
    "vdecor 2",
  ]),
  frame("Decor Frame 3", 3.75, ["outside"], ["decor frame 3", "decor 3"]),
  frame("Z Frame Trim", 0.375, ["inside"], ["z frame trim", "z trim"]),
  frame("Z Frame Fine", 1, ["inside"], [
    "z frame fine",
    "z fine",
    "vz fine",
  ]),
  frame("Z Frame Crown", 2.125, ["inside"], [
    "z frame crown",
    "z crown",
    "vz crown",
  ]),
  frame("Z Frame Crest", 2.125, ["inside"], [
    "z frame crest",
    "z crest",
    "vz crest",
  ]),
  frame("Vinyl Z Frame Small", 2, ["inside"], [
    "vinyl z frame small",
    "vz small",
  ]),
  frame("Vinyl Z Frame Large", 2.5, ["inside"], [
    "vinyl z frame large",
    "vz large",
  ]),
  frame("Panel Only", 0, ["inside", "outside"], ["panel only", "no frame"]),
];

function frame(
  canonicalFrameType: string,
  perSidePricingAdditionInches: number,
  mounts: readonly ShutterMountType[],
  aliases: readonly string[],
): FrameDefinition {
  return {
    canonicalFrameType,
    perSidePricingAdditionInches,
    mounts,
    aliases,
  };
}

function normalizeFrame(value: string): string {
  return value
    .toLowerCase()
    .replace(/\bfs\b/g, "")
    .replace(/[®™]/g, "")
    .replace(/["']/g, "")
    .replace(/\bframe\b/g, "")
    .replace(/\bwith\b.*$/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9./]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findFrame(
  definitions: readonly FrameDefinition[],
  frameType: string,
): FrameDefinition | null {
  const normalized = normalizeFrame(frameType);
  return (
    definitions.find((definition) =>
      [definition.canonicalFrameType, ...definition.aliases].some(
        (alias) => normalizeFrame(alias) === normalized,
      ),
    ) ?? null
  );
}

function baseResolution(
  input: ShutterFramePricingInput,
): Omit<ShutterFramePricingResolution, "supported" | "reason"> {
  return {
    manufacturer: input.manufacturer,
    measurementBasis: input.measurementBasis,
    mountType: input.mountType ?? null,
    frameType: input.frameType?.trim() || null,
    canonicalFrameType: null,
    frameSides: input.frameSides ?? null,
    perSidePricingAdditionInches: null,
    widthAdditionInches: null,
    heightAdditionInches: null,
    pricingWidthInches: null,
    pricingHeightInches: null,
    source: input.manufacturer === "Norman" ? NORMAN_SOURCE : ONYX_SOURCE,
  };
}

/**
 * Converts the measured opening to the manufacturer's pricing footprint.
 * Frame-to-frame measurements are already complete and are never expanded.
 */
export function resolveShutterFramePricing(
  input: ShutterFramePricingInput,
): ShutterFramePricingResolution {
  const base = baseResolution(input);
  if (
    !Number.isFinite(input.widthInches) ||
    input.widthInches <= 0 ||
    !Number.isFinite(input.heightInches) ||
    input.heightInches <= 0
  ) {
    return { ...base, supported: false, reason: "invalid_dimensions" };
  }

  if (input.measurementBasis === "frame_to_frame") {
    return {
      ...base,
      supported: true,
      perSidePricingAdditionInches: 0,
      widthAdditionInches: 0,
      heightAdditionInches: 0,
      pricingWidthInches: input.widthInches,
      pricingHeightInches: input.heightInches,
      reason: null,
    };
  }

  if (!base.frameType) {
    return { ...base, supported: false, reason: "missing_frame" };
  }
  if (base.frameSides !== 3 && base.frameSides !== 4) {
    return { ...base, supported: false, reason: "missing_frame_sides" };
  }

  const definitions = input.manufacturer === "Norman" ? NORMAN_FRAMES : ONYX_FRAMES;
  const definition = findFrame(definitions, base.frameType);
  if (!definition) {
    return { ...base, supported: false, reason: "unsupported_frame" };
  }

  const mountType =
    input.mountType ??
    (definition.mounts.length === 1 ? definition.mounts[0] : null);
  if (!mountType || !definition.mounts.includes(mountType)) {
    return {
      ...base,
      canonicalFrameType: definition.canonicalFrameType,
      mountType,
      supported: false,
      reason: "mount_frame_mismatch",
    };
  }

  const perSide = definition.perSidePricingAdditionInches;
  const widthAdditionInches = perSide * 2;
  const heightAdditionInches = perSide * (base.frameSides === 4 ? 2 : 1);
  return {
    ...base,
    canonicalFrameType: definition.canonicalFrameType,
    mountType,
    supported: true,
    perSidePricingAdditionInches: perSide,
    widthAdditionInches,
    heightAdditionInches,
    pricingWidthInches: input.widthInches + widthAdditionInches,
    pricingHeightInches: input.heightInches + heightAdditionInches,
    reason: null,
  };
}
