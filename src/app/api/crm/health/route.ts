import { NextRequest, NextResponse } from "next/server";
import { getAllowedCrmEmails } from "@/lib/crm/auth";
import { getCrmGoogleOAuthStatus } from "@/lib/crm/oauth";
import { getSupabaseServiceClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

const requiredTables = [
  "crm_profiles",
  "crm_jobs",
  "crm_quotes",
  "crm_quote_bookkeeping_entries",
  "crm_quote_bookkeeping_payments",
  "crm_quote_bookkeeping_credits",
  "crm_calendar_events",
  "crm_availability_slots",
  "crm_customers",
  "crm_customer_products",
  "crm_customer_contracts",
  "crm_activity_events"
];

export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const supabase = getSupabaseServiceClient();
  const tableChecks: Array<{ table: string; ready: boolean; error?: string }> = [];

  if (supabase) {
    for (const table of requiredTables) {
      const { error } = await supabase.from(table).select("*", { count: "exact", head: true });
      tableChecks.push({
        table,
        ready: !error,
        error: error ? "missing_or_unavailable" : undefined
      });
    }
  }

  const googleOAuth = await getCrmGoogleOAuthStatus(new URL("/crm", request.nextUrl.origin).toString());

  const authConfigured = Boolean(supabaseUrl && anonKey);
  const databaseConfigured = Boolean(supabaseUrl && serviceRoleKey);
  const migrationsReady = tableChecks.length > 0 && tableChecks.every((check) => check.ready);

  // Booking confirmation channels — booleans only, never the secret values.
  const bookingEmailConfigured = Boolean(process.env.RESEND_API_KEY);
  const bookingSmsConfigured = Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      (process.env.TWILIO_FROM_PHONE || process.env.TWILIO_MESSAGING_SERVICE_SID)
  );

  return NextResponse.json({
    ready: authConfigured && databaseConfigured && migrationsReady && googleOAuth.enabled,
    authConfigured,
    databaseConfigured,
    googleProviderEnabled: googleOAuth.enabled,
    googleProviderError: googleOAuth.error,
    migrationsReady,
    bookingEmailConfigured,
    bookingSmsConfigured,
    supabaseHost: supabaseUrl ? new URL(supabaseUrl).hostname : null,
    allowedEmailsConfigured: getAllowedCrmEmails().length > 0,
    allowedEmailCount: getAllowedCrmEmails().length,
    tables: tableChecks
  });
}
