import { NextRequest, NextResponse } from "next/server";
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
};

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as LeadPayload;

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

  const leadRecord = {
    source: "website",
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
      source: "805shutters.com",
      receivedAt: new Date().toISOString()
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

  if (process.env.LEAD_WEBHOOK_URL) {
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
  }

  return NextResponse.json({ id: data.id, message: "Lead received." });
}
