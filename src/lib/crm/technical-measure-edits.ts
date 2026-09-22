export function preserveTechnicalMeasureNotes(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof fallback === "string") return fallback;
  return "";
}

export function selectTechnicalMeasureInches(
  current: number | null,
  whole: number,
  fraction: string,
  fractions: readonly string[],
): { inches: number; selected: true; valueChanged: boolean } {
  // The keypad can offer eighths or sixteenths. Its array index is not a
  // measurement: parse the displayed fraction so 1/8 always means 0.125.
  const parts = fractions.includes(fraction) ? fraction.split("/").map(Number) : [0];
  const fractionalInches = parts.length === 2 && parts[1] > 0 ? parts[0] / parts[1] : 0;
  const inches = Math.round((whole + fractionalInches) * 16) / 16;
  const previous = current == null ? null : Math.round(Number(current) * 16) / 16;
  return {
    inches,
    selected: true,
    valueChanged: previous !== inches,
  };
}

export function commitTechnicalMeasureDetail(
  details: Record<string, unknown>,
  key: string,
  value: string | boolean,
): { details: Record<string, unknown>; selected: true; valueChanged: boolean } {
  const previous = details[key];
  return {
    details: { ...details, [key]: value },
    selected: true,
    valueChanged: JSON.stringify(previous ?? null) !== JSON.stringify(value),
  };
}

export function shouldQueueTechnicalMeasureSave(
  serialized: string,
  lastSynced: string,
  userSelected: boolean,
) {
  return serialized !== lastSynced || userSelected;
}
