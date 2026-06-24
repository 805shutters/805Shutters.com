import { NextRequest, NextResponse } from "next/server";
import { fetchAutocomplete, placesApiKey } from "@/lib/places/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const apiKey = placesApiKey();
  // No key configured yet → tell the client to fall back to a plain input.
  if (!apiKey) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  let body: { input?: string; sessionToken?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const input = (body.input ?? "").trim();
  if (input.length < 3) {
    return NextResponse.json({ suggestions: [] });
  }

  try {
    const suggestions = await fetchAutocomplete(apiKey, input, body.sessionToken);
    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error("places/autocomplete", error);
    return NextResponse.json({ error: "upstream_error" }, { status: 502 });
  }
}
