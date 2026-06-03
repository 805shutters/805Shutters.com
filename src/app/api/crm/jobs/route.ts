import { NextRequest, NextResponse } from "next/server";
import { buildAccountabilityQueue, buildBookkeepingRows, sumBookkeepingRows } from "@/lib/crm/bookkeeping";
import { buildCustomerFiles } from "@/lib/crm/customer-files";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import {
  CrmBookkeepingCredit,
  CrmBookkeepingEntry,
  CrmBookkeepingPayment,
  CrmCalendarEvent,
  CrmCustomer,
  CrmCustomerContract,
  CrmCustomerProduct,
  CrmDashboardData,
  CrmJob,
  CrmQuote
} from "@/lib/crm/types";

export const runtime = "nodejs";

const openStatuses = new Set(["new", "follow_up", "scheduled", "quoted", "sold", "ordered"]);

function toMoney(value: unknown) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

function buildDashboardData({
  jobs,
  quotes,
  events,
  customers,
  products,
  contracts,
  entries,
  payments,
  credits
}: {
  jobs: CrmJob[];
  quotes: CrmQuote[];
  events: CrmCalendarEvent[];
  customers: CrmCustomer[];
  products: CrmCustomerProduct[];
  contracts: CrmCustomerContract[];
  entries: CrmBookkeepingEntry[];
  payments: CrmBookkeepingPayment[];
  credits: CrmBookkeepingCredit[];
}): CrmDashboardData {
  const quotesByJob = new Map<string, number>();
  for (const quote of quotes) {
    quotesByJob.set(quote.job_id, Math.max(quotesByJob.get(quote.job_id) || 0, toMoney(quote.quote_total)));
  }

  const bookkeepingRows = buildBookkeepingRows({ quotes, entries, payments, credits });
  const bookkeepingTotals = sumBookkeepingRows(bookkeepingRows);
  const accountability = buildAccountabilityQueue(bookkeepingRows);
  const customerFiles = buildCustomerFiles({
    customers,
    products,
    contracts,
    jobs,
    quotes,
    bookkeepingRows
  });
  const jobsWithQuotes = jobs.map((job) => ({
    ...job,
    quote_total: quotesByJob.get(job.id) || toMoney(job.estimated_total)
  }));

  return {
    jobs: jobsWithQuotes,
    quotes,
    events,
    customers,
    customerProducts: products,
    customerContracts: contracts,
    customerFiles,
    bookkeepingEntries: entries,
    bookkeepingPayments: payments,
    bookkeepingCredits: credits,
    bookkeepingRows,
    bookkeepingTotals,
    accountability,
    summary: {
      openJobs: jobsWithQuotes.filter((job) => openStatuses.has(job.status)).length,
      scheduledJobs: jobsWithQuotes.filter((job) => job.status === "scheduled").length,
      quotedJobs: jobsWithQuotes.filter((job) => job.status === "quoted").length,
      soldJobs: jobsWithQuotes.filter((job) => job.status === "sold" || job.status === "ordered").length,
      quotePipeline: jobsWithQuotes.reduce((total, job) => total + toMoney(job.quote_total), 0),
      depositCollected: jobsWithQuotes.reduce((total, job) => total + toMoney(job.deposit_paid), 0),
      openBalance: bookkeepingTotals.balance,
      needsOrder: accountability.filter((item) => item.type === "needs_order").length,
      missingCogs: bookkeepingTotals.missingCogs,
      readyToInstall: accountability.filter((item) => item.type === "ready_to_install").length,
      customerFiles: customerFiles.length,
      contracts: customerFiles.reduce((total, file) => total + file.contracts.length, 0)
    }
  };
}

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireCrmUser(request);

    const [
      jobsResult,
      quotesResult,
      eventsResult,
      customersResult,
      productsResult,
      contractsResult,
      entriesResult,
      paymentsResult,
      creditsResult
    ] =
      await Promise.all([
        supabase.from("crm_jobs").select("*").order("created_at", { ascending: false }).limit(120),
        supabase.from("crm_quotes").select("*").order("created_at", { ascending: false }).limit(120),
        supabase
          .from("crm_calendar_events")
          .select("*")
          .gte("start_at", new Date(Date.now() - 1000 * 60 * 60 * 24 * 14).toISOString())
          .order("start_at", { ascending: true })
          .limit(120),
        supabase.from("crm_customers").select("*").order("latest_sold_date", { ascending: false }).limit(800),
        supabase.from("crm_customer_products").select("*").order("created_at", { ascending: false }).limit(1600),
        supabase.from("crm_customer_contracts").select("*").order("created_at", { ascending: false }).limit(1000),
        supabase
          .from("crm_quote_bookkeeping_entries")
          .select("*")
          .order("sold_date", { ascending: false, nullsFirst: false })
          .limit(500),
        supabase.from("crm_quote_bookkeeping_payments").select("*").order("paid_at", { ascending: false }).limit(800),
        supabase.from("crm_quote_bookkeeping_credits").select("*").order("credit_date", { ascending: false }).limit(500)
      ]);

    if (
      jobsResult.error ||
      quotesResult.error ||
      eventsResult.error ||
      customersResult.error ||
      productsResult.error ||
      contractsResult.error ||
      entriesResult.error ||
      paymentsResult.error ||
      creditsResult.error
    ) {
      return NextResponse.json({ message: "CRM data failed to load." }, { status: 502 });
    }

    const jobs = (jobsResult.data || []) as CrmJob[];
    const quotes = (quotesResult.data || []) as CrmQuote[];
    const events = (eventsResult.data || []) as CrmCalendarEvent[];
    const customers = (customersResult.data || []) as CrmCustomer[];
    const products = (productsResult.data || []) as CrmCustomerProduct[];
    const contracts = (contractsResult.data || []) as CrmCustomerContract[];
    const entries = (entriesResult.data || []) as CrmBookkeepingEntry[];
    const payments = (paymentsResult.data || []) as CrmBookkeepingPayment[];
    const credits = (creditsResult.data || []) as CrmBookkeepingCredit[];
    const jobNames = new Map(jobs.map((job) => [job.id, job.customer_name]));

    return NextResponse.json(
      buildDashboardData({
        jobs,
        quotes: quotes.map((quote) => ({ ...quote, customer_name: jobNames.get(quote.job_id) })),
        events: events.map((event) => ({
          ...event,
          customer_name: event.job_id ? jobNames.get(event.job_id) : undefined
        })),
        customers,
        products,
        contracts,
        entries,
        payments,
        credits
      })
    );
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, email } = await requireCrmUser(request);
    const payload = await request.json();

    if (!payload.customer_name?.trim() || !payload.phone?.trim()) {
      return NextResponse.json({ message: "Customer name and phone are required." }, { status: 400 });
    }

    const record = {
      source: "crm",
      status: payload.status || "new",
      priority: payload.priority || "normal",
      customer_name: payload.customer_name.trim(),
      phone: payload.phone.trim(),
      email: payload.email?.trim() || null,
      address: payload.address?.trim() || null,
      city: payload.city?.trim() || null,
      product_interest: payload.product_interest || "shutters",
      sales_owner: payload.sales_owner || "Unassigned",
      next_action: payload.next_action?.trim() || "Call customer",
      next_action_due: payload.next_action_due || null,
      estimated_total: toMoney(payload.estimated_total),
      notes: payload.notes?.trim() || null,
      meta: {
        createdBy: email
      }
    };

    const { data, error } = await supabase.from("crm_jobs").insert(record).select("*").single();

    if (error) {
      return NextResponse.json({ message: "CRM job could not be created." }, { status: 502 });
    }

    return NextResponse.json({ job: data });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
