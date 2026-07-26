import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "@/lib/crm/auth";
import { expandTechnicalMeasureLineQuantity } from "@/lib/crm/technical-measures";

type RawForm = {
  id: string;
  status: string;
  customer_snapshot: Record<string, unknown> | null;
  quote_snapshot: Record<string, unknown> | null;
  meta: Record<string, unknown> | null;
};

type RawLine = {
  id: string;
  form_id: string;
  quote_line_item_id: string;
  sort_order: number;
  baseline: Record<string, unknown>;
  current_values: Record<string, unknown>;
  baseline_unit_price: number;
  current_unit_price: number;
  price_status: string;
  created_at?: string;
  updated_at?: string;
};

type RawAddendum = {
  form_id: string;
  status: string;
  signed_at: string | null;
};

export type TechnicalMeasureQuantityBackfillCandidate = {
  form_id: string;
  customer_name: string;
  quote_number: string;
  status: string;
  candidate_line_count: number;
  source_window_count: number;
  resulting_window_count: number;
  eligible: boolean;
  reason: string | null;
};

export type TechnicalMeasureQuantityBackfillReport = {
  candidate_forms: number;
  candidate_lines: number;
  eligible_forms: number;
  skipped_forms: number;
  candidates: TechnicalMeasureQuantityBackfillCandidate[];
};

type BackfillData = {
  forms: RawForm[];
  lines: RawLine[];
  addendums: RawAddendum[];
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function quantity(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function displayText(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

async function loadBackfillData(supabase: SupabaseClient): Promise<BackfillData> {
  const [formsResult, linesResult, addendumsResult] = await Promise.all([
    supabase
      .from("crm_technical_measure_forms")
      .select("id,status,customer_snapshot,quote_snapshot,meta")
      .order("created_at"),
    supabase
      .from("crm_technical_measure_lines")
      .select("id,form_id,quote_line_item_id,sort_order,baseline,current_values,baseline_unit_price,current_unit_price,price_status,created_at,updated_at")
      .order("form_id")
      .order("sort_order"),
    supabase
      .from("crm_technical_measure_addendums")
      .select("form_id,status,signed_at"),
  ]);
  if (formsResult.error || linesResult.error || addendumsResult.error) {
    throw new CrmAuthError(502, "Technical-measure quantity candidates could not be audited.");
  }
  return {
    forms: (formsResult.data || []) as RawForm[],
    lines: (linesResult.data || []) as RawLine[],
    addendums: (addendumsResult.data || []) as RawAddendum[],
  };
}

function classifyBackfillData(data: BackfillData) {
  const linesByForm = new Map<string, RawLine[]>();
  for (const line of data.lines) {
    const bucket = linesByForm.get(line.form_id) || [];
    bucket.push(line);
    linesByForm.set(line.form_id, bucket);
  }
  const addendumsByForm = new Map<string, RawAddendum[]>();
  for (const addendum of data.addendums) {
    const bucket = addendumsByForm.get(addendum.form_id) || [];
    bucket.push(addendum);
    addendumsByForm.set(addendum.form_id, bucket);
  }

  return data.forms.flatMap((form) => {
    const formLines = [...(linesByForm.get(form.id) || [])]
      .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
    const candidateLines = formLines.filter((line) =>
      Math.max(quantity(line.baseline?.quantity) || 1, quantity(line.current_values?.quantity) || 1) > 1
    );
    if (!candidateLines.length) return [];

    const meta = object(form.meta);
    const provenance = Array.isArray(meta.technical_measure_line_provenance)
      ? meta.technical_measure_line_provenance
      : [];
    const addendums = addendumsByForm.get(form.id) || [];
    const quantitiesMatch = candidateLines.every((line) => {
      const baselineQuantity = quantity(line.baseline?.quantity);
      const currentQuantity = quantity(line.current_values?.quantity);
      return baselineQuantity !== null && baselineQuantity === currentQuantity && baselineQuantity > 1;
    });
    const uniqueSourceLines = new Set(formLines.map((line) => line.quote_line_item_id)).size === formLines.length;

    let reason: string | null = null;
    if (form.status !== "draft") reason = `Form status is ${form.status}.`;
    else if (addendums.length) reason = "The form already has an addendum record.";
    else if (provenance.length) reason = "The form already contains quantity-expansion provenance.";
    else if (!quantitiesMatch) reason = "Baseline and current quantities are ambiguous or inconsistent.";
    else if (!uniqueSourceLines) reason = "The form contains duplicate source line identities.";

    return [{
      form,
      formLines,
      candidateLines,
      report: {
        form_id: form.id,
        customer_name: displayText(form.customer_snapshot?.name, "Customer"),
        quote_number: displayText(form.quote_snapshot?.quoteNumber, "Unknown quote"),
        status: form.status,
        candidate_line_count: candidateLines.length,
        source_window_count: candidateLines.length,
        resulting_window_count: candidateLines.reduce((sum, line) => sum + (quantity(line.current_values.quantity) || 1), 0),
        eligible: reason === null,
        reason,
      } satisfies TechnicalMeasureQuantityBackfillCandidate,
    }];
  });
}

export async function auditTechnicalMeasureQuantityBackfill(
  supabase: SupabaseClient,
): Promise<TechnicalMeasureQuantityBackfillReport> {
  const classified = classifyBackfillData(await loadBackfillData(supabase));
  return {
    candidate_forms: classified.length,
    candidate_lines: classified.reduce((sum, item) => sum + item.candidateLines.length, 0),
    eligible_forms: classified.filter((item) => item.report.eligible).length,
    skipped_forms: classified.filter((item) => !item.report.eligible).length,
    candidates: classified.map((item) => item.report),
  };
}

export async function applyTechnicalMeasureQuantityBackfill(
  supabase: SupabaseClient,
  actorEmail: string,
) {
  const classified = classifyBackfillData(await loadBackfillData(supabase));
  const eligible = classified.filter((item) => item.report.eligible);
  const migrated: Array<{ form_id: string; line_count_before: number; line_count_after: number }> = [];

  for (const item of eligible) {
    const candidateIds = new Set(item.candidateLines.map((line) => line.id));
    const finalInstances = item.formLines.flatMap((line) => {
      const sourceQuantity = candidateIds.has(line.id)
        ? quantity(line.current_values.quantity) || 1
        : 1;
      return expandTechnicalMeasureLineQuantity({
        id: line.quote_line_item_id,
        quantity: sourceQuantity,
        sort_order: line.sort_order,
      }).map((instance) => ({ line, instance }));
    }).map((entry, sortOrder) => ({
      ...entry,
      instance: { ...entry.instance, sort_order: sortOrder },
    }));
    const rollback = {
      version: 1,
      captured_at: new Date().toISOString(),
      actor_email: actorEmail,
      original_meta: item.form.meta || {},
      original_lines: item.formLines,
      inserted_quote_line_item_ids: finalInstances
        .filter(({ instance }) => instance.source_quantity_index > 1)
        .map(({ instance }) => instance.measure_quote_line_item_id),
    };
    const { error: snapshotError } = await supabase
      .from("crm_technical_measure_forms")
      .update({
        meta: {
          ...object(item.form.meta),
          technical_measure_quantity_backfill_rollback: rollback,
        },
      })
      .eq("id", item.form.id)
      .eq("status", "draft");
    if (snapshotError) throw new CrmAuthError(502, `Rollback snapshot failed for form ${item.form.id}.`);

    const extraRows = finalInstances
      .filter(({ instance }) => instance.source_quantity_index > 1)
      .map(({ line, instance }) => ({
        form_id: item.form.id,
        quote_line_item_id: instance.measure_quote_line_item_id,
        sort_order: instance.sort_order,
        baseline: { ...line.baseline, quantity: 1 },
        current_values: { ...line.current_values, quantity: 1 },
        baseline_unit_price: line.baseline_unit_price,
        current_unit_price: line.current_unit_price,
        price_status: line.price_status,
      }));
    if (extraRows.length) {
      const { error: insertError } = await supabase
        .from("crm_technical_measure_lines")
        .upsert(extraRows, { onConflict: "form_id,quote_line_item_id" });
      if (insertError) throw new CrmAuthError(502, `Expanded lines failed for form ${item.form.id}.`);
    }

    for (const { line, instance } of finalInstances.filter(({ instance }) => instance.source_quantity_index === 1)) {
      const { error: updateError } = await supabase
        .from("crm_technical_measure_lines")
        .update({
          sort_order: instance.sort_order,
          baseline: { ...line.baseline, quantity: 1 },
          current_values: { ...line.current_values, quantity: 1 },
        })
        .eq("id", line.id)
        .eq("form_id", item.form.id);
      if (updateError) throw new CrmAuthError(502, `Source line update failed for form ${item.form.id}.`);
    }

    const provenance = finalInstances.map(({ instance }) => instance);
    const { error: provenanceError } = await supabase
      .from("crm_technical_measure_forms")
      .update({
        meta: {
          ...object(item.form.meta),
          technical_measure_quantity_backfill_rollback: rollback,
          technical_measure_line_provenance: provenance,
          technical_measure_quantity_backfilled_at: new Date().toISOString(),
        },
      })
      .eq("id", item.form.id)
      .eq("status", "draft");
    if (provenanceError) throw new CrmAuthError(502, `Provenance update failed for form ${item.form.id}.`);

    migrated.push({
      form_id: item.form.id,
      line_count_before: item.formLines.length,
      line_count_after: finalInstances.length,
    });
  }

  return {
    migrated,
    skipped: classified.filter((item) => !item.report.eligible).map((item) => item.report),
    remaining: await auditTechnicalMeasureQuantityBackfill(supabase),
  };
}
