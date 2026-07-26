import { NextRequest, NextResponse } from "next/server";
import {
  CrmAuthError,
  crmAuthErrorResponse,
  requireCrmUser,
} from "@/lib/crm/auth";
import {
  assertSalesQuoteV2WholesaleLedgerAccess,
  lookupPublishedSalesQuoteV2WholesaleCost,
  parseSalesQuoteV2WholesaleLookupBody,
} from "@/lib/crm/sales-quote-v2-wholesale-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

/**
 * Internal wholesale lookup. This route is intentionally outside every public
 * quote/customer namespace and is limited to Mike and Jessica's writable CRM
 * identities after normal CRM Bearer authentication.
 */
export async function POST(request: NextRequest) {
  try {
    const { supabase, email } = await requireCrmUser(request);
    assertSalesQuoteV2WholesaleLedgerAccess(email);
    const rawBody = await request.json().catch(() => {
      throw new CrmAuthError(400, "A valid JSON request object is required.");
    });
    const input = parseSalesQuoteV2WholesaleLookupBody(rawBody);
    return noStore(
      NextResponse.json(
        await lookupPublishedSalesQuoteV2WholesaleCost(supabase, input),
      ),
    );
  } catch (error) {
    return noStore(crmAuthErrorResponse(error));
  }
}
