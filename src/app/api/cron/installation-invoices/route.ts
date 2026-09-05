import { observeIntegration } from "@/lib/crm/integration-health";
import { NextRequest, NextResponse } from "next/server";
import { CrmAuthError, crmAuthErrorResponse } from "@/lib/crm/auth";
import { processInstallationInvoiceInbox } from "@/lib/crm/installation-invoices";
import { getSupabaseServiceClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

function requireCronAccess(request: NextRequest) {
  const secret = process.env.INSTALLATION_INVOICE_CRON_SECRET || process.env.CRON_SECRET;
  if (!secret) throw new CrmAuthError(503, "Installation invoice cron secret is not configured.");

  const authorization = request.headers.get("authorization") || "";
  if (authorization !== `Bearer ${secret}`) {
    throw new CrmAuthError(401, "Installation invoice cron is not authorized.");
  }
}

async function run(request: NextRequest) {
  try {
    requireCronAccess(request);
    const supabase = getSupabaseServiceClient();
    if (!supabase) throw new CrmAuthError(503, "Dedicated Supabase database is not configured.");

    const result = await observeIntegration(supabase, "installation-invoices", () => processInstallationInvoiceInbox(supabase, {
      actorEmail: "installation-invoice-cron"
    }));

    return NextResponse.json(result);
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
