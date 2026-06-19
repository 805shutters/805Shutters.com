// Window measurement helpers. Measurements are entered as a whole number of
// inches plus an optional fraction (in sixteenths), matching how installers
// measure. The pricing engine works in decimal inches.

/** Standard fraction steps offered in the UI (sixteenths of an inch). */
export const FRACTION_STEPS = [
  "0",
  "1/16",
  "1/8",
  "3/16",
  "1/4",
  "5/16",
  "3/8",
  "7/16",
  "1/2",
  "9/16",
  "5/8",
  "11/16",
  "3/4",
  "13/16",
  "7/8",
  "15/16",
] as const;

export type FractionStep = (typeof FRACTION_STEPS)[number];

/** "3/4" -> 0.75, "0"/""/null -> 0. Returns NaN for unparseable non-empty input. */
export function fractionToDecimal(fraction: string | null | undefined): number {
  if (!fraction || fraction === "0") return 0;
  const parts = fraction.split("/");
  if (parts.length !== 2) return Number.NaN;
  const numerator = Number(parts[0]);
  const denominator = Number(parts[1]);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return Number.NaN;
  }
  return numerator / denominator;
}

/** Combine whole inches + fraction string into decimal inches. */
export function toInches(whole: number | null | undefined, fraction: string | null | undefined): number {
  const w = Number(whole);
  const f = fractionToDecimal(fraction);
  if (!Number.isFinite(w) || Number.isNaN(f)) return Number.NaN;
  return w + f;
}

/** Format decimal inches back to a readable measurement, e.g. 30.5 -> `30 1/2"`. */
export function formatInches(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const whole = Math.floor(value);
  const frac = value - whole;
  if (frac < 1 / 32) return `${whole}"`;
  // snap to nearest sixteenth
  const sixteenths = Math.round(frac * 16);
  if (sixteenths === 16) return `${whole + 1}"`;
  const reduced = reduceFraction(sixteenths, 16);
  return `${whole} ${reduced}"`;
}

function reduceFraction(n: number, d: number): string {
  const g = gcd(n, d);
  return `${n / g}/${d / g}`;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Square footage from decimal inches. */
export function squareFeet(widthInches: number, heightInches: number): number {
  return (widthInches * heightInches) / 144;
}

/** Split decimal inches into a whole number + a FRACTION_STEPS fraction (nearest 1/16). */
export function splitInches(value: number | null | undefined): { whole: number; fraction: FractionStep } {
  const v = Number(value);
  if (!Number.isFinite(v) || v <= 0) return { whole: 0, fraction: "0" };
  const whole = Math.floor(v);
  const sixteenths = Math.round((v - whole) * 16);
  if (sixteenths >= 16) return { whole: whole + 1, fraction: "0" };
  return { whole, fraction: (FRACTION_STEPS[sixteenths] ?? "0") as FractionStep };
}
