import type { SupabaseClient } from "@supabase/supabase-js";

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

/** Read until exhaustion, including when the server caps pages below our requested size. */
export async function collectCrmPages<T>(
  read: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = 500,
): Promise<PageResult<T>> {
  const data: T[] = [];
  for (let page = 0; page < 10_000; page += 1) {
    const result = await read(data.length, data.length + pageSize - 1);
    if (result.error) return { data: null, error: result.error };
    if (!result.data?.length) return { data, error: null };
    data.push(...result.data);
  }
  return { data: null, error: { message: "CRM data exceeded the safe page limit; no partial ledger was returned." } };
}

export function loadCompleteCrmTable(supabase: SupabaseClient, table: string, orderColumn = "created_at", columns = "*", identityColumn = "id") {
  return collectCrmPages<Record<string, unknown>>(async (from, to) => {
    const result = await supabase.from(table).select(columns)
      .order(orderColumn, { ascending: false, nullsFirst: false })
      .order(identityColumn, { ascending: true }).range(from, to);
    return { data: result.data as unknown as Record<string, unknown>[] | null, error: result.error };
  });
}
