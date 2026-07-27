import { NextRequest, NextResponse } from "next/server";
import { CrmAuthError, crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ quoteId: string }> },
) {
  try {
    const { supabase } = await requireCrmUser(request);
    const { quoteId } = await context.params;
    const { data, error } = await supabase
      .from("crm_customer_contracts")
      .select("id,title,status,updated_at,meta")
      .eq("external_source", "manufacturer_order_manifest")
      .eq("external_id", `manufacturer-order-manifest:${quoteId}`)
      .maybeSingle();
    if (error) throw new CrmAuthError(502, "The agentic ordering packet could not be loaded.");
    if (!data) throw new CrmAuthError(404, "The agentic ordering packet was not found.");
    const meta = data.meta && typeof data.meta === "object" && !Array.isArray(data.meta)
      ? data.meta as Record<string, unknown>
      : {};
    return NextResponse.json({
      packet: meta.current_manifest || null,
      history: Array.isArray(meta.manifest_history) ? meta.manifest_history : [],
      artifact: {
        id: data.id,
        title: data.title,
        status: data.status,
        updatedAt: data.updated_at,
      },
    });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
