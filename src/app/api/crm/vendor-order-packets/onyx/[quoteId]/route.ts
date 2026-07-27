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
      .eq("external_source", "manufacturer_order_packet")
      .like("external_id", `onyx-order:${quoteId}:%`)
      .order("title");
    if (error) throw new CrmAuthError(502, "The Onyx ordering packet could not be loaded.");
    if (!data?.length) throw new CrmAuthError(404, "The Onyx ordering packet was not found.");
    const packets = data.map((row) => {
      const meta = row.meta && typeof row.meta === "object" && !Array.isArray(row.meta)
        ? row.meta as Record<string, unknown>
        : {};
      return {
        packet: meta.current_packet || null,
        history: Array.isArray(meta.packet_history) ? meta.packet_history : [],
        artifact: {
          id: row.id,
          title: row.title,
          status: row.status,
          updatedAt: row.updated_at,
        },
      };
    });
    return NextResponse.json({
      packets,
      packet: packets.length === 1 ? packets[0].packet : null,
    });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
