import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, CrmAuthError, requireCrmUser } from "@/lib/crm/auth";
import { assertMikePaymentAdmin, loadCrmDashboardData, recordCrmActivity } from "@/lib/crm/backend";
import { isOwnerPayableJob } from "@/lib/crm/owner-payables";

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const actor = { email, userId: user.id };
    assertMikePaymentAdmin(actor);
    const payload = await request.json();
    if (!["crm_quote", "manual", "legacy_sheet"].includes(payload.source) || typeof payload.id !== "string"
      || ![true, false, null].includes(payload.ready) || typeof payload.reason !== "string" || !payload.reason.trim()) {
      throw new CrmAuthError(400, "Choose a job and include a reason for the readiness correction.");
    }
    const dashboard = await loadCrmDashboardData(supabase);
    const row = dashboard.bookkeepingRows.find(row => row.source === payload.source && row.id === payload.id);
    if (!row || !isOwnerPayableJob(row)) throw new CrmAuthError(404, "Payable job was not found.");
    const table = row.source === "crm_quote" ? "crm_quotes" : "crm_quote_bookkeeping_entries";
    const id = row.source === "crm_quote" ? row.quoteId : row.id;
    const { data: existing, error } = await supabase.from(table).select("id,meta,updated_at").eq("id", id).single();
    if (error || !existing) throw new CrmAuthError(404, "The source record could not be loaded.");
    if (payload.person && payload.person !== "ken") throw new CrmAuthError(400, "Unsupported readiness scope.");
    const field = payload.person === "ken" ? "kenPayableReadiness" : "ownerPayableReadiness";
    const previous = existing.meta?.[field] || (payload.person === "ken" ? existing.meta?.ownerPayableReadiness : undefined);
    if ((previous?.updatedAt || null) !== payload.expected_revision) throw new CrmAuthError(409, "Readiness changed. Reload the job before saving.");
    const correction = { ready: payload.ready, reason: payload.reason.trim(), updatedAt: new Date().toISOString(), updatedBy: email };
    const meta = { ...existing.meta, [field]: correction };
    const { data: saved, error: saveError } = await supabase.from(table).update({ meta }).eq("id", id)
      .eq("updated_at", existing.updated_at).select("id,meta").maybeSingle();
    if (saveError || !saved) throw new CrmAuthError(409, "The job changed before the correction could be saved. Reload Payables.");
    await recordCrmActivity(supabase, actor, {
      entityType: row.source === "crm_quote" ? "quote" : "bookkeeping_entry", entityId: String(id),
      action: "payables_readiness", metadata: { person: payload.person || "owners" }, before: previous || null, after: correction
    });
    return NextResponse.json({ dashboard: await loadCrmDashboardData(supabase) });
  } catch (error) { return crmAuthErrorResponse(error); }
}
