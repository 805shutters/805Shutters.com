import { NextRequest, NextResponse } from "next/server";
import { sendMetaLeadEvent } from "@/lib/meta-capi";
import { getSupabaseServiceClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

type LeadPayload = {
  name?: string;
  phone?: string;
  email?: string;
  city?: string;
  address?: string;
  interest?: string;
  projectInterest?: string;
  notes?: string;
  preferredTimes?: string;
  requestedDate?: string;
  requestedTime?: string;
  leadContext?: string;
  pagePath?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  company?: string;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as LeadPayload;

  if (payload.company?.trim()) {
    return NextResponse.json({ message: "Lead received." });
  }

  const name = clean(payload.name);
  const phone = clean(payload.phone);
  const email = clean(payload.email);
  const city = clean(payload.city);
  const address = clean(payload.address);
  const notes = clean(payload.notes);
  const preferredTimes = clean(payload.preferredTimes);
  const requestedDate = clean(payload.requestedDate);
  const requestedTime = clean(payload.requestedTime);
  const projectInterest = clean(payload.projectInterest);
  const isBookingFallback = payload.leadContext === "booking_fallback";
  const interest = clean(payload.interest) || (isBookingFallback ? "schedule_request" : "consultation");

  if (!name || !phone) {
    return NextResponse.json(
      { message: "Name and phone are required." },
      { status: 400 }
    );
  }

  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return NextResponse.json(
      { message: "Supabase lead capture is not configured for this preview." },
      { status: 503 }
    );
  }

  const schedulingNotes = [
    notes || null,
    isBookingFallback && preferredTimes ? `Preferred days/times: ${preferredTimes}` : null,
    isBookingFallback && requestedDate ? `Calendar date viewed: ${requestedDate}` : null,
    isBookingFallback && requestedTime ? `Calendar time viewed: ${requestedTime}` : null
  ]
    .filter(Boolean)
    .join("\n\n");

  const leadRecord = {
    source: isBookingFallback ? "booking_fallback" : "website",
    name,
    phone,
    email: email || null,
    city: city || null,
    interest,
    notes: schedulingNotes || null,
    page_path: payload.pagePath || null,
    utm_source: payload.utm_source || null,
    utm_medium: payload.utm_medium || null,
    utm_campaign: payload.utm_campaign || null,
    utm_content: payload.utm_content || null,
    utm_term: payload.utm_term || null,
    meta: {
      userAgent: request.headers.get("user-agent"),
      referrer: request.headers.get("referer"),
      source: "805shutters.com",
      receivedAt: new Date().toISOString(),
      leadContext: payload.leadContext || null,
      address: address || null,
      preferredTimes: preferredTimes || null,
      requestedDate: requestedDate || null,
      requestedTime: requestedTime || null,
      projectInterest: projectInterest || null
    }
  };

  const { data, error } = await supabase
    .from("leads")
    .insert(leadRecord)
    .select("id")
    .single();

  if (error) {
    return NextResponse.json(
      { message: "Lead storage failed." },
      { status: 502 }
    );
  }

  let crmJobId: string | null = null;

  if (isBookingFallback) {
    const { data: job, error: jobError } = await supabase
      .from("crm_jobs")
      .insert({
        source: "booking_fallback",
        lead_id: data.id,
        status: "follow_up",
        priority: "high",
        customer_name: name,
        phone,
        email: email || null,
        address: address || null,
        city: city || null,
        product_interest: projectInterest || "consultation",
        sales_owner: "Unassigned",
        next_action: "Call/text customer to find a consultation time",
        next_action_due: new Date().toISOString().slice(0, 10),
        notes: schedulingNotes || "Customer did not find a calendar time that worked.",
        meta: {
          preferredTimes: preferredTimes || null,
          requestedDate: requestedDate || null,
          requestedTime: requestedTime || null,
          bookingFallback: true
        }
      })
      .select("id")
      .single();

    if (jobError) {
      console.error(jobError);
    } else {
      crmJobId = job.id;
    }

    const { error: eventError } = await supabase
      .from("lead_events")
      .insert({
        lead_id: data.id,
        event_type: "booking_fallback_request",
        note: "Customer requested help finding a consultation time.",
        meta: {
          crmJobId,
          preferredTimes: preferredTimes || null,
          requestedDate: requestedDate || null,
          requestedTime: requestedTime || null,
          projectInterest: projectInterest || null
        }
      });

    if (eventError) {
      console.error(eventError);
    }
  }

  try {
    await sendMetaLeadEvent(request, {
      eventId: data.id,
      email: leadRecord.email,
      phone: leadRecord.phone,
      city: leadRecord.city,
      interest: leadRecord.interest,
      pagePath: leadRecord.page_path
    });
  } catch (error) {
    console.error(error);
  }

  if (process.env.LEAD_WEBHOOK_URL) {
    try {
      await fetch(process.env.LEAD_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          id: data.id,
          crmJobId,
          ...leadRecord
        })
      });
    } catch (error) {
      console.error(error);
    }
  }

  return NextResponse.json({ id: data.id, crmJobId, message: "Lead received." });
}
