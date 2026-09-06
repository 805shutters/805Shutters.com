import type { CrmCalendarEvent } from "@/lib/crm/types";
import {
  affectsJessica,
  isCanceled,
  losAngelesDateString,
  type UnavailableReason,
} from "./availability";
import { geocodeBookingAddress, type BookingGeoPoint } from "./geo";

export const travelBufferMinutes = 15;
export type EventSignature = [string, number, number, string, string, string];
export type TravelLeg = {
  id: string;
  signature: EventSignature;
  departureAt: string;
  seconds: number;
};
export type RouteProof = {
  eventId: string;
  signature: EventSignature;
  checkedAt: string;
  previous: TravelLeg | null;
  next: TravelLeg | null;
};
export type DriveEstimator = (
  from: string,
  to: string,
  departure: Date,
) => Promise<number | null>;
export function eventSignature(e: CrmCalendarEvent): EventSignature {
  return [
    e.id,
    Date.parse(e.start_at),
    Date.parse(e.end_at),
    e.assigned_to.trim().toLowerCase(),
    e.event_type,
    (e.location || "").trim(),
  ];
}

export function googleDriveEstimator(now = new Date()): DriveEstimator {
  const points = new Map<string, Promise<BookingGeoPoint | null>>();
  const routes = new Map<string, Promise<number | null>>();
  const point = (address: string) => {
    if (!points.has(address))
      points.set(
        address,
        geocodeBookingAddress(address)
          .then((r) => r.point)
          .catch(() => null),
      );
    return points.get(address)!;
  };
  return (from, to, departure) => {
    const departureAt = new Date(Math.max(now.getTime(), departure.getTime()));
    const key = JSON.stringify([from, to, departureAt.toISOString()]);
    if (!routes.has(key))
      routes.set(
        key,
        (async () => {
          if (!process.env.GOOGLE_MAPS_API_KEY) return null;
          const [origin, destination] = await Promise.all([
            point(from),
            point(to),
          ]);
          if (!origin || !destination) return null;
          try {
            const response = await fetch(
              "https://routes.googleapis.com/directions/v2:computeRoutes",
              {
                method: "POST",
                cache: "no-store",
                signal: AbortSignal.timeout(8000),
                headers: {
                  "Content-Type": "application/json",
                  "X-Goog-Api-Key": process.env.GOOGLE_MAPS_API_KEY!,
                  "X-Goog-FieldMask": "routes.duration,fallbackInfo",
                },
                body: JSON.stringify({
                  origin: {
                    location: {
                      latLng: { latitude: origin.lat, longitude: origin.lng },
                    },
                  },
                  destination: {
                    location: {
                      latLng: {
                        latitude: destination.lat,
                        longitude: destination.lng,
                      },
                    },
                  },
                  travelMode: "DRIVE",
                  routingPreference: "TRAFFIC_AWARE_OPTIMAL",
                  trafficModel: "BEST_GUESS",
                  departureTime: departureAt.toISOString(),
                }),
              },
            );
            if (!response.ok) return null;
            const data = await response.json();
            // A degraded/non-traffic fallback cannot be used as trusted travel evidence.
            if (
              data.fallbackInfo ||
              !/^\d+(\.\d+)?s$/.test(data.routes?.[0]?.duration || "")
            )
              return null;
            const seconds = Math.ceil(
              Number(data.routes[0].duration.slice(0, -1)),
            );
            return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
          } catch {
            return null;
          }
        })(),
      );
    return routes.get(key)!;
  };
}

export async function checkVisitTravel(
  event: CrmCalendarEvent,
  events: CrmCalendarEvent[],
  drive: DriveEstimator,
  now = new Date(),
): Promise<{ reason: UnavailableReason | null; proof?: RouteProof }> {
  const start = Date.parse(event.start_at),
    end = Date.parse(event.end_at);
  if (
    !event.location?.trim() ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start
  )
    return { reason: "missing_information" };
  const day = losAngelesDateString(new Date(start));
  const active = events.filter(
    (e) => e.id !== event.id && !isCanceled(e) && affectsJessica(e),
  );
  if (
    active.some(
      (e) =>
        !Number.isFinite(Date.parse(e.start_at)) ||
        !Number.isFinite(Date.parse(e.end_at)) ||
        Date.parse(e.end_at) <= Date.parse(e.start_at),
    )
  )
    return { reason: "missing_information" };
  if (
    active.some(
      (e) => Date.parse(e.start_at) < end && Date.parse(e.end_at) > start,
    )
  )
    return { reason: "appointment_conflict" };
  const visits = active.filter(
    (e) =>
      e.event_type !== "block" &&
      losAngelesDateString(new Date(e.start_at)) === day,
  );
  const previous = visits
    .filter((e) => Date.parse(e.end_at) <= start)
    .sort(
      (a, b) =>
        Date.parse(b.end_at) - Date.parse(a.end_at) || a.id.localeCompare(b.id),
    )[0];
  const next = visits
    .filter((e) => Date.parse(e.start_at) >= end)
    .sort(
      (a, b) =>
        Date.parse(a.start_at) - Date.parse(b.start_at) ||
        a.id.localeCompare(b.id),
    )[0];
  const proof: RouteProof = {
    eventId: event.id,
    signature: eventSignature(event),
    checkedAt: now.toISOString(),
    previous: null,
    next: null,
  };
  for (const [side, neighbor] of [
    ["previous", previous],
    ["next", next],
  ] as const) {
    if (!neighbor) continue;
    if (!neighbor.location?.trim()) return { reason: "missing_information" };
    const departure = Math.max(
      now.getTime(),
      Date.parse(side === "previous" ? neighbor.end_at : event.end_at),
    );
    const deadline = Date.parse(
      side === "previous" ? event.start_at : neighbor.start_at,
    );
    // Insufficient even before routing; no API call needed.
    if (deadline - departure < travelBufferMinutes * 60000)
      return { reason: "driving_time" };
    const seconds = await drive(
      side === "previous" ? neighbor.location : event.location,
      side === "previous" ? event.location : neighbor.location,
      new Date(departure),
    );
    if (seconds === null) return { reason: "missing_information" };
    const arrival = departure + seconds * 1000 + travelBufferMinutes * 60000;
    if (
      arrival > deadline ||
      active.some(
        (e) =>
          e.event_type === "block" &&
          Date.parse(e.start_at) < arrival &&
          Date.parse(e.end_at) > departure,
      )
    )
      return { reason: "driving_time" };
    proof[side] = {
      id: neighbor.id,
      signature: eventSignature(neighbor),
      departureAt: new Date(departure).toISOString(),
      seconds,
    };
  }
  return { reason: null, proof };
}
