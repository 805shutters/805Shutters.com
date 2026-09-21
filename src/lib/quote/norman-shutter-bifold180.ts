/** Bi-fold 180 schedules from the September binders. No pricing authority. */
export type NormanBifold180Record = { version: 1; layout: string; flatMountingSurface: boolean };
const standard = ['LL', 'RR', 'LLRR'];
const wood = [...standard, 'LLL', 'RRR', 'LLLRR', 'LLRRR', 'LLLRRR'];
export function normanBifold180Layouts(programId: string): readonly string[] {
  return ['brightwood', 'normandy_painted', 'normandy_stained'].includes(programId) ? wood : standard;
}
export function normanBifold180Pages(programId: string) {
  return programId === 'woodlore' ? [56,57,59]
    : programId.startsWith('woodlore_') ? [73,74,76]
    : programId === 'brightwood' ? [65,66,68,69] : [67,68,70,71];
}
export function normanBifold180PanelMaxWidth(programId: string, layout: string, index: number) {
  if (programId === 'woodlore' || programId === 'woodlore_plus') return 24;
  if (programId === 'woodlore_aquashield') return 26;
  // The 20-inch limit belongs to each three-panel stack, including mixed stacks.
  const side = layout[index];
  return [...layout].filter(value => value === side).length === 3 ? 20 : 26;
}
export function parseNormanBifold180Record(value: unknown): NormanBifold180Record | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const r = value as Record<string, unknown>;
  return r.version === 1 && typeof r.layout === 'string' && typeof r.flatMountingSurface === 'boolean'
    ? r as NormanBifold180Record : null;
}
