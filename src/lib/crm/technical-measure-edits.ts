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
  const index = fractions.indexOf(fraction);
  const inches = Math.round((whole + Math.max(0, index) / 16) * 16) / 16;
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
