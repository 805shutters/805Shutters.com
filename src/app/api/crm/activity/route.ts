import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { parseActivityOptions } from "@/lib/crm/activity-pages";
import { loadCrmActivitySnapshot } from "@/lib/crm/backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireCrmUser(request);
    let options;
    try { options = parseActivityOptions(request.nextUrl.searchParams); } catch { return NextResponse.json({ message: "Invalid activity page or timestamp." }, { status: 400 }); }
    const snapshot = await loadCrmActivitySnapshot(supabase, options);
    const response = NextResponse.json(snapshot);
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    return response;
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
