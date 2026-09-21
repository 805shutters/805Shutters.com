export type ArchivableQuoteLine = {
  archived_at?: string | null;
};

/** Archived lines keep immutable price history and stay out of the live quote. */
export function isActiveQuoteLine(line: ArchivableQuoteLine): boolean {
  return line.archived_at == null;
}

export function activeQuoteLines<T extends ArchivableQuoteLine>(
  lines: readonly T[],
): T[] {
  return lines.filter(isActiveQuoteLine);
}
