import { NextRequest, NextResponse } from "next/server";
import { fetchPlaceDetails, placesApiKey } from "@/lib/places/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const apiKey = placesApiKey();
  if (!apiKey) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  let body: { placeId?: string; sessionToken?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const placeId = (body.placeId ?? "").trim();
  if (!placeId) {
    return NextResponse.json({ error: "missing_place_id" }, { status: 400 });
  }

  try {
    const address = await fetchPlaceDetails(apiKey, placeId, body.sessionToken);
    return NextResponse.json({ address });
  } catch (error) {
    console.error("places/details", error);
    return NextResponse.json({ error: "upstream_error" }, { status: 502 });
  }
}
