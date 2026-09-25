import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "./auth";
import { recordCrmActivity } from "./backend";
import { loadTechnicalMeasureForm, type TechnicalMeasureForm } from "./technical-measures";
import { deliverTechnicalMeasureOfficeEmail } from "./technical-measure-office-email";

/** Receive incomplete field work without releasing it to ordering or installation. */
export async function submitTechnicalMeasureProgress(
  supabase: SupabaseClient,
  form: TechnicalMeasureForm,
  actor: { email: string; userId?: string; displayName?: string | null },
  missingInformation: string[],
  installationDurationMinutes: unknown,
) {
  const receivedAt = new Date().toISOString();
  const minutes = Number(installationDurationMinutes);
  const validDuration = Number.isInteger(minutes) && minutes >= 15 && minutes <= 480 && minutes % 15 === 0;
  const { error } = await supabase.from("crm_technical_measure_forms").update({
    technician_email: actor.email,
    technician_name: actor.displayName || form.technician_name,
    meta: {
      ...form.meta,
      installation_duration_minutes: validDuration ? minutes : null,
      incomplete_submission: { received_at: receivedAt, received_by: actor.email, missing_information: missingInformation },
    },
  }).eq("id", form.id).neq("status", "submitted");
  if (error) throw new CrmAuthError(502, "The measure could not be submitted for review. Your saved measurements are still available.");
  const officeEmail = await deliverTechnicalMeasureOfficeEmail(supabase, form.id);
  await recordCrmActivity(supabase, actor, {
    entityType: "job", entityId: form.job_id, action: "technical_measure.submit_incomplete",
    metadata: { formId: form.id, receivedAt, missingInformation, officeEmail },
  });
  return { ...await loadTechnicalMeasureForm(supabase, form.id), officeEmail };
}
