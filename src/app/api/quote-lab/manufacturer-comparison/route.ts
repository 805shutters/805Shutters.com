import { NextRequest, NextResponse } from "next/server";
import {
  isQuoteLabAuthorized,
  QuoteLabConfigurationError,
  quoteLabUnauthorizedResponse,
} from "@/lib/quote-lab/auth";
import { compareManufacturers } from "@/lib/quote-lab/manufacturer-comparison";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    if (!isQuoteLabAuthorized(request)) return quoteLabUnauthorizedResponse();
    const body = await request.json();
    return NextResponse.json(compareManufacturers(body), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof QuoteLabConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Manufacturer comparison failed." },
      { status: 400 },
    );
  }
}
