import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CrmAvailabilitySlot, CrmCalendarEvent } from "@/lib/crm/types";
import {
  baseSlotReason,
  bookingDurationForWindowCount,
  bookingEndIso,
  buildBookingAvailability,
  isCanceled,
  losAngelesDateString,
  zonedTimeToUtc,
  type UnavailableReason,
} from "./availability";
import { geocodeBookingAddress } from "./geo";
import {
  checkVisitTravel,
  eventSignature,
  googleDriveEstimator,
  type DriveEstimator,
  type RouteProof,
} from "./travel";

export class BookingError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export type ScheduleSnapshot = {
  revision: string;
  events: CrmCalendarEvent[];
  slots: CrmAvailabilitySlot[];
  protectedIds: string[];
};
export function scheduleError(error: { message?: string } | null): never {
  if (/BOOKING_/.test(error?.message || ""))
    throw new BookingError(
      409,
      "Calendar changed or driving time no longer fits. Reload the calendar and choose an available time.",
    );
  throw new BookingError(
    503,
    "Scheduling could not be verified. Please try again or call 805 Shutters.",
  );
}
export function validMonth(month: string) {
  return /^20\d{2}-(0[1-9]|1[0-2])$/.test(month);
}
export async function readSchedule(
  supabase: SupabaseClient,
  month: string,
): Promise<ScheduleSnapshot> {
  if (!validMonth(month))
    throw new BookingError(400, "Choose a valid calendar month.");
  const { data, error } = await supabase.rpc("booking_schedule_snapshot", {
    p_month: month,
  });
  if (
    error ||
    !data ||
    !Array.isArray(data.events) ||
    !Array.isArray(data.slots) ||
    !Array.isArray(data.protectedIds) ||
    typeof data.revision !== "string"
  )
    scheduleError(error);
  return data as ScheduleSnapshot;
}
export async function validateServiceAddress(address: string) {
  if (!address.trim() || address.length > 512)
    throw new BookingError(
      400,
      "Enter a complete street address before choosing an appointment.",
    );
  try {
    const result = await geocodeBookingAddress(address);
    if (!result.configured)
      throw new BookingError(
        503,
        "Address and driving checks are temporarily unavailable.",
      );
    if (!result.point)
      throw new BookingError(
        400,
        "Choose a complete, unambiguous street address so driving time can be checked.",
      );
    return result;
  } catch (error) {
    if (error instanceof BookingError) throw error;
    throw new BookingError(
      503,
      "Address and driving checks are temporarily unavailable.",
    );
  }
}
export function candidateVisit(
  date: string,
  time: string,
  address: string,
  windowCount: number,
  id: string = randomUUID(),
) {
  return {
    id,
    title: "Consultation",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    job_id: null,
    notes: null,
    start_at: zonedTimeToUtc(date, time).toISOString(),
    end_at: bookingEndIso(
      date,
      time,
      bookingDurationForWindowCount(windowCount),
    ),
    assigned_to: "Jessica",
    event_type: "sales_consult",
    status: "scheduled",
    location: address,
    meta: { windowCount },
  } as CrmCalendarEvent;
}

export async function projectedProofs(
  snapshot: ScheduleSnapshot,
  projected: CrmCalendarEvent[],
  days: Set<string>,
  newId: string | null,
  drive: DriveEstimator,
  now: Date,
): Promise<{ reason: UnavailableReason | null; proofs: RouteProof[] }> {
  const ids = new Set(snapshot.protectedIds.concat(newId ? [newId] : []));
  const targets = projected.filter(
    (e) =>
      ids.has(e.id) &&
      !isCanceled(e) &&
      Date.parse(e.end_at) >= now.getTime() &&
      days.has(losAngelesDateString(new Date(e.start_at))),
  );
  const proofs: RouteProof[] = [];
  for (const event of targets) {
    const result = await checkVisitTravel(event, projected, drive, now);
    if (result.reason || !result.proof)
      return { reason: result.reason || "missing_information", proofs: [] };
    proofs.push(result.proof);
  }
  return { reason: null, proofs };
}
export async function checkCandidate(
  snapshot: ScheduleSnapshot,
  event: CrmCalendarEvent,
  drive: DriveEstimator,
  now = new Date(),
) {
  const date = losAngelesDateString(new Date(event.start_at));
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(event.start_at));
  const reason = baseSlotReason(date, time, snapshot.events, snapshot.slots, {
    now,
    appointmentDurationMinutes:
      (Date.parse(event.end_at) - Date.parse(event.start_at)) / 60000,
  });
  if (reason) return { reason, proofs: [] as RouteProof[] };
  return projectedProofs(
    snapshot,
    [...snapshot.events, event],
    new Set([date]),
    event.id,
    drive,
    now,
  );
}
export async function customerAvailability(
  supabase: SupabaseClient,
  month: string,
  address: string,
  windowCount: number,
  staff = false,
) {
  if (
    !validMonth(month) ||
    !Number.isInteger(windowCount) ||
    windowCount < 1 ||
    windowCount > 10000
  )
    throw new BookingError(
      400,
      "Choose a month and the approximate number of windows.",
    );
  const resolved = await validateServiceAddress(address);
  const snapshot = await readSchedule(supabase, month);
  const now = new Date();
  const drive = googleDriveEstimator(now);
  const duration = bookingDurationForWindowCount(windowCount);
  const result = buildBookingAvailability(
    month,
    snapshot.events,
    snapshot.slots,
    { now, appointmentDurationMinutes: duration },
  );
  // Bound concurrent Google calls; per-request cache shares identical legs.
  const work = result.days.flatMap((day) =>
    day.slots.map((slot) => ({ day, slot })),
  );
  let cursor = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (cursor < work.length) {
        const { day, slot } = work[cursor++];
        if (slot.available) {
          const checked = await checkCandidate(
            snapshot,
            candidateVisit(
              day.date,
              slot.time,
              resolved.formattedAddress || address,
              windowCount,
            ),
            drive,
            now,
          );
          slot.available = !checked.reason;
          slot.reason = checked.reason;
        }
      }
    }),
  );
  for (const day of result.days)
    day.available = day.slots.some((s) => s.available);
  if (
    Date.now() - now.getTime() > 90000 ||
    (await readSchedule(supabase, month)).revision !== snapshot.revision
  )
    throw new BookingError(
      409,
      "Calendar changed while checking driving time. Please refresh availability.",
    );
  return {
    ...result,
    days: result.days.map((d) => ({
      ...d,
      slots: d.slots.map((s) =>
        staff ? s : { time: s.time, label: s.label, available: s.available },
      ),
    })),
    configured: true,
    revision: snapshot.revision,
    expiresAt: new Date(Date.now() + 30000).toISOString(),
    appointmentDurationMinutes: duration,
  };
}

export async function writeCalendarWithRoutes(
  supabase: SupabaseClient,
  operation: "insert" | "update",
  record: Record<string, unknown>,
  existing?: CrmCalendarEvent,
) {
  const merged = {
    ...existing,
    ...record,
    id: record.id || existing?.id || randomUUID(),
  } as CrmCalendarEvent;
  const months = [
    ...new Set(
      [merged.start_at, existing?.start_at]
        .filter(Boolean)
        .map((d) => losAngelesDateString(new Date(d!)).slice(0, 7)),
    ),
  ];
  const snapshots: ScheduleSnapshot[] = [];
  for (const month of months)
    snapshots.push(await readSchedule(supabase, month));
  if (snapshots.some((s) => s.revision !== snapshots[0].revision))
    throw new BookingError(409, "Calendar changed. Reload and retry.");
  const snapshot: ScheduleSnapshot = {
    revision: snapshots[0].revision,
    slots: snapshots.flatMap((s) => s.slots),
    protectedIds: [...new Set(snapshots.flatMap((s) => s.protectedIds))],
    events: [
      ...new Map(
        snapshots.flatMap((s) => s.events).map((e) => [e.id, e]),
      ).values(),
    ],
  };
  if (operation === "update" && existing) {
    const current = snapshot.events.find((e) => e.id === existing.id);
    if (
      !current ||
      JSON.stringify(eventSignature(current)) !==
        JSON.stringify(eventSignature(existing)) ||
      current.status !== existing.status ||
      JSON.stringify(current.meta) !== JSON.stringify(existing.meta)
    )
      throw new BookingError(
        409,
        "This appointment changed. Reload it before saving.",
      );
  }
  const projected = [
    ...snapshot.events.filter((e) => e.id !== merged.id),
    merged,
  ];
  const days = new Set(
    [merged.start_at, existing?.start_at]
      .filter(Boolean)
      .map((d) => losAngelesDateString(new Date(d!))),
  );
  const now = new Date();
  const checked = await projectedProofs(
    snapshot,
    projected,
    days,
    null,
    googleDriveEstimator(now),
    now,
  );
  if (checked.reason)
    throw new BookingError(
      409,
      `Appointment cannot be saved: ${checked.reason.replaceAll("_", " ")}. Check Jessica's calendar and addresses.`,
    );
  const { data, error } = await supabase.rpc("booking_calendar_write", {
    p_revision: snapshot.revision,
    p_operation: operation,
    p_event: merged,
    p_proofs: checked.proofs,
  });
  if (error) scheduleError(error);
  return data as CrmCalendarEvent;
}
