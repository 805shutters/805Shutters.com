import { CrmAuthError } from "@/lib/crm/auth";

type SupabaseWriteError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

type SupabaseWriteResult<T> = {
  data: T | null;
  error: SupabaseWriteError | null;
};

const OPTIONAL_QUOTE_DESIGN_COLUMNS = new Set(["details", "wholesale_unit_price"]);

function formatSupabaseError(error: SupabaseWriteError | null): string {
  return [error?.message, error?.details, error?.hint, error?.code]
    .filter((part): part is string => Boolean(part))
    .join(" | ");
}

function missingSchemaColumn(error: SupabaseWriteError | null): string | null {
  if (error?.code !== "PGRST204") return null;
  const match = error.message?.match(/'([^']+)' column/);
  return match?.[1] ?? null;
}

export async function saveQuoteDesignRecord<T>(
  record: Record<string, unknown>,
  write: (nextRecord: Record<string, unknown>) => PromiseLike<SupabaseWriteResult<T>>,
  failureMessage: string,
  status = 502,
): Promise<T> {
  let nextRecord = { ...record };
  let lastError: SupabaseWriteError | null = null;

  for (let attempt = 0; attempt <= OPTIONAL_QUOTE_DESIGN_COLUMNS.size; attempt += 1) {
    const { data, error } = await write(nextRecord);
    if (!error && data) return data;

    lastError = error;
    const missingColumn = missingSchemaColumn(error);
    if (
      missingColumn &&
      OPTIONAL_QUOTE_DESIGN_COLUMNS.has(missingColumn) &&
      Object.prototype.hasOwnProperty.call(nextRecord, missingColumn)
    ) {
      const { [missingColumn]: _omitted, ...withoutMissingColumn } = nextRecord;
      nextRecord = withoutMissingColumn;
      continue;
    }

    const detail = formatSupabaseError(error);
    throw new CrmAuthError(status, detail ? `${failureMessage}: ${detail}` : failureMessage);
  }

  const detail = formatSupabaseError(lastError);
  throw new CrmAuthError(status, detail ? `${failureMessage}: ${detail}` : failureMessage);
}
