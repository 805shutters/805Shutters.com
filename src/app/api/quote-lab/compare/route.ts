import { NextRequest, NextResponse } from "next/server";
import {
  isQuoteLabAuthorized,
  QuoteLabConfigurationError,
  quoteLabUnauthorizedResponse,
} from "@/lib/quote-lab/auth";
import { compareQuoteLab, QuoteLabInputError } from "@/lib/quote-lab/comparison";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    if (!isQuoteLabAuthorized(request)) return quoteLabUnauthorizedResponse();
    const body = (await request.json()) as unknown;
    return NextResponse.json({ comparison: compareQuoteLab(body) }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof QuoteLabConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    if (error instanceof QuoteLabInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Quote comparison failed." }, { status: 500 });
  }
}
