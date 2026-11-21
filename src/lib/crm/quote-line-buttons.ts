import type { QuoteButtonScreenField } from "@/lib/crm/quote-button-catalog";

/** Inch math for the width and height buttons. Values stay on an eighth or a sixteenth. */

export function dimensionParts(step: "1/8" | "1/16" | null) {
  return step === "1/16" ? 16 : 8;
}

export function dimensionStepSize(step: "1/8" | "1/16" | null) {
  return 1 / dimensionParts(step);
}

function unitsOf(value: number | null, parts: number) {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.round(value * parts);
}

export function isDimensionStep(value: unknown, step: "1/8" | "1/16" | null) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return false;
  const parts = dimensionParts(step);
  const units = value * parts;
  return Math.abs(units - Math.round(units)) < 1e-6;
}

export function splitInches(value: number, step: "1/8" | "1/16" | null) {
  const parts = dimensionParts(step);
  const total = Math.round(value * parts);
  const whole = Math.trunc(total / parts);
  const numerator = ((total % parts) + parts) % parts;
  return { whole, fraction: numerator === 0 ? "0" : reduceFraction(numerator, parts) };
}

export function formatInches(value: number | null, step: "1/8" | "1/16" | null) {
  if (value == null || !Number.isFinite(value)) return "";
  const parts = dimensionParts(step);
  const total = unitsOf(value, parts);
  const whole = Math.trunc(total / parts);
  const numerator = total % parts;
  if (numerator === 0) return String(whole);
  const label = reduceFraction(numerator, parts);
  return whole > 0 ? `${whole} ${label}` : label;
}

export function fractionChoices(step: "1/8" | "1/16" | null) {
  const parts = dimensionParts(step);
  return Array.from({ length: parts }, (_, numerator) => ({
    numerator,
    label: numerator === 0 ? "0" : reduceFraction(numerator, parts),
  }));
}

export function stepInches(value: number | null, direction: 1 | -1, step: "1/8" | "1/16" | null) {
  const parts = dimensionParts(step);
  const units = Math.max(1, unitsOf(value, parts) + direction);
  return units / parts;
}

export function appendInchDigit(value: number | null, digit: number, step: "1/8" | "1/16" | null) {
  if (!Number.isInteger(digit) || digit < 0 || digit > 9) return value;
  const parts = dimensionParts(step);
  const total = unitsOf(value, parts);
  const whole = Math.trunc(total / parts);
  const numerator = total % parts;
  const nextWhole = Math.min(999, whole * 10 + digit);
  return nextWhole + numerator / parts;
}

export function backspaceInches(value: number | null, step: "1/8" | "1/16" | null) {
  const parts = dimensionParts(step);
  const total = unitsOf(value, parts);
  const whole = Math.trunc(total / parts);
  const numerator = total % parts;
  const nextWhole = Math.trunc(whole / 10);
  const next = nextWhole + numerator / parts;
  return next > 0 ? next : null;
}

export function withInchFraction(value: number | null, numerator: number, step: "1/8" | "1/16" | null) {
  const parts = dimensionParts(step);
  const whole = Math.trunc(unitsOf(value, parts) / parts);
  const next = whole + Math.max(0, Math.min(parts - 1, numerator)) / parts;
  return next > 0 ? next : null;
}

export function initialButtonPicks(fields: QuoteButtonScreenField[]) {
  const picks: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.pending && field.choices.length === 0 && field.control !== "notes") continue;
    if (field.defaultValue == null) continue;
    picks[field.fieldKey] = field.defaultValue;
  }
  return picks;
}

function reduceFraction(numerator: number, denominator: number) {
  const divisor = greatestDivisor(numerator, denominator);
  return `${numerator / divisor}/${denominator / divisor}`;
}

function greatestDivisor(left: number, right: number): number {
  return right ? greatestDivisor(right, left % right) : left;
}
