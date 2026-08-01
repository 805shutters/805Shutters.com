import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { durableRunRecord, evaluateMarketingRun, type MarketingSnapshotEnvelope } from "@/lib/marketing-agent/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (value: unknown, status = 200) => {
  const response = NextResponse.json(value, { status });
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
};

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireCrmUser(request);
    const { data, error } = await supabase.from("crm_marketing_agent_runs")
      .select("id,created_at,completed_at,agent_id,status,stop_reason,iterations_used,proposals_created,metrics")
      .order("created_at", { ascending: false }).limit(25);
    if (error) return noStore({ message: "Marketing Agent storage is unavailable.", runs: [] }, 503);
    return noStore({ runs: data || [] });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const [jobs, quotes] = await Promise.all([
      supabase.from("crm_jobs").select("id,lead_id,status,appointment_start").not("lead_id", "is", null).limit(1000),
      supabase.from("crm_quotes").select("id,job_id").limit(1000)
    ]);
    if (jobs.error || quotes.error) return noStore({ message: "CRM evidence snapshot is unavailable." }, 503);

    const exactJobs = jobs.data || [];
    const exactJobIds = new Set(exactJobs.map((job) => job.id));
    const quotedJobIds = new Set((quotes.data || []).map((quote) => quote.job_id).filter((id) => exactJobIds.has(id)));
    const sold = exactJobs.filter((job) => ["sold", "ordered", "installed", "invoiced", "closed"].includes(job.status)).length;
    const installed = exactJobs.filter((job) => ["installed", "invoiced", "closed"].includes(job.status)).length;
    const envelope: MarketingSnapshotEnvelope = {
      completeSources: ["crm"],
      snapshot: {
        ad_clicks: 0, website_sessions: 0, leads: exactJobs.length,
        appointments: exactJobs.filter((job) => Boolean(job.appointment_start)).length,
        quotes: quotedJobIds.size, sold_customers: sold, installs: installed, paid_customers: 0,
        captured_at: new Date().toISOString(),
        source_ids: ["crm_jobs:exact-lead-snapshot", "crm_quotes:snapshot"]
      }
    };
    const result = evaluateMarketingRun(envelope);
    const record = durableRunRecord(envelope, result);
    const { data: run, error: runError } = await supabase.from("crm_marketing_agent_runs").insert(record).select("id,created_at,status,stop_reason,metrics").single();
    if (runError) return noStore({ message: "Marketing Agent run could not be persisted." }, 503);
    await supabase.from("crm_marketing_agent_events").insert({
      run_id: run.id, event_type: "run_escalated", actor_type: "crm_user", actor_email: email,
      payload: { authUserId: user.id, stopReason: result.stopReason, missingSources: result.missingSources }
    });
    return noStore({ run, result });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
