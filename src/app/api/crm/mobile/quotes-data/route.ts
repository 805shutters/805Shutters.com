import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireCrmUser(request);
    const [jobsResult, quotesResult, eventsResult, customersResult] = await Promise.all([
      supabase.from("crm_jobs").select("*").order("created_at", { ascending: false }).limit(1000),
      supabase.from("crm_quotes").select("*").order("created_at", { ascending: false }).limit(1000),
      supabase
        .from("crm_calendar_events")
        .select("*")
        .gte("start_at", new Date(Date.now() - 1000 * 60 * 60 * 24 * 14).toISOString())
        .order("start_at", { ascending: true })
        .limit(120),
      supabase.from("crm_customers").select("*").order("latest_sold_date", { ascending: false }).limit(800)
    ]);

    if (jobsResult.error || quotesResult.error || eventsResult.error || customersResult.error) {
      return NextResponse.json({ message: "Quote workspace data failed to load." }, { status: 502 });
    }

    const jobs = jobsResult.data || [];
    const jobNames = new Map(jobs.map((job) => [job.id, job.customer_name]));

    return NextResponse.json({
      jobs,
      quotes: (quotesResult.data || []).map((quote) => ({
        ...quote,
        customer_name: jobNames.get(quote.job_id)
      })),
      events: eventsResult.data || [],
      customers: customersResult.data || []
    });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
