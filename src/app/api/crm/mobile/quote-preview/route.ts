import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, CrmAuthError, requireCrmUser } from "@/lib/crm/auth";
import { parseMobileQuotePreview } from "@/lib/crm/mobile-quote-preview";
import { buildMobileQuotePreviewResponse } from "@/lib/crm/mobile-quote-preview-response";
import { prepareSalesQuoteV2PricingBatch, quoteV2ServerCatalogDate } from "@/lib/crm/sales-quote-v2-price-save";

export const runtime = "nodejs";

const PREVIEW_MAX_BODY_BYTES = 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    await requireCrmUser(request);
    const contentLength = Number(request.headers.get("content-length") || "0");
    if (Number.isFinite(contentLength) && contentLength > PREVIEW_MAX_BODY_BYTES) {
      throw new CrmAuthError(413, "Mobile quote preview request exceeds 1 MiB.");
    }
    const rawText = await request.text().catch(() => {
      throw new CrmAuthError(400, "A valid mobile quote preview JSON object is required.");
    });
    if (Buffer.byteLength(rawText, "utf8") > PREVIEW_MAX_BODY_BYTES) {
      throw new CrmAuthError(413, "Mobile quote preview request exceeds 1 MiB.");
    }
    let rawBody: unknown;
    try {
      rawBody = JSON.parse(rawText);
    } catch {
      throw new CrmAuthError(400, "A valid mobile quote preview JSON object is required.");
    }
    const input = parseMobileQuotePreview(rawBody);
    const batch = prepareSalesQuoteV2PricingBatch({ lines: input.lines, selectedDesigns: input.designs, serverDate: quoteV2ServerCatalogDate() });
    return NextResponse.json(buildMobileQuotePreviewResponse(batch), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
