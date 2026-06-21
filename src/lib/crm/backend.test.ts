import { describe, expect, it } from "vitest";
import { buildDashboardData, enrichCalendarEventsWithJobDetails } from "./backend";
import { CrmBookkeepingPayment, CrmCalendarEvent, CrmJob, CrmQuote } from "./types";

function job(overrides: Partial<CrmJob> = {}): CrmJob {
  return {
    id: "job-1",
    created_at: "2026-06-20T00:00:00.000Z",
    updated_at: "2026-06-20T00:00:00.000Z",
    source: "crm",
    lead_id: null,
    status: "sold",
    priority: "normal",
    customer_name: "Test Customer",
    phone: "8055551212",
    email: null,
    address: null,
    city: "Ventura",
    product_interest: "Shutters",
    sales_owner: "Jessica",
    next_action: null,
    next_action_due: null,
    appointment_start: null,
    appointment_end: null,
    estimated_total: 0,
    deposit_paid: 0,
    notes: null,
    ...overrides
  };
}

function quote(overrides: Partial<CrmQuote> = {}): CrmQuote {
  return {
    id: "quote-1",
    created_at: "2026-06-20T00:00:00.000Z",
    updated_at: "2026-06-20T00:00:00.000Z",
    job_id: "job-1",
    quote_number: null,
    status: "sold",
    quote_total: 1000,
    materials_cost: 0,
    labor_cost: 0,
    discount: 0,
    tax: 0,
    deposit_required: 500,
    balance_due: 500,
    sold_by: null,
    sent_at: null,
    approved_at: null,
    sold_at: "2026-06-20T00:00:00.000Z",
    ordered_at: null,
    received_at: null,
    installed_at: null,
    archived_at: null,
    manufacturer_name: null,
    manufacturer_order_ref: null,
    manufacturer_order_url: null,
    manufacturer_document_url: null,
    customer_email: null,
    customer_phone: null,
    customer_address: null,
    share_token: null,
    customer_signature: null,
    customer_printed_name: null,
    signed_at: null,
    quote_group_id: null,
    quote_label: null,
    meta: {},
    notes: null,
    ...overrides
  };
}

function payment(overrides: Partial<CrmBookkeepingPayment> = {}): CrmBookkeepingPayment {
  return {
    id: "payment-1",
    created_at: "2026-06-20T00:00:00.000Z",
    updated_at: "2026-06-20T00:00:00.000Z",
    quote_id: null,
    job_id: null,
    bookkeeping_entry_id: null,
    payment_label: "Balance payment",
    payment_type: "cash",
    amount: 0,
    paid_at: "2026-06-20",
    notes: null,
    source: "manual",
    ...overrides
  };
}

describe("buildDashboardData", () => {
  it("counts Open Jobs as sold jobs that are not paid/completed", () => {
    const data = buildDashboardData({
      jobs: [
        job({ id: "quoted-lead", status: "quoted", customer_name: "Quoted Lead" }),
        job({ id: "sold-open", status: "sold", customer_name: "Sold Open" }),
        job({ id: "paid-status", status: "closed", customer_name: "Paid Status" }),
        job({ id: "paid-balance", status: "sold", customer_name: "Paid Balance" }),
        job({ id: "duplicate-open", status: "ordered", customer_name: "Duplicate Open" })
      ],
      quotes: [
        quote({ id: "quote-lead", job_id: "quoted-lead", status: "sent" }),
        quote({ id: "quote-sold-open", job_id: "sold-open", status: "sold" }),
        quote({ id: "quote-paid-status", job_id: "paid-status", status: "paid" }),
        quote({ id: "quote-paid-balance", job_id: "paid-balance", status: "sold" }),
        quote({ id: "quote-duplicate-a", job_id: "duplicate-open", status: "ordered" }),
        quote({ id: "quote-duplicate-b", job_id: "duplicate-open", status: "approved" })
      ],
      events: [],
      customers: [],
      products: [],
      contracts: [],
      entries: [],
      payments: [payment({ id: "paid-balance-payment", quote_id: "quote-paid-balance", amount: 1000 })],
      credits: [],
      expenses: [],
      installationInvoiceEmails: [],
      kenPayments: [],
      openingBalance: 0,
      payoffTarget: 500000
    });

    expect(data.summary.openJobs).toBe(2);
  });
});

describe("enrichCalendarEventsWithJobDetails", () => {
  it("adds linked job contact details to calendar events", () => {
    const events = [
      {
        id: "event-1",
        created_at: "2026-06-20T00:00:00.000Z",
        updated_at: "2026-06-20T00:00:00.000Z",
        job_id: "job-1",
        title: "Susannah consultation",
        event_type: "sales_consult",
        status: "scheduled",
        assigned_to: "Jessica",
        start_at: "2026-06-24T23:00:00.000Z",
        end_at: "2026-06-25T00:00:00.000Z",
        location: "340 Green Moor Place",
        notes: "4 shutters"
      } satisfies CrmCalendarEvent
    ];

    const jobs = [
      {
        id: "job-1",
        created_at: "2026-06-20T00:00:00.000Z",
        updated_at: "2026-06-20T00:00:00.000Z",
        source: "crm",
        lead_id: null,
        status: "scheduled",
        priority: "normal",
        customer_name: "Susannah",
        phone: "8043589594",
        email: "customer@email.com",
        address: "340 Green Moor Place",
        city: "Thousand Oaks",
        product_interest: "Shutters",
        sales_owner: "Jessica",
        next_action: null,
        next_action_due: null,
        appointment_start: "2026-06-24T23:00:00.000Z",
        appointment_end: "2026-06-25T00:00:00.000Z",
        estimated_total: 0,
        deposit_paid: 0,
        notes: "Bring white shutter samples"
      } satisfies CrmJob
    ];

    expect(enrichCalendarEventsWithJobDetails(events, jobs)[0]).toMatchObject({
      customer_name: "Susannah",
      customer_phone: "8043589594",
      customer_email: "customer@email.com",
      customer_address: "340 Green Moor Place",
      customer_city: "Thousand Oaks",
      product_interest: "Shutters",
      customer_notes: "4 shutters"
    });
  });
});
