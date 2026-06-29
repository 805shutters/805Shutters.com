import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "@/lib/crm/auth";
import { recordCrmActivity } from "@/lib/crm/backend";
import type { CrmCalendarEvent } from "@/lib/crm/types";
import { sendSms, type SmsResult } from "@/lib/notify/twilio";
import { zonedTimeToUtc } from "@/lib/booking/availability";

export type MobileAppointmentScope = "my" | "all";

export type MobileAppointmentRange = {
  startDate: string;
  endDate: string;
  startAt: string;
  endAt: string;
};

export type DriveEta = {
  minutes: number;
  text: string;
  distance: string | null;
};

export type MobileEtaResult = {
  message: string;
  messageSent: boolean;
  sms: SmsResult;
  eta: DriveEta | null;
  etaCalculationFailed: boolean;
};

type FetchLike = typeof fetch;

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const maxMobileRangeDays = 93;

export function crmMobileOwnerForEmail(email: string | null | undefined): string | null {
  const normalized = String(email || "").trim().toLowerCase();
  if (normalized === "jessica@805shutters.com") return "Jessica";
  if (normalized === "805shutters@gmail.com") return "Mike";
  return null;
}

export function normalizeMobileAppointmentScope(value: string | null | undefined): MobileAppointmentScope {
  return value === "my" ? "my" : "all";
}

function parseIsoDate(value: string | null | undefined) {
  if (!value || !datePattern.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return value;
}

export function addMobileCalendarDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
  return date.toISOString().slice(0, 10);
}

function mobileCalendarDayDiff(startDate: string, endDate: string) {
  const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
  const [endYear, endMonth, endDay] = endDate.split("-").map(Number);
  const start = Date.UTC(startYear, startMonth - 1, startDay, 12, 0, 0);
  const end = Date.UTC(endYear, endMonth - 1, endDay, 12, 0, 0);
  return Math.round((end - start) / 86400000);
}

export function parseMobileAppointmentRange(
  start: string | null | undefined,
  end: string | null | undefined
): MobileAppointmentRange {
  const startDate = parseIsoDate(start);
  const endDate = parseIsoDate(end);

  if (!startDate || !endDate) {
    throw new CrmAuthError(400, "Start and end dates must use YYYY-MM-DD.");
  }

  const days = mobileCalendarDayDiff(startDate, endDate);
  if (days <= 0) {
    throw new CrmAuthError(400, "End date must be after start date.");
  }

  if (days > maxMobileRangeDays) {
    throw new CrmAuthError(400, "Mobile appointment range cannot exceed 93 days.");
  }

  return {
    startDate,
    endDate,
    startAt: zonedTimeToUtc(startDate, "00:00").toISOString(),
    endAt: zonedTimeToUtc(endDate, "00:00").toISOString()
  };
}

export function filterMobileAppointments(
  events: CrmCalendarEvent[],
  email: string | null | undefined,
  scope: MobileAppointmentScope
) {
  const activeEvents = events.filter((event) => event.status === "scheduled" || event.status === "rescheduled");
  if (scope === "all") return activeEvents;

  const owner = crmMobileOwnerForEmail(email);
  if (!owner) return [];

  return activeEvents.filter((event) => event.assigned_to.trim().toLowerCase() === owner.toLowerCase());
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function numberValue(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function mobileAppointmentWindowCount(event: CrmCalendarEvent) {
  const meta = recordValue(event.meta);
  return numberValue(meta?.windowCount ?? meta?.window_count ?? meta?.windows);
}

export function mobileAppointmentDurationMinutes(event: CrmCalendarEvent) {
  const explicit = numberValue(recordValue(event.meta)?.appointmentDurationMinutes);
  if (explicit) return explicit;

  const start = new Date(event.start_at);
  const end = new Date(event.end_at);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) return null;
  return Math.round((end.getTime() - start.getTime()) / 60000);
}

export function customerFirstName(customerName: string | null | undefined) {
  const cleaned = String(customerName || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "there";
  return cleaned.split(",")[0]?.split(" ")[0] || "there";
}

export function buildMobileEtaSms(input: { customerName?: string | null; etaMinutes?: number | null }) {
  const firstName = customerFirstName(input.customerName);
  return `Hi ${firstName}, we're in route for your window covering consultation. See you shortly!\n\n805 Shutters`;
}

export async function calculateMobileDriveEta(input: {
  installerLat: number;
  installerLng: number;
  customerAddress: string;
  fetchImpl?: FetchLike;
  mapsApiKey?: string | null;
}): Promise<DriveEta | null> {
  const mapsApiKey = input.mapsApiKey ?? process.env.GOOGLE_MAPS_API_KEY ?? null;
  if (!mapsApiKey) return null;

  const fetchImpl = input.fetchImpl || fetch;
  const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
  url.searchParams.set("origins", `${input.installerLat},${input.installerLng}`);
  url.searchParams.set("destinations", input.customerAddress);
  url.searchParams.set("departure_time", "now");
  url.searchParams.set("key", mapsApiKey);

  try {
    const response = await fetchImpl(url);
    const data = (await response.json()) as {
      status?: string;
      rows?: Array<{
        elements?: Array<{
          status?: string;
          duration?: { value?: number; text?: string };
          duration_in_traffic?: { value?: number; text?: string };
          distance?: { text?: string };
        }>;
      }>;
    };

    const element = data.status === "OK" ? data.rows?.[0]?.elements?.[0] : null;
    if (element?.status !== "OK") return null;

    const duration = element.duration_in_traffic || element.duration;
    const seconds = Number(duration?.value);
    if (!Number.isFinite(seconds) || seconds <= 0) return null;

    return {
      minutes: Math.ceil(seconds / 60),
      text: duration?.text || `${Math.ceil(seconds / 60)} mins`,
      distance: element.distance?.text || null
    };
  } catch (error) {
    console.warn("805 mobile appointment ETA failed.", error);
    return null;
  }
}

export function assertEtaCoordinates(value: unknown) {
  const record = recordValue(value);
  const installerLat = numberValue(record?.installerLat);
  const installerLng = numberValue(record?.installerLng);

  if (installerLat === null || installerLng === null) {
    throw new CrmAuthError(400, "Installer location is required.");
  }

  if (installerLat < -90 || installerLat > 90 || installerLng < -180 || installerLng > 180) {
    throw new CrmAuthError(400, "Installer location is invalid.");
  }

  return { installerLat, installerLng };
}

export async function sendMobileAppointmentEta(input: {
  supabase: SupabaseClient;
  actor: { email: string; userId?: string | null };
  event: CrmCalendarEvent;
  installerLat: number;
  installerLng: number;
  fetchImpl?: FetchLike;
}): Promise<MobileEtaResult> {
  const event = input.event;
  const customerPhone = event.customer_phone;
  const customerAddress = event.customer_address || event.location;
  if (!customerPhone || !customerAddress) {
    throw new CrmAuthError(400, "Customer phone and address are required.");
  }

  const eta = await calculateMobileDriveEta({
    installerLat: input.installerLat,
    installerLng: input.installerLng,
    customerAddress,
    fetchImpl: input.fetchImpl
  });
  const message = buildMobileEtaSms({
    customerName: event.customer_name || event.title,
    etaMinutes: eta?.minutes || null
  });
  const sms = await sendSms({ to: customerPhone, body: message });
  const messageSent = sms.sent === true;

  await recordCrmActivity(input.supabase, { email: input.actor.email, userId: input.actor.userId || undefined }, {
    entityType: "calendar_event",
    entityId: event.id,
    action: messageSent ? "eta_sms.sent" : "eta_sms.failed",
    metadata: {
      jobId: event.job_id || null,
      appointmentId: event.id,
      message,
      sms,
      eta,
      etaCalculationFailed: eta === null,
      customerPhone,
      customerAddress,
      installerLat: input.installerLat,
      installerLng: input.installerLng,
      source: "crm_mobile"
    }
  });

  return {
    message,
    messageSent,
    sms,
    eta,
    etaCalculationFailed: eta === null
  };
}
