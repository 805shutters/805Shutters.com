import { NextRequest, NextResponse } from "next/server";
import { CrmAuthError } from "@/lib/crm/auth";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import { submitInstallerForm } from "@/lib/crm/installer-forms";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    const supabase = getSupabaseServiceClient();
    if (!supabase) throw new CrmAuthError(503, "The installation form is temporarily unavailable.");
    const { token } = await context.params;
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(await submitInstallerForm(supabase, token, body));
  } catch (cause) {
    const status = cause instanceof CrmAuthError ? cause.status : 500;
    const error = cause instanceof Error ? cause.message : "The installation report could not be submitted.";
    return NextResponse.json({ error }, { status });
  }
}
