import { CrmAuthError } from "@/lib/crm/auth";
import { commercialDiscoveryAreas, commercialDiscoverySearches } from "@/lib/crm/commercial-types";

const SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  businessStatus?: string;
  primaryType?: string;
  types?: string[];
};

export async function discoverCommercialProspects(searchId: string, area: string) {
  const search = commercialDiscoverySearches.find((item) => item.id === searchId);
  if (!search) throw new CrmAuthError(400, "Choose a supported commercial prospect search.");
  if (!(commercialDiscoveryAreas as readonly string[]).includes(area)) throw new CrmAuthError(400, "Choose a supported Ventura County area.");

  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) throw new CrmAuthError(503, "Live prospect search needs GOOGLE_MAPS_API_KEY with Places API (New) enabled.");

  const response = await fetch(SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.businessStatus,places.primaryType,places.types"
    },
    body: JSON.stringify({
      textQuery: `${search.query} in ${area}, California`,
      pageSize: 20,
      languageCode: "en",
      regionCode: "US"
    }),
    cache: "no-store"
  });

  const data = (await response.json().catch(() => null)) as { places?: GooglePlace[]; error?: { message?: string } } | null;
  if (!response.ok) throw new CrmAuthError(502, data?.error?.message || `Live prospect search failed (${response.status}).`);

  return {
    search: { id: search.id, label: search.label, area, query: `${search.query} in ${area}, California` },
    attribution: "Google Maps",
    storageNotice: "Live discovery results should be confirmed on the prospect's own website before saving durable contact details.",
    prospects: (data?.places || [])
      .filter((place) => place.id && place.displayName?.text && place.businessStatus !== "CLOSED_PERMANENTLY")
      .map((place) => ({
        placeId: place.id as string,
        companyName: place.displayName?.text || "",
        address: place.formattedAddress || null,
        phone: place.nationalPhoneNumber || null,
        website: place.websiteUri || null,
        mapsUrl: place.googleMapsUri || null,
        businessStatus: place.businessStatus || null,
        primaryType: place.primaryType || null,
        types: place.types || []
      }))
  };
}
