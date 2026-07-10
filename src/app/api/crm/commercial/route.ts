import { NextRequest, NextResponse } from "next/server";
import {
  addCommercialActivity,
  createCommercialAccount,
  importCommercialAccounts,
  loadCommercialWorkspace
} from "@/lib/crm/commercial";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireCrmUser(request);
    return NextResponse.json(await loadCommercialWorkspace(supabase));
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const payload = (await request.json()) as Record<string, unknown>;
    const action = typeof payload.action === "string" ? payload.action : "create";

    if (action === "activity") {
      const activity = await addCommercialActivity(supabase, payload, { email, userId: user.id });
      return NextResponse.json({ activity });
    }
    if (action === "import") {
      const rows = Array.isArray(payload.rows) ? (payload.rows as Array<Record<string, unknown>>) : [];
      return NextResponse.json(await importCommercialAccounts(supabase, rows, { email, userId: user.id }));
    }

    const account = await createCommercialAccount(supabase, payload, { email, userId: user.id });
    return NextResponse.json({ account });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
