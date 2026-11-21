import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { resolveCustomerEmailAttention } from "@/lib/crm/resolve-customer-email-attention";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const { supabase, email } = await requireCrmUser(request);
    const body = await request.json().catch(() => null);
    const record = body && typeof body === "object" ? body as { id?: unknown; note?: unknown } : {};
    const result = await resolveCustomerEmailAttention(supabase, {
      id: typeof record.id === "string" ? record.id : "",
      note: record.note,
      actor: email,
    });
    return NextResponse.json(result);
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
