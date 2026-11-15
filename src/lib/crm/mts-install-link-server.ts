import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "@/lib/crm/auth";
import { MtsInstallLinkError, readMtsInstallLink, validateMtsInstallLinkInput } from "@/lib/crm/mts-install-link";
import type { MtsInstallLink } from "@/lib/crm/types";

const JOB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clientMessage(message: string) {
  return message.replace(/^ERROR:\s*/i, "").split("\n")[0].trim();
}

/**
 * Idempotent write: one summary per job. The database function upserts on job_id,
 * rejects fields outside the allowed summary, and stamps who verified it.
 */
export async function upsertJobMtsInstallLink(
  supabase: SupabaseClient,
  jobId: string,
  payload: unknown,
  actor: { email: string; userId?: string | null }
): Promise<MtsInstallLink> {
  if (!JOB_ID.test(jobId)) throw new CrmAuthError(400, "CRM job was not found.");
  const email = actor.email?.trim();
  if (!email) throw new CrmAuthError(400, "MTS install link verifier is required.");
  let normalized;
  try {
    normalized = validateMtsInstallLinkInput(payload);
  } catch (error) {
    if (error instanceof MtsInstallLinkError) throw new CrmAuthError(400, error.message);
    throw error;
  }
  const { data, error } = await supabase.rpc("crm_upsert_job_mts_install_link", {
    p_job_id: jobId,
    p_payload: normalized,
    p_actor: email,
    p_actor_user_id: actor.userId || null,
  });
  if (error) {
    const message = clientMessage(error.message || "");
    if (/not allowed|charge_basis|charge_amount|match_basis|match_status|open_issues|record_references|calendar date|was not found|verifier is required|too long|too large|must be|requires/i.test(message)) {
      throw new CrmAuthError(400, message);
    }
    throw new CrmAuthError(502, "MTS install link could not be saved.");
  }
  const link = readMtsInstallLink(data);
  if (!link) throw new CrmAuthError(502, "MTS install link could not be saved.");
  return link;
}
