import { ROLLER_VALANCE_KEY } from '@/lib/quote/norman-roller-valance-only';

/** Remap user-selected cross-line links only in a newly copied configuration.
 * Unknown or dangling links stay visible to validation rather than being guessed.
 * Derived assembly records are rebuilt by the authoritative quote-wide repricer.
 */
export function remapCopiedQuoteAssociations(options: unknown, lineIds: ReadonlyMap<string, string>): unknown {
  if (!options || typeof options !== 'object' || Array.isArray(options)) return options;
  const next = { ...options } as Record<string, unknown>;
  const remap = (id: unknown) => typeof id === 'string' ? lineIds.get(id) ?? id : id;
  for (const key of ['accompanying_line_id', 'side_by_side_match_line_id']) {
    if (key in next) next[key] = remap(next[key]);
  }
  const valance = next[ROLLER_VALANCE_KEY];
  if (valance && typeof valance === 'object' && !Array.isArray(valance)) {
    const record = valance as Record<string, unknown>;
    if (record.version === 1 && Array.isArray(record.associatedLineIds)) {
      next[ROLLER_VALANCE_KEY] = { ...record, associatedLineIds: record.associatedLineIds.map(remap) };
    }
  }
  return next;
}
