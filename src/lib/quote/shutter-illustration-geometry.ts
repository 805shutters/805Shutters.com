/** Dimensionless drawing geometry. Customer artwork can keep the opening's
 * proportions without adding a measurement label or exposing factory records. */
export type ShutterIllustrationGeometry = {
  aspectRatio: number;
  louverPitchFraction?: number;
  legHeightFraction?: number;
  leftLegHeightFraction?: number;
  rightLegHeightFraction?: number;
  dividerHeightFraction?: number;
};

export function sketchInches(value: string): number | null {
  const clean = value.trim().replace(/(?:inches|inch|in\b|[″"])/gi, '').trim();
  const match = /^(\d+(?:\.\d+)?)(?:\s+(\d+)\/(\d+))?$/.exec(clean);
  const fraction = /^(\d+)\/(\d+)$/.exec(clean);
  const result = match ? Number(match[1]) + (match[2] ? Number(match[2])/Number(match[3]) : 0)
    : fraction ? Number(fraction[1])/Number(fraction[2]) : NaN;
  return Number.isFinite(result) && result > 0 ? result : null;
}

export function shutterIllustrationGeometry(width: number | null | undefined, height: number | null | undefined, options: readonly string[] = []): ShutterIllustrationGeometry | undefined {
  if (typeof width !== 'number' || typeof height !== 'number' || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return undefined;
  const fields = new Map(options.map(option => {
    const colon = option.indexOf(':');
    return [option.slice(0, colon).trim().toLowerCase(), option.slice(colon+1).trim()];
  }));
  const fraction = (label: string) => {
    const inches = sketchInches(fields.get(label) ?? '');
    return inches && inches <= height ? inches/height : undefined;
  };
  return {aspectRatio: width/height,
    ...(fraction('louver size') ? {louverPitchFraction: fraction('louver size')} : {}),
    ...(fraction('leg height') ? {legHeightFraction: fraction('leg height')} : {}),
    ...(fraction('left leg height') ? {leftLegHeightFraction: fraction('left leg height')} : {}),
    ...(fraction('right leg height') ? {rightLegHeightFraction: fraction('right leg height')} : {}),
    ...(fraction('divider rail height') ?? fraction('divider rail location') ? {dividerHeightFraction: fraction('divider rail height') ?? fraction('divider rail location')} : {}),
  };
}

/** Staff cards already receive installer-readable dimensions. */
export function shutterGeometryFromDimensions(dimensions: string | null | undefined, options: readonly string[] = []): ShutterIllustrationGeometry | undefined {
  const match = /^(.+?)\s*(?:W\s*)?[×x]\s*(.+?)\s*(?:H)?$/i.exec(dimensions ?? '');
  return match ? shutterIllustrationGeometry(sketchInches(match[1]), sketchInches(match[2]), options) : undefined;
}
