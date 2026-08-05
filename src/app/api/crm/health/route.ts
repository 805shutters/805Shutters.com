import { NextRequest, NextResponse } from "next/server";
import { getAllowedCrmEmails } from "@/lib/crm/auth";
import { getCrmGoogleOAuthStatus } from "@/lib/crm/oauth";
import { isGoogleCalendarSyncConfigured } from "@/lib/google/calendar";
import { getSupabaseServiceClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

const requiredTables = [
  "crm_profiles",
  "crm_jobs",
  "crm_quotes",
  "crm_quote_line_items",
  "crm_quote_designs",
  "crm_quote_bookkeeping_entries",
  "crm_quote_bookkeeping_payments",
  "crm_quote_bookkeeping_credits",
  "crm_calendar_events",
  "crm_availability_slots",
  "crm_customers",
  "crm_customer_products",
  "crm_customer_contracts",
  "crm_activity_events",
  "crm_job_expenses",
  "crm_settings",
  "crm_ken_payments",
  "crm_ken_payment_allocations",
  "crm_order_cogs_emails",
  "crm_commission_payments",
  "crm_commission_payment_allocations",
  "crm_installation_invoice_emails"
];

function hasEnvValue(...keys: string[]) {
  return keys.some((key) => Boolean(process.env[key]?.trim()));
}

function getCanonicalSiteOrigin(request: NextRequest) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");

  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      return request.nextUrl.origin;
    }
  }

  return request.nextUrl.origin;
}

export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const supabase = getSupabaseServiceClient();
  const tableChecks: Array<{ table: string; ready: boolean; error?: string }> = [];
  let partialAcceptanceRpcReady = false;

  if (supabase) {
    for (const table of requiredTables) {
      const { error } = await supabase.from(table).select("*").limit(1);
      tableChecks.push({
        table,
        ready: !error,
        error: error ? "missing_or_unavailable" : undefined
      });
    }
    const { error: partialAcceptanceProbeError } = await supabase.rpc("partition_crm_partial_quote_acceptance", {
      p_quote_id: "00000000-0000-0000-0000-000000000000",
      p_share_token: "health-check-no-write",
      p_selected_line_ids: [],
      p_line_quantities: [],
      p_signed_at: "2000-01-01T00:00:00.000Z",
      p_signature: "health-check",
      p_printed_name: "health-check",
      p_current_money: {},
      p_future_money: {}
    });
    partialAcceptanceRpcReady = partialAcceptanceProbeError?.code === "P0002";
  }

  const googleOAuth = await getCrmGoogleOAuthStatus(new URL("/crm/", getCanonicalSiteOrigin(request)).toString());

  const authConfigured = Boolean(supabaseUrl && anonKey);
  const databaseConfigured = Boolean(supabaseUrl && serviceRoleKey);
  const migrationsReady = tableChecks.length > 0 && tableChecks.every((check) => check.ready) && partialAcceptanceRpcReady;
  const installationInvoiceTableReady =
    tableChecks.find((check) => check.table === "crm_installation_invoice_emails")?.ready ?? false;
  const installationInvoiceDirectGmailConfigured =
    hasEnvValue("GMAIL_805_CLIENT_ID", "GOOGLE_CLIENT_ID", "GOOGLE_CALENDAR_CLIENT_ID") &&
    hasEnvValue("GMAIL_805_CLIENT_SECRET", "GOOGLE_CLIENT_SECRET", "GOOGLE_CALENDAR_CLIENT_SECRET") &&
    hasEnvValue("GMAIL_805_REFRESH_TOKEN", "GMAIL_REFRESH_TOKEN", "GOOGLE_CALENDAR_REFRESH_TOKEN");
  const installationInvoiceGmailBrokerConfigured =
    hasEnvValue("GMAIL_ACCESS_TOKEN_BROKER_URL", "INSTALLATION_INVOICE_GMAIL_ACCESS_TOKEN_BROKER_URL") &&
    hasEnvValue("GMAIL_ACCESS_TOKEN_BROKER_SECRET", "INSTALLATION_INVOICE_GMAIL_ACCESS_TOKEN_BROKER_SECRET");
  const installationInvoiceGmailConfigured =
    installationInvoiceDirectGmailConfigured || installationInvoiceGmailBrokerConfigured;
  const installationInvoicePullerReady =
    databaseConfigured && installationInvoiceTableReady && installationInvoiceGmailConfigured;

  // Booking confirmation channels — booleans only, never the secret values.
  const bookingEmailConfigured = Boolean(process.env.RESEND_API_KEY);
  const bookingSmsConfigured = Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      (process.env.TWILIO_FROM_PHONE || process.env.TWILIO_MESSAGING_SERVICE_SID)
  );
  const googleCalendarSyncConfigured = isGoogleCalendarSyncConfigured();

  return NextResponse.json({
    ready: authConfigured && databaseConfigured && migrationsReady && googleOAuth.enabled && installationInvoicePullerReady,
    authConfigured,
    databaseConfigured,
    googleProviderEnabled: googleOAuth.enabled,
    googleProviderError: googleOAuth.error,
    migrationsReady,
    partialAcceptanceRpcReady,
    installationInvoiceGmailConfigured,
    installationInvoiceDirectGmailConfigured,
    installationInvoiceGmailBrokerConfigured,
    installationInvoiceTableReady,
    installationInvoicePullerReady,
    bookingEmailConfigured,
    bookingSmsConfigured,
    googleCalendarSyncConfigured,
    supabaseHost: supabaseUrl ? new URL(supabaseUrl).hostname : null,
    allowedEmailsConfigured: getAllowedCrmEmails().length > 0,
    allowedEmailCount: getAllowedCrmEmails().length,
    tables: tableChecks
  });
}
