import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { shippedDateWritesEnabled } from "@/lib/crm/shipped-date-config";

export const runtime = "nodejs";

/** Staff view of shipping notices that were not written onto a quote. */
export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireCrmUser(request);
    const { data, error } = await supabase
      .from("crm_shipping_review")
      .select("id,manufacturer,order_ref,po_number,mailbox_email,quote_id,quote_number,reason,detail,proposed_received_at,proposed_manufacturer_order_ref,status,updated_at")
      .in("status", ["open", "logged"])
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) {
      const missing = /crm_shipping_review|schema cache|does not exist/i.test(error.message || "");
      return NextResponse.json(
        { message: missing ? "Shipping review storage is not installed yet." : "Shipping review list could not be loaded.", reviews: [], proposals: [] },
        { status: missing ? 503 : 502 },
      );
    }
    const rows = data || [];
    return NextResponse.json({
      writesEnabled: shippedDateWritesEnabled(),
      reviews: rows.filter(row => row.status === "open"),
      proposals: rows.filter(row => row.status === "logged"),
    });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
