/** An optional included paper shade; never inferred from the main product. */
export const TEMPORARY_SHADE_KEY = "temporary_shade";
export function temporaryShadeSelected(options: readonly string[] = []): boolean {
  const values = options.flatMap(option => {
    const colon = option.indexOf(":");
    if (colon < 0 || !["temporary shade", "complimentary temporary shade"].includes(option.slice(0, colon).trim().toLowerCase().replace(/[_-]/g, " "))) return [];
    return [option.slice(colon + 1).trim().toLowerCase()];
  });
  return values.length > 0 && values.every(value => ["yes", "true", "included", "free"].includes(value));
}
