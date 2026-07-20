import { NextRequest, NextResponse } from "next/server";
import {
  isQuoteLabAuthorized,
  QuoteLabConfigurationError,
  quoteLabUnauthorizedResponse,
} from "@/lib/quote-lab/auth";
import { priceExactQuoteBuilderDesign } from "@/lib/quote-lab/exact-backend";
import type { SalesQuoteDesign, SalesQuoteLineItem } from "@mts/types/quote";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    if (!isQuoteLabAuthorized(request)) return quoteLabUnauthorizedResponse();
    const body = (await request.json()) as {
      line?: SalesQuoteLineItem;
      design?: Partial<SalesQuoteDesign>;
    };
    if (!body.line || !body.design) {
      return NextResponse.json({ error: "Line item and design are required." }, { status: 400 });
    }
    return NextResponse.json({ result: priceExactQuoteBuilderDesign(body.line, body.design) });
  } catch (error) {
    if (error instanceof QuoteLabConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Authoritative pricing failed." },
      { status: 500 },
    );
  }
}
