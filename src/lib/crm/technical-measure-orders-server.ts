import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "./auth";
import { collectCrmPages } from "./pagination";
import {
  measureFilter,
  measureOrderSummary,
  orderObject,
} from "./technical-measure-orders";

export async function enrichMeasureOrders(
  supabase: SupabaseClient,
  forms: Array<Record<string, any>>,
) {
  if (!forms.length) return [];
  if (forms.length > 100) {
    const result: Array<
      Record<string, any> & {
        productOrders: ReturnType<typeof measureOrderSummary>;
        filterStatus: ReturnType<typeof measureFilter>;
      }
    > = [];
    for (let i = 0; i < forms.length; i += 100)
      result.push(
        ...(await enrichMeasureOrders(supabase, forms.slice(i, i + 100))),
      );
    return result;
  }
  const [lineResult, quoteResult, contractResult] = await Promise.all([
    collectCrmPages<Record<string, any>>((from, to) =>
      supabase
        .from("crm_technical_measure_lines")
        .select(
          "id,form_id,quote_line_item_id,current_values,baseline,updated_at,sort_order",
        )
        .in(
          "form_id",
          forms.map((f) => f.id),
        )
        .order("id")
        .range(from, to),
    ),
    supabase
      .from("crm_quotes")
      .select("id,job_id,status,ordered_at,meta")
      .in("id", [...new Set(forms.map((f) => f.quote_id))]),
    supabase
      .from("crm_customer_contracts")
      .select("id,quote_id,job_id,customer_id")
      .in("quote_id", [...new Set(forms.map((f) => f.quote_id))]),
  ]);
  if (lineResult.error || quoteResult.error || contractResult.error)
    throw new CrmAuthError(502, "Product order progress could not be loaded.");
  const sourceIds = (quoteResult.data || [])
    .map((q) => orderObject(q.meta).mts_quote_id)
    .filter(Boolean);
  const [sourceQuotes, sourceLines] = sourceIds.length
    ? await Promise.all([
        supabase
          .from("sales_quotes")
          .select("id,status,ordered_at")
          .eq("account_id", "72ccf12a-11c0-4261-8ad0-31af8ad0bbfb")
          .in("id", sourceIds),
        collectCrmPages<Record<string, any>>((from, to) =>
          supabase
            .from("sales_quote_line_items")
            .select("id,quote_id")
            .in("quote_id", sourceIds)
            .order("id")
            .range(from, to),
        ),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ];
  if (sourceQuotes.error || sourceLines.error)
    throw new CrmAuthError(
      502,
      "Existing product orders could not be verified.",
    );
  const sourceLineIds = (sourceLines.data || []).map((l) => l.id);
  const events: Array<Record<string, any>> = [];
  for (let i = 0; i < sourceLineIds.length; i += 100) {
    const result = await collectCrmPages<Record<string, any>>((from, to) =>
      supabase
        .from("crm_activity_events")
        .select("id,entity_id,after_data,created_at")
        .eq("entity_type", "quote")
        .in("entity_id", sourceLineIds.slice(i, i + 100))
        .in("action", [
          "sales_quote_line.ordered",
          "sales_quote_line.confirmed",
        ])
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to),
    );
    if (result.error)
      throw new CrmAuthError(
        502,
        "Existing product orders could not be verified.",
      );
    events.push(...(result.data || []));
  }
  return forms.map((form) => {
    const quote = quoteResult.data?.find((q) => q.id === form.quote_id);
    const productOrders = measureOrderSummary(
      (lineResult.data || []).filter((l) => l.form_id === form.id),
      quote || {},
    );
    const contract = contractResult.data?.find(
      (c) => c.id === form.contract_id,
    );
    if (
      !quote ||
      quote.job_id !== form.job_id ||
      (form.contract_id &&
        (!contract ||
          contract.quote_id !== form.quote_id ||
          contract.job_id !== form.job_id ||
          (form.customer_id && contract.customer_id !== form.customer_id)))
    ) {
      productOrders.error =
        "This measure must be linked to its exact customer contract before recording orders.";
    }
    const sourceId = orderObject(quote?.meta).mts_quote_id;
    if (sourceId) {
      const source = sourceQuotes.data?.find((q) => q.id === sourceId);
      const provenance =
        orderObject(form.meta).technical_measure_line_provenance || [];
      for (const group of productOrders.groups) {
        const matching = group.lineIds.map((id) => {
          const line = lineResult.data?.find((l) => l.id === id);
          const sourceLineId =
            provenance.find(
              (p: Record<string, any>) =>
                p.measure_quote_line_item_id === line?.quote_line_item_id,
            )?.source_quote_line_item_id || line?.quote_line_item_id;
          if (
            !sourceLines.data?.some(
              (l) => l.id === sourceLineId && l.quote_id === sourceId,
            )
          )
            productOrders.error =
              "A product opening is missing its original contract link. Open the measure to review it.";
          return events.find((e) => e.entity_id === sourceLineId);
        });
        if (!source)
          productOrders.error =
            "The linked source contract could not be verified.";
        if (
          !group.ordered &&
          !Object.keys(
            orderObject(orderObject(quote?.meta).measure_product_orders),
          ).length &&
          (matching.every(Boolean) ||
            (source &&
              ["ordered", "received", "installed"].includes(source.status)))
        ) {
          group.ordered = true;
          group.orderedAt =
            matching.find(Boolean)?.after_data?.orderedAt ||
            source?.ordered_at ||
            matching.find(Boolean)?.created_at ||
            null;
        }
      }
      productOrders.orderedCount = productOrders.groups.filter(
        (g) => g.ordered,
      ).length;
      const count = productOrders.orderedCount;
      productOrders.label = !count
        ? "Not ordered"
        : `${count === productOrders.totalCount && !productOrders.error ? "Ordered" : "Partially ordered"} · ${count} of ${productOrders.totalCount}`;
    }
    const result = { ...form, productOrders };
    return { ...result, filterStatus: measureFilter(result) };
  });
}

export async function markMeasureProductOrdered(
  supabase: SupabaseClient,
  formId: string,
  groupKey: string,
  actor: { email: string; userId: string },
) {
  const { data: form, error } = await supabase
    .from("crm_technical_measure_forms")
    .select("*")
    .eq("id", formId)
    .maybeSingle();
  if (error || !form)
    throw new CrmAuthError(404, "Technical measure was not found.");
  const [enriched] = await enrichMeasureOrders(supabase, [form]);
  if (enriched.productOrders.error)
    throw new CrmAuthError(409, enriched.productOrders.error);
  if (!enriched.productOrders.groups.some((g) => g.key === groupKey))
    throw new CrmAuthError(
      400,
      "This product is not on the contract. Refresh the measure list.",
    );
  const { data: lines, error: lineError } = await supabase
    .from("crm_technical_measure_lines")
    .select("id,current_values,baseline,updated_at")
    .eq("form_id", formId);
  if (lineError)
    throw new CrmAuthError(502, "Measure openings could not be verified.");
  // Recompute routes from the same snapshot sent to the transaction, never trust browser group membership.
  const fresh = measureOrderSummary(lines || [], {});
  if (fresh.error) throw new CrmAuthError(409, fresh.error);
  const groups = fresh.groups;
  const { error: saveError } = await supabase.rpc(
    "crm_mark_measure_product_ordered",
    {
      p_form_id: formId,
      p_group_key: groupKey,
      p_groups: groups,
      p_snapshot: lines,
      p_actor_email: actor.email,
      p_actor_id: actor.userId,
    },
  );
  if (saveError) {
    const conflict = /MEASURE_|ORDER_/.test(saveError.message);
    throw new CrmAuthError(
      conflict ? 409 : 502,
      conflict
        ? "The measure or its contract changed. Refresh the list and try again."
        : "The order could not be saved. No changes were applied.",
    );
  }
  const { data: saved, error: reloadError } = await supabase
    .from("crm_technical_measure_forms")
    .select("*")
    .eq("id", formId)
    .single();
  if (reloadError)
    throw new CrmAuthError(
      502,
      "The order was saved. Refresh to see its current status.",
    );
  return (await enrichMeasureOrders(supabase, [saved]))[0];
}
