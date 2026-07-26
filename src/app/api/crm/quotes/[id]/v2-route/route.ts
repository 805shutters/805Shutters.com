import { NextRequest, NextResponse } from "next/server";
import {
  CrmAuthError,
  crmAuthErrorResponse,
  requireCrmUser,
} from "@/lib/crm/auth";
import { resolveSalesQuoteV2Route } from "@/lib/crm/sales-quote-v2-route-resolver";
import { importCrmQuoteToSalesQuoteV2 } from "@/lib/crm/sales-quote-v2-import";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase } = await requireCrmUser(request);
    const { id } = await context.params;
    return NextResponse.json(await resolveSalesQuoteV2Route(supabase, id));
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase, user } = await requireCrmUser(request);
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as
      | { idempotencyKey?: unknown }
      | null;
    const idempotencyKey =
      typeof body?.idempotencyKey === "string"
        ? body.idempotencyKey.trim()
        : "";
    if (!idempotencyKey || idempotencyKey.length > 200) {
      throw new CrmAuthError(
        400,
        "A non-empty Quote V2 import idempotency key is required.",
      );
    }
    const existingRoute = await resolveSalesQuoteV2Route(supabase, id);
    if (
      existingRoute.status !== "legacy_import_required" &&
      existingRoute.status !== "crm_native_unsupported"
    ) {
      throw new CrmAuthError(
        409,
        "This quote is not eligible for automatic V2 structural import.",
      );
    }
    const imported = await importCrmQuoteToSalesQuoteV2(
      supabase,
      id,
      user.id,
      idempotencyKey,
      existingRoute.reason === "target_not_found"
        ? null
        : existingRoute.salesQuoteId,
    );
    const route = await resolveSalesQuoteV2Route(supabase, id);
    return NextResponse.json({ imported, route });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
