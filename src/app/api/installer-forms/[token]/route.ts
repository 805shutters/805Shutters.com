import { NextRequest, NextResponse } from "next/server";
import { CrmAuthError } from "@/lib/crm/auth";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import { loadInstallerFormByToken } from "@/lib/crm/installer-forms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    const supabase = getSupabaseServiceClient();
    if (!supabase) throw new CrmAuthError(503, "The installation form is temporarily unavailable.");
    const { token } = await context.params;
    const form = await loadInstallerFormByToken(supabase, token);
    if (!form) throw new CrmAuthError(404, "Installer form was not found.");
    return NextResponse.json(form);
  } catch (cause) {
    const status = cause instanceof CrmAuthError ? cause.status : 500;
    const error = cause instanceof Error ? cause.message : "The installation form could not be loaded.";
    return NextResponse.json({ error }, { status });
  }
}
