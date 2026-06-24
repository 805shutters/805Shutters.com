// Server-only helpers that talk to the Google Places API (New).
// The API key never leaves the server — the browser calls our /api/places/* routes,
// which call Google with this key. Keep `GOOGLE_MAPS_API_KEY` out of NEXT_PUBLIC_*.

import type { PlaceSuggestion, ResolvedAddress } from "./types";

const AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete";
const DETAILS_URL = "https://places.googleapis.com/v1/places";

export function placesApiKey(): string | null {
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
  return key ? key : null;
}

type GoogleAddressComponent = {
  longText?: string;
  shortText?: string;
  types?: string[];
};

function parseComponents(components: GoogleAddressComponent[] = []) {
  const find = (type: string) => components.find((c) => c.types?.includes(type));
  const streetNumber = find("street_number")?.longText ?? "";
  const route = find("route")?.longText ?? "";
  const city =
    find("locality")?.longText ??
    find("postal_town")?.longText ??
    find("sublocality")?.longText ??
    find("administrative_area_level_3")?.longText ??
    "";
  const state = find("administrative_area_level_1")?.shortText ?? "";
  const zip = find("postal_code")?.longText ?? "";
  const street = [streetNumber, route].filter(Boolean).join(" ");
  return { street, city, state, zip };
}

export async function fetchAutocomplete(
  apiKey: string,
  input: string,
  sessionToken?: string
): Promise<PlaceSuggestion[]> {
  const response = await fetch(AUTOCOMPLETE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey
    },
    body: JSON.stringify({
      input,
      sessionToken,
      includedRegionCodes: ["us"],
      languageCode: "en"
    }),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Places autocomplete failed (${response.status})`);
  }

  const data = (await response.json()) as {
    suggestions?: Array<{
      placePrediction?: {
        placeId?: string;
        structuredFormat?: {
          mainText?: { text?: string };
          secondaryText?: { text?: string };
        };
        text?: { text?: string };
      };
    }>;
  };

  return (data.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => Boolean(p?.placeId))
    .map((p) => ({
      placeId: p.placeId as string,
      primary: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
      secondary: p.structuredFormat?.secondaryText?.text ?? ""
    }));
}

export async function fetchPlaceDetails(
  apiKey: string,
  placeId: string,
  sessionToken?: string
): Promise<ResolvedAddress> {
  const url = new URL(`${DETAILS_URL}/${encodeURIComponent(placeId)}`);
  url.searchParams.set("languageCode", "en");
  if (sessionToken) url.searchParams.set("sessionToken", sessionToken);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "formattedAddress,addressComponents"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Places details failed (${response.status})`);
  }

  const data = (await response.json()) as {
    formattedAddress?: string;
    addressComponents?: GoogleAddressComponent[];
  };

  const parts = parseComponents(data.addressComponents);
  return {
    fullAddress: data.formattedAddress ?? "",
    ...parts
  };
}
