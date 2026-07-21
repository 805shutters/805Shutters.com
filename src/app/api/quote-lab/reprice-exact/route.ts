import { NextRequest, NextResponse } from "next/server";
import {
  isQuoteLabAuthorized,
  QuoteLabConfigurationError,
  quoteLabUnauthorizedResponse,
} from "@/lib/quote-lab/auth";
import { repriceExactQuoteBuilderForQuoteLabPreview } from "@/lib/quote-lab/exact-backend";
import type { SalesQuoteDesign, SalesQuoteLineItem } from "@mts/types/quote";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    if (!isQuoteLabAuthorized(request)) return quoteLabUnauthorizedResponse();
    const body = (await request.json()) as {
      lines?: SalesQuoteLineItem[];
      designs?: SalesQuoteDesign[];
      selectedVariantByLine?: Record<string, string>;
    };
    if (!Array.isArray(body.lines) || !Array.isArray(body.designs)) {
      return NextResponse.json({ error: "Quote lines and designs are required." }, { status: 400 });
    }
    return NextResponse.json({
      quote: repriceExactQuoteBuilderForQuoteLabPreview({
        lines: body.lines,
        designs: body.designs,
        selectedVariantByLine: body.selectedVariantByLine ?? {},
      }),
    });
  } catch (error) {
    if (error instanceof QuoteLabConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Authoritative quote pricing failed." },
      { status: 400 },
    );
  }
}
