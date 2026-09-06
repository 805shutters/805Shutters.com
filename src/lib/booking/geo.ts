import type { CrmCalendarEvent } from "@/lib/crm/types";
import { placesApiKey } from "@/lib/places/server";

const textSearchUrl = "https://places.googleapis.com/v1/places:searchText";

export const maxBookingTravelMiles = 20;

export type BookingGeoPoint = {
  lat: number;
  lng: number;
};

export type BookingGeocodeResult = {
  configured: boolean;
  point: BookingGeoPoint | null;
  formattedAddress?: string;
};

function numericPoint(value: unknown): BookingGeoPoint | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const lat = Number(record.lat ?? record.latitude);
  const lng = Number(record.lng ?? record.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export function calendarEventGeoPoint(event: CrmCalendarEvent): BookingGeoPoint | null {
  const meta = event.meta;
  if (!meta || typeof meta !== "object") return null;
  return numericPoint(meta.bookingGeo) || numericPoint(meta.geo) || numericPoint(meta.locationGeo);
}

export async function geocodeBookingAddress(address: string): Promise<BookingGeocodeResult> {
  const apiKey = placesApiKey();
  if (!apiKey) return { configured: false, point: null };

  const query = address.trim();
  if (!query) return { configured: true, point: null };

  const response = await fetch(textSearchUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.formattedAddress,places.location,places.addressComponents"
    },
    body: JSON.stringify({
      textQuery: query,
      regionCode: "US",
      languageCode: "en"
    }),
    signal: AbortSignal.timeout(8000),
    cache: "no-store"
  });

  if (!response.ok) {
    console.error(`[booking] places text search failed (${response.status})`);
    return { configured: true, point: null };
  }

  const data = (await response.json()) as {
    places?: Array<{
      formattedAddress?: string;
      addressComponents?: Array<{ types: string[] }>;
      location?: {
        latitude?: number;
        longitude?: number;
      };
    }>;
  };
  const place = data.places?.[0];
  const types = new Set(place?.addressComponents?.flatMap(c => c.types));
  if (data.places?.length !== 1 || !types.has("street_number") || !types.has("route")) return { configured: true, point: null };
  const lat = Number(place?.location?.latitude);
  const lng = Number(place?.location?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { configured: true, point: null };
  }

  return {
    configured: true,
    point: { lat, lng },
    formattedAddress: place?.formattedAddress
  };
}

export async function addGeoPointsToEvents(events: CrmCalendarEvent[]) {
  return Promise.all(
    events.map(async (event) => {
      if (calendarEventGeoPoint(event) || !event.location) return event;
      const result = await geocodeBookingAddress(event.location);
      if (!result.point) return event;
      return {
        ...event,
        meta: {
          ...(event.meta || {}),
          bookingGeo: result.point
        }
      };
    })
  );
}

export function distanceMiles(a: BookingGeoPoint, b: BookingGeoPoint) {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(h));
}
