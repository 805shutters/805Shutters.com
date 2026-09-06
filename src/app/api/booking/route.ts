import { createHash, randomUUID } from "node:crypto";
import { after, NextRequest, NextResponse } from "next/server";
import {
  bookingEndIso,
  bookingDurationForWindowCount,
  bookingSlotTimes,
  losAngelesDateString,
  zonedTimeToUtc,
} from "@/lib/booking/availability";
import {
  BookingError,
  candidateVisit,
  checkCandidate,
  readSchedule,
  scheduleError,
  validateServiceAddress,
} from "@/lib/booking/scheduling";
import { googleDriveEstimator } from "@/lib/booking/travel";
import {
  bookingEffectKinds,
  processBookingOutbox,
} from "@/lib/booking/delivery";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import { classifyLeadSource, withLeadSourceMeta } from "@/lib/lead-source";
import {
  commercialProjectTypeOptions,
  productInterestOptions,
} from "@/lib/product-interest-options";
export const runtime = "nodejs";
type BookingPayload = {
  idempotencyKey?: string;
  revision?: string;
  date?: string;
  time?: string;
  name?: string;
  phone?: string;
  address?: string;
  windowCount?: string | number;
  email?: string;
  productTypes?: string[] | string;
  notes?: string;
  followUpRequested?: boolean;
  pagePath?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  gclid?: string;
  referrer?: string;
  landingPath?: string;
};

const allowedProductTypes = new Map<string, string>(
  [...productInterestOptions, ...commercialProjectTypeOptions].map((label) => [
    label.toLowerCase(),
    label,
  ]),
);

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanPagePath(value: unknown) {
  const pagePath = clean(value);
  return pagePath.startsWith("/") && !pagePath.startsWith("//")
    ? pagePath.slice(0, 240)
    : "/book-consultation/";
}

function cleanAttributionValue(value: unknown) {
  return clean(value).slice(0, 160) || null;
}

function splitList(value: string | undefined) {
  return (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueItems<T>(items: T[]) {
  return Array.from(new Set(items));
}

function normalizeProductTypes(value: unknown) {
  const rawItems = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  return uniqueItems(
    rawItems
      .map((item) => allowedProductTypes.get(String(item).trim().toLowerCase()))
      .filter((item): item is string => Boolean(item)),
  );
}

function formatDuration(minutes: number) {
  const hours = minutes / 60;
  return Number.isInteger(hours)
    ? `${hours} hour${hours === 1 ? "" : "s"}`
    : `${minutes} minutes`;
}

async function submit(request: NextRequest) {
  const payload = (await request.json()) as BookingPayload;
  const date = clean(payload.date);
  const time = clean(payload.time);
  const name = clean(payload.name);
  const phone = clean(payload.phone);
  const address = clean(payload.address);
  const email = clean(payload.email);
  const notes = clean(payload.notes);
  const parsedWindowCount = Number(payload.windowCount || 0);
  const windowCount = Number.isFinite(parsedWindowCount)
    ? Math.max(0, Math.ceil(parsedWindowCount))
    : 0;
  const appointmentDurationMinutes = bookingDurationForWindowCount(windowCount);
  const productTypes = normalizeProductTypes(payload.productTypes);
  const productInterest = productTypes.length
    ? productTypes.join(", ")
    : "consultation";
  const followUpRequested = payload.followUpRequested === true;
  const pagePath = cleanPagePath(payload.pagePath);
  const attribution = {
    utm_source: cleanAttributionValue(payload.utm_source),
    utm_medium: cleanAttributionValue(payload.utm_medium),
    utm_campaign: cleanAttributionValue(payload.utm_campaign),
    utm_content: cleanAttributionValue(payload.utm_content),
    utm_term: cleanAttributionValue(payload.utm_term),
  };
  const gclid = cleanAttributionValue(payload.gclid);
  const landingReferrer = cleanAttributionValue(payload.referrer);
  const leadSource = classifyLeadSource({
    utmSource: attribution.utm_source,
    utmMedium: attribution.utm_medium,
    gclid,
    referrer: landingReferrer,
  });

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return NextResponse.json(
      { message: "Choose an appointment date and time." },
      { status: 400 },
    );
  }

  if (
    !bookingSlotTimes.includes(time) ||
    losAngelesDateString(zonedTimeToUtc(date, time)) !== date
  )
    throw new BookingError(400, "Choose a valid appointment date and time.");

  if (!name || !phone || !address) {
    return NextResponse.json(
      { message: "Full name, phone, and address are required." },
      { status: 400 },
    );
  }

  if (windowCount <= 0 || windowCount > 10000) {
    return NextResponse.json(
      {
        message:
          "Choose the approximate number of window coverings before selecting an appointment.",
      },
      { status: 400 },
    );
  }

  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return NextResponse.json(
      {
        message:
          "Scheduling is temporarily unavailable. Please call 805 Shutters.",
      },
      { status: 503 },
    );
  }

  const idempotencyKey = clean(payload.idempotencyKey);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      idempotencyKey,
    )
  )
    throw new BookingError(
      400,
      "A booking request key is required. Reload and try again.",
    );
  const requestHash = createHash("sha256")
    .update(
      JSON.stringify({
        date,
        time,
        name,
        phone,
        address,
        email,
        notes,
        windowCount,
        productTypes,
        followUpRequested,
        pagePath,
        attribution,
      }),
    )
    .digest("hex");
  const { data: prior, error: priorError } = await supabase
    .from("booking_requests")
    .select("request_hash,response")
    .eq("key", idempotencyKey)
    .maybeSingle();
  if (priorError) scheduleError(priorError);
  if (prior) {
    if (prior.request_hash !== requestHash)
      throw new BookingError(
        409,
        "This request has changed. Please start a new booking request.",
      );
    return NextResponse.json(prior.response, {
      headers: { "Cache-Control": "no-store" },
    });
  }
  const geocodeResult = await validateServiceAddress(address);
  const assignedRep = "Jessica";
  const startAt = zonedTimeToUtc(date, time).toISOString();
  const endAt = bookingEndIso(date, time, appointmentDurationMinutes);
  const bookingNotes = [
    `Self-booked appointment.`,
    followUpRequested
      ? `Customer requested a follow-up to confirm details.`
      : `Customer indicated no follow-up needed.`,
    windowCount ? `Windows: ${windowCount}` : null,
    `Estimated appointment length: ${formatDuration(appointmentDurationMinutes)}`,
    productTypes.length ? `Product interest: ${productInterest}` : null,
    notes ? `Customer notes: ${notes}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const bookingGeoMeta = {
    appointmentDurationMinutes,
    appointmentDurationLabel: formatDuration(appointmentDurationMinutes),
    bookingGeo: geocodeResult.point,
    travelRule: {
      provider: "google_routes",
      bufferMinutes: 15,
      enforced: true,
    },
  };

  const leadRecord = withLeadSourceMeta({
    source: "self_booking",
    lead_source: leadSource,
    status: "booked",
    name,
    phone,
    email: email || null,
    interest: productInterest,
    notes: bookingNotes,
    page_path: pagePath,
    ...attribution,
    meta: {
      address,
      windowCount: windowCount || null,
      ...bookingGeoMeta,
      productTypes,
      followUpRequested,
      pagePath,
      attribution,
      gclid,
      landingReferrer,
      appointmentDate: date,
      appointmentTime: time,
      userAgent: request.headers.get("user-agent"),
      referrer: request.headers.get("referer"),
      receivedAt: new Date().toISOString(),
    },
  });
  const jobRecord = withLeadSourceMeta({
    source: "self_booking",
    lead_source: leadSource,
    status: "scheduled",
    priority: "high",
    customer_name: name,
    phone,
    email: email || null,
    address,
    product_interest: productInterest,
    sales_owner: assignedRep,
    next_action: "Review self-booking and prepare appointment",
    next_action_due: date,
    appointment_start: startAt,
    appointment_end: endAt,
    notes: bookingNotes,
    meta: {
      windowCount: windowCount || null,
      ...bookingGeoMeta,
      productTypes,
      followUpRequested,
      pagePath,
      attribution,
      bookingSource: "website",
    },
  });
  const eventId = randomUUID();
  const eventRecord = {
    ...candidateVisit(date, time, address, windowCount, eventId),
    title: `${name} consultation`,
    notes: bookingNotes,
    meta: { ...jobRecord.meta, windowCount, bookingAuthority: "jessica_v1" },
  };
  const effectDetails = {
    name,
    phone,
    email,
    address,
    windowCount,
    appointmentDurationMinutes,
    productInterest,
    productTypes,
    notes,
    bookingNotes,
    followUpRequested,
    startAt,
    endAt,
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: replay, error: replayError } = await supabase
      .from("booking_requests")
      .select("request_hash,response")
      .eq("key", idempotencyKey)
      .maybeSingle();
    if (replayError) scheduleError(replayError);
    if (replay) {
      if (replay.request_hash !== requestHash)
        throw new BookingError(
          409,
          "This booking request key was already used.",
        );
      return NextResponse.json(replay.response, {
        headers: { "Cache-Control": "no-store" },
      });
    }
    const snapshot = await readSchedule(supabase, date.slice(0, 7));
    if (
      attempt === 0 &&
      (typeof payload.revision !== "string" ||
        payload.revision !== snapshot.revision)
    ) {
      const { data: completed } = await supabase
        .from("booking_requests")
        .select("request_hash,response")
        .eq("key", idempotencyKey)
        .maybeSingle();
      if (completed?.request_hash === requestHash)
        return NextResponse.json(completed.response, {
          headers: { "Cache-Control": "no-store" },
        });
      throw new BookingError(
        409,
        "Jessica's calendar changed. Please select an available time again.",
      );
    }
    const now = new Date();
    const checked = await checkCandidate(
      snapshot,
      eventRecord,
      googleDriveEstimator(now),
      now,
    );
    if (checked.reason) {
      const { data: completed } = await supabase
        .from("booking_requests")
        .select("request_hash,response")
        .eq("key", idempotencyKey)
        .maybeSingle();
      if (completed?.request_hash === requestHash)
        return NextResponse.json(completed.response, {
          headers: { "Cache-Control": "no-store" },
        });
      throw new BookingError(
        409,
        "That time no longer fits Jessica's availability and driving time. Please choose another.",
      );
    }
    const { data, error } = await supabase.rpc("booking_commit", {
      p_key: idempotencyKey,
      p_hash: requestHash,
      p_revision: snapshot.revision,
      p_lead: leadRecord,
      p_job: jobRecord,
      p_event: eventRecord,
      p_proofs: checked.proofs,
      p_effects: bookingEffectKinds.map((kind) => ({
        kind,
        payload: effectDetails,
      })),
    });
    if (error?.message?.includes("BOOKING_STALE") && attempt === 0) continue;
    if (error) scheduleError(error);
    after(async () => {
      try {
        await processBookingOutbox(supabase, idempotencyKey);
      } catch {
        console.error("Booking outbox remains queued");
      }
    });
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  }
  throw new BookingError(
    409,
    "Calendar changed. Please choose an available time.",
  );
}

export async function POST(request: NextRequest) {
  try {
    return await submit(request);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof BookingError
            ? error.message
            : "Booking could not be verified. Please try again.",
      },
      {
        status:
          error instanceof BookingError
            ? error.status
            : error instanceof SyntaxError
              ? 400
              : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
