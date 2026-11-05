import { createHash } from "node:crypto";
import { after, NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import { losAngelesDateString, zonedTimeToUtc } from "@/lib/booking/availability";
import { BookingError, readSchedule, scheduleError } from "@/lib/booking/scheduling";
import { requestSlotReason, requestSlotTimes } from "@/lib/booking/time-requests";
import { processBookingOutbox } from "@/lib/booking/delivery";
import { classifyLeadSource, withLeadSourceMeta } from "@/lib/lead-source";
import { productInterestOptions } from "@/lib/product-interest-options";
import { salesRepSmsNumberForName } from "@/lib/crm/calendar-notifications";
import { isTwilioConfigured } from "@/lib/notify/twilio";
import { isBookingDeliveryEnabled } from "@/lib/booking/delivery-config";
import { toE164 } from "@/lib/notify/phone";

export const runtime = "nodejs";
const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";

export async function POST(request: NextRequest) {
  try {
    // JSON-only and same-origin browser requests; recipient and status are never
    // accepted from the caller. The RPC also bounds repeated customer requests.
    const origin = request.headers.get("origin");
    if (origin && origin !== request.nextUrl.origin)
      throw new BookingError(403, "Please request a time from the booking page.");
    if (!request.headers.get("content-type")?.includes("application/json"))
      throw new BookingError(400, "Please submit the request form.");
    const raw = await request.text();
    if (raw.length > 20000) throw new BookingError(400, "Please shorten your request.");
    const p = JSON.parse(raw);
    if (!p || typeof p !== "object" || Array.isArray(p)) throw new BookingError(400, "Please complete the request form.");
    const date = clean(p.date), time = clean(p.time), name = clean(p.name),
      phone = toE164(clean(p.phone)), address = clean(p.address), email = clean(p.email), notes = clean(p.notes);
    if (p.variant && p.variant !== "standard") throw new BookingError(400, "Time requests are for residential consultations.");
    if (!/^20\d{2}-(0[1-9]|1[0-2])-\d{2}$/.test(date) || !requestSlotTimes.includes(time) ||
      losAngelesDateString(zonedTimeToUtc(date, time)) !== date)
      throw new BookingError(400, "Choose a valid time from 8 AM to 6 PM.");
    if (!name || name.length > 160 || !phone || address.length < 8 || address.length > 512 || notes.length > 2000 ||
      (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))))
      throw new BookingError(400, "Enter your full name, phone and complete service address. Check your email if provided.");
    const key = clean(p.idempotencyKey);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key))
      throw new BookingError(400, "Reload the request form and try again.");
    const windowCount = p.windowCount == null || p.windowCount === "" ? null : Number(p.windowCount);
    if (windowCount !== null && (!Number.isInteger(windowCount) || windowCount < 1 || windowCount > 10000))
      throw new BookingError(400, "Choose an approximate window quantity, or leave it blank.");
    const productTypes = Array.isArray(p.productTypes) ? productInterestOptions.filter(item => p.productTypes.includes(item)) : [];
    const productInterest = productTypes.join(", ") || "consultation";
    const pagePath = clean(p.pagePath).startsWith("/") && !clean(p.pagePath).startsWith("//") ? clean(p.pagePath).slice(0, 240) : "/book-consultation/";
    const attribution = Object.fromEntries(["utm_source","utm_medium","utm_campaign","utm_content","utm_term"].map(k => [k, clean(p[k]).slice(0, 160) || null]));
    const gclid = clean(p.gclid).slice(0,160), referrer = clean(p.referrer).slice(0,500);
    const details = { name, phone, address, email, notes, windowCount, productTypes, productInterest, appointmentDurationMinutes: 60 };
    const hash = createHash("sha256").update(JSON.stringify({ mode: "time_request", date, time, ...details, pagePath, attribution, gclid, referrer })).digest("hex");
    const supabase = getSupabaseServiceClient();
    if (!supabase) throw new BookingError(503, "Requests are temporarily unavailable. Please try again.");
    const { data: prior, error: priorError } = await supabase.from("booking_requests").select("request_hash,response").eq("key", key).maybeSingle();
    if (priorError) scheduleError(priorError);
    if (prior) {
      if (prior.request_hash !== hash) throw new BookingError(409, "This request has changed. Please submit a new request.");
      return NextResponse.json(prior.response, { headers: { "Cache-Control": "no-store" } });
    }
    if (isBookingDeliveryEnabled() && (!toE164(salesRepSmsNumberForName("Mike")) || !isTwilioConfigured()))
      throw new BookingError(503, "Time requests are temporarily unavailable. Please text 805-806-9344.");
    const snapshot = await readSchedule(supabase, date.slice(0, 7));
    if (snapshot.revision !== p.revision || requestSlotReason(date, time, snapshot.events))
      throw new BookingError(409, "The calendar changed. Choose an open time; your details are saved.");
    const bookingNotes = ["CONSULTATION TIME REQUEST — awaiting owner confirmation. No appointment reserved.",
      `Requested: ${date} at ${time} Pacific · 1 hour`, `Address: ${address}`,
      productTypes.length ? `Coverings: ${productInterest}` : null,
      windowCount ? `Approximate windows: ${windowCount}` : null, notes ? `Customer notes: ${notes}` : null].filter(Boolean).join("\n");
    const lead = withLeadSourceMeta({ page_path: pagePath, ...attribution,
      lead_source: classifyLeadSource({ utmSource: attribution.utm_source, utmMedium: attribution.utm_medium, gclid, referrer }),
      meta: { address, windowCount, productTypes, notes, pagePath, attribution, gclid, referrer } });
    const { data, error } = await supabase.rpc("booking_request_time", {
      p_key: key, p_hash: hash, p_revision: snapshot.revision, p_start: zonedTimeToUtc(date, time).toISOString(),
      p_lead: lead, p_details: { ...details, bookingNotes },
    });
    if (error?.message?.includes("BOOKING_REQUEST_LIMIT")) throw new BookingError(429, "Your requests are saved. Please wait for us to contact you, or text 805-806-9344.");
    if (error) scheduleError(error);
    after(async () => { try { await processBookingOutbox(supabase, key); } catch { console.error("Time request notification remains queued"); } });
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ message: error instanceof BookingError ? error.message : "Your request could not be saved. Please try again." }, {
      status: error instanceof BookingError ? error.status : error instanceof SyntaxError ? 400 : 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
