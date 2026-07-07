// Meta (Facebook/Instagram) Lead Ads webhook — the "speed to lead" pipeline.
// When an Instant Form is submitted, Meta POSTs a leadgen event here; we fetch
// the lead's answers from the Graph API, store it in the same `leads` table the
// website forms use, text the customer immediately, and alert staff.
//
// Dormant until configured. Env:
//   META_LEADS_VERIFY_TOKEN  - any secret string; used once during webhook subscribe (GET echo)
//   META_APP_SECRET          - Meta app secret; verifies X-Hub-Signature-256 on every POST
//   META_PAGE_ACCESS_TOKEN   - Page token with leads_retrieval; used to fetch lead field data
// Setup (later): Meta App -> Webhooks -> Page -> leadgen field -> callback
// https://www.805shutters.com/api/meta-leads/ with the verify token above.

import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { classifyLeadSource, isMissingLeadSourceColumnError } from "@/lib/lead-source";
import { sendSms, toE164 } from "@/lib/notify/twilio";
import { getSupabaseServiceClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

const defaultStaffSmsNumbers = ["805-806-9344"];

type MetaFieldDatum = { name?: string; values?: unknown[] };

export type MappedMetaLead = {
  name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  notes: string | null;
};

const FIELD_ALIASES: Record<string, keyof MappedMetaLead> = {
  full_name: "name",
  name: "name",
  first_name: "name",
  phone_number: "phone",
  phone: "phone",
  email: "email",
  city: "city"
};

/** Map Meta Instant Form field_data to our lead shape; unknown questions become notes. */
export function mapMetaFieldData(fieldData: MetaFieldDatum[] | null | undefined): MappedMetaLead {
  const lead: MappedMetaLead = { name: null, phone: null, email: null, city: null, notes: null };
  const extras: string[] = [];
  let lastName: string | null = null;

  for (const field of fieldData || []) {
    const key = String(field.name || "").toLowerCase();
    const value = String(field.values?.[0] ?? "").trim();
    if (!value) continue;
    if (key === "last_name") {
      lastName = value;
    } else if (key in FIELD_ALIASES) {
      const target = FIELD_ALIASES[key];
      if (!lead[target]) lead[target] = value;
    } else {
      extras.push(`${field.name}: ${value}`);
    }
  }

  if (lastName) lead.name = [lead.name, lastName].filter(Boolean).join(" ");
  if (extras.length) lead.notes = extras.join("\n");
  return lead;
}

/** Constant-time check of Meta's X-Hub-Signature-256 header against the raw body. */
export function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const provided = header.slice("sha256=".length);
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided, "utf8"), Buffer.from(expected, "utf8"));
}

function customerAutoText(name: string | null) {
  const first = (name || "").trim().split(/\s+/)[0];
  const hi = first ? `Hi ${first}` : "Hi";
  return (
    `${hi}, thanks for reaching out to 805 Shutters! We received your request and will call you shortly. ` +
    `Want to pick your own time? Book your free in-home consultation here: https://www.805shutters.com/book-consultation/ ` +
    `Reply STOP to opt out.`
  );
}

function staffSmsRecipients() {
  const extra = (process.env.CRM_APPOINTMENT_ALERT_SMS_NUMBERS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const numbers = [...defaultStaffSmsNumbers, ...extra]
    .map((item) => toE164(item))
    .filter((item): item is string => Boolean(item));
  return numbers.filter((item, index) => numbers.indexOf(item) === index);
}

// Webhook subscription handshake.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const verifyToken = process.env.META_LEADS_VERIFY_TOKEN;
  if (
    verifyToken &&
    params.get("hub.mode") === "subscribe" &&
    params.get("hub.verify_token") === verifyToken
  ) {
    return new NextResponse(params.get("hub.challenge") || "", { status: 200 });
  }
  return NextResponse.json({ message: "Verification failed." }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const appSecret = process.env.META_APP_SECRET;
  const pageToken = process.env.META_PAGE_ACCESS_TOKEN;
  const rawBody = await request.text();

  if (!appSecret || !pageToken) {
    console.error("meta-leads webhook hit while unconfigured");
    return NextResponse.json({ message: "Not configured." }, { status: 200 });
  }

  if (!verifyMetaSignature(rawBody, request.headers.get("x-hub-signature-256"), appSecret)) {
    return NextResponse.json({ message: "Invalid signature." }, { status: 403 });
  }

  let body: {
    entry?: { changes?: { field?: string; value?: { leadgen_id?: string; form_id?: string; page_id?: string } }[] }[];
  };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ message: "Invalid JSON." }, { status: 400 });
  }

  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return NextResponse.json({ message: "Storage not configured." }, { status: 200 });
  }

  const leadgenIds = (body.entry || [])
    .flatMap((entry) => entry.changes || [])
    .filter((change) => change.field === "leadgen" && change.value?.leadgen_id)
    .map((change) => ({ leadgenId: String(change.value!.leadgen_id), formId: change.value?.form_id || null }));

  for (const { leadgenId, formId } of leadgenIds) {
    try {
      // One lead per leadgen_id, even across Meta's webhook retries.
      const { data: existing } = await supabase
        .from("leads")
        .select("id")
        .eq("meta->>fb_leadgen_id", leadgenId)
        .maybeSingle();
      if (existing) continue;

      const detailUrl = new URL(`https://graph.facebook.com/v20.0/${leadgenId}`);
      detailUrl.searchParams.set("fields", "field_data,created_time,ad_id,campaign_id,form_id");
      detailUrl.searchParams.set("access_token", pageToken);
      const detailRes = await fetch(detailUrl);
      if (!detailRes.ok) {
        console.error("meta-leads fetch failed", leadgenId, detailRes.status, await detailRes.text());
        continue;
      }
      const detail = (await detailRes.json()) as {
        field_data?: MetaFieldDatum[];
        created_time?: string;
        ad_id?: string;
        campaign_id?: string;
        form_id?: string;
      };

      const mapped = mapMetaFieldData(detail.field_data);
      if (!mapped.phone && !mapped.email) {
        console.error("meta-leads lead had no contact info", leadgenId);
        continue;
      }

      const leadRecord = {
        source: "facebook_lead_form",
        lead_source: classifyLeadSource({ utmSource: "facebook", utmMedium: "paid" }),
        name: mapped.name || "Facebook Lead",
        phone: mapped.phone || "",
        email: mapped.email,
        city: mapped.city,
        interest: "consultation",
        notes: mapped.notes,
        page_path: null,
        utm_source: "facebook",
        utm_medium: "paid",
        utm_campaign: detail.campaign_id || null,
        utm_content: detail.ad_id || null,
        utm_term: null,
        meta: {
          source: "meta-lead-ads",
          fb_leadgen_id: leadgenId,
          fb_form_id: detail.form_id || formId,
          fb_created_time: detail.created_time || null,
          receivedAt: new Date().toISOString()
        }
      };

      let { data, error } = await supabase.from("leads").insert(leadRecord).select("id").single();
      if (error && isMissingLeadSourceColumnError(error)) {
        const { lead_source: _leadSource, ...withoutLeadSource } = leadRecord;
        ({ data, error } = await supabase.from("leads").insert(withoutLeadSource).select("id").single());
      }
      if (error || !data) {
        console.error("meta-leads storage failed", leadgenId, error?.message);
        continue;
      }

      // Speed to lead: instant text to the customer, alert to staff. Both are
      // best-effort - the lead is already stored.
      if (mapped.phone) {
        await sendSms({ to: mapped.phone, body: customerAutoText(mapped.name) });
      }
      const staffBody =
        `New Facebook lead: ${leadRecord.name}` +
        `${mapped.phone ? ` ${mapped.phone}` : ""}${mapped.city ? ` (${mapped.city})` : ""}. ` +
        `Auto-text sent - call them while it's hot.`;
      for (const to of staffSmsRecipients()) {
        await sendSms({ to, body: staffBody });
      }
    } catch (error) {
      console.error("meta-leads processing failed", leadgenId, error);
    }
  }

  return NextResponse.json({ received: leadgenIds.length });
}
