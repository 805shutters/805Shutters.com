// One-time review-request backlog tool. Completed jobs that finished before
// the automation existed (or that skipped the install statuses it used to
// watch) never got the review-request text. GET lists those candidates; POST
// sends the same one-shot review request the automation sends, stamping
// job.meta so nobody can ever be texted twice. CRM-authenticated users only.
import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { getReviewRequestMeta, maybeSendReviewRequestForJob, reviewRequestLink } from "@/lib/crm/review-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COMPLETED_STATUSES = ["installed", "invoiced", "closed"];

function digits(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireCrmUser(request);
    const { data, error } = await supabase
      .from("crm_jobs")
      .select("id, customer_name, phone, city, status, updated_at, meta")
      .in("status", COMPLETED_STATUSES)
      .order("updated_at", { ascending: false });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const candidates = (data || []).filter(
      (job) => digits(job.phone).length >= 10 && !getReviewRequestMeta(job.meta).status
    );

    return NextResponse.json({
      linkConfigured: Boolean(reviewRequestLink()),
      candidateCount: candidates.length,
      candidates: candidates.map((job) => ({
        id: job.id,
        customer_name: job.customer_name,
        phone_last4: digits(job.phone).slice(-4),
        city: job.city,
        status: job.status,
        updated_at: job.updated_at
      }))
    });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const payload = (await request.json().catch(() => null)) as { jobIds?: string[]; confirm?: boolean } | null;
    const jobIds = Array.isArray(payload?.jobIds) ? payload.jobIds.filter((id) => typeof id === "string") : [];

    if (!payload?.confirm || jobIds.length === 0) {
      return NextResponse.json(
        { error: "Pass { jobIds: [...], confirm: true } to send review requests." },
        { status: 400 }
      );
    }
    if (jobIds.length > 50) {
      return NextResponse.json({ error: "At most 50 jobs per request." }, { status: 400 });
    }

    const results = [];
    for (const jobId of jobIds) {
      const result = await maybeSendReviewRequestForJob(supabase, jobId, { email, userId: user.id }, "backlog");
      results.push({ jobId, ...result });
    }

    return NextResponse.json({
      sent: results.filter((r) => r.status === "sent").length,
      results
    });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
