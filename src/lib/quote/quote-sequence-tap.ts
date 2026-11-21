/**
 * Asks the database whether one tapped value is allowed before it is saved.
 * 805 Quote should call public.quote_validate_tapped_value. This wrapper is that
 * call. DesignCard saves partial drafts, so the check is not hooked into that
 * screen; call it at the bot or server boundary that commits a finished tap.
 * Answers may use a schema field or a saved key from quote_sequence_field_alias.
 */

export type QuoteSequenceTapResult = {
  ok: boolean;
  status: "ok" | "blocked" | "needs_input";
  reason: string | null;
  choices: Array<{ value: string; label: string }>;
};

export type QuoteSequenceQuery = {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
};

export async function validateQuoteSequenceTap(
  client: QuoteSequenceQuery,
  input: {
    manufacturer: string;
    category: string;
    fieldKey: string;
    value: unknown;
    answers?: Record<string, unknown>;
    catalogVersion?: string | null;
  },
): Promise<QuoteSequenceTapResult> {
  const query = await client.query<{ result: QuoteSequenceTapResult }>(
    "select public.quote_validate_tapped_value($1::jsonb, $2, $3, $4, $5::jsonb) as result",
    [
      JSON.stringify({ answers: input.answers ?? {}, catalog_version: input.catalogVersion ?? null }),
      input.manufacturer,
      input.category,
      input.fieldKey,
      JSON.stringify(input.value),
    ],
  );
  return query.rows[0].result;
}
