import { NextRequest, NextResponse } from "next/server";
import { classifyLeadSource, isMissingLeadSourceColumnError, withLeadSourceMeta } from "@/lib/lead-source";
import { sendMetaLeadEvent } from "@/lib/meta-capi";
import { getSupabaseServiceClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

type LeadPayload = {
  name?: string;
  phone?: string;
  email?: string;
  city?: string;
  interest?: string;
  notes?: string;
  pagePath?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  gclid?: string;
  referrer?: string;
  landingPath?: string;
  company?: string;
};

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as LeadPayload;

  if (payload.company?.trim()) {
    return NextResponse.json({ message: "Lead received." });
  }

  if (!payload.name || !payload.phone) {
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

  const leadRecord = withLeadSourceMeta({
    source: "website",
    lead_source: classifyLeadSource({
      utmSource: payload.utm_source,
      utmMedium: payload.utm_medium,
      gclid: payload.gclid,
      referrer: payload.referrer
    }),
    name: payload.name.trim(),
    phone: payload.phone.trim(),
    email: payload.email?.trim() || null,
    city: payload.city?.trim() || null,
    interest: payload.interest || "consultation",
    notes: payload.notes?.trim() || null,
    page_path: payload.pagePath || null,
    utm_source: payload.utm_source || null,
    utm_medium: payload.utm_medium || null,
    utm_campaign: payload.utm_campaign || null,
    utm_content: payload.utm_content || null,
    utm_term: payload.utm_term || null,
    meta: {
      userAgent: request.headers.get("user-agent"),
      referrer: request.headers.get("referer"),
      landingReferrer: payload.referrer || null,
      landingPath: payload.landingPath || null,
      gclid: payload.gclid || null,
      source: "805shutters.com",
      receivedAt: new Date().toISOString()
    }
  });

  let { data, error } = await supabase
    .from("leads")
    .insert(leadRecord)
    .select("id")
    .single();

  if (error && isMissingLeadSourceColumnError(error)) {
    const { lead_source: _leadSource, ...withoutLeadSource } = leadRecord;
    ({ data, error } = await supabase.from("leads").insert(withoutLeadSource).select("id").single());
  }

  if (error || !data) {
    return NextResponse.json(
      { message: "Lead storage failed." },
      { status: 502 }
    );
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
          ...leadRecord
        })
      });
    } catch (error) {
      console.error(error);
    }
  }

  return NextResponse.json({ id: data.id, message: "Lead received." });
}
