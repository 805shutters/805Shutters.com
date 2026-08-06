import { describe, expect, it } from "vitest";
import { buildUnifiedActivityFeed, filterUnifiedActivity, reconcileDisplayedActivity } from "./unified-activity";

describe("unified CRM activity", () => {
  const jobs = [
    {
      id: "job-1",
      customer_name: "Alex Rivera",
      status: "follow_up",
      next_action: "Call about fabric",
      next_action_due: "2026-08-06",
      notes: "Prefers morning calls"
    }
  ];
  const quotes = [{ id: "quote-1", job_id: "job-1", customer_name: "Alex Rivera" }];
  const rows = [
    {
      id: "entry-1",
      jobId: "job-1",
      quoteId: "quote-1",
      customerName: "Alex Rivera",
      payments: []
    }
  ];

  it("combines canonical payments with classified CRM events newest first", () => {
    const feed = buildUnifiedActivityFeed({
      jobs,
      quotes,
      rows,
      customers: [],
      payments: [
        {
          id: "payment-venmo",
          created_at: "2026-08-04T16:00:00.000Z",
          paid_at: "2026-08-04T16:00:00.000Z",
          bookkeeping_entry_id: "entry-1",
          job_id: "job-1",
          quote_id: "quote-1",
          payment_type: "venmo",
          payment_label: "Deposit",
          amount: 750,
          external_source: "venmo_email",
          external_id: "gmail-venmo-1",
          meta: { payer_name: "A. Rivera" }
        }
      ],
      activityEvents: [
        {
          id: "follow-up",
          created_at: "2026-08-04T18:00:00.000Z",
          actor_email: "mike@805shutters.com",
          entity_type: "job",
          entity_id: "job-1",
          action: "update",
          before_data: { next_action: null, next_action_due: null },
          after_data: { next_action: "Call about fabric", next_action_due: "2026-08-06" },
          metadata: {}
        },
        {
          id: "note",
          created_at: "2026-08-04T17:00:00.000Z",
          actor_email: "jessica@805shutters.com",
          entity_type: "job",
          entity_id: "job-1",
          action: "update",
          before_data: { notes: null },
          after_data: { notes: "Prefers morning calls" },
          metadata: {}
        },
        {
          id: "status",
          created_at: "2026-08-04T15:00:00.000Z",
          actor_email: "mike@805shutters.com",
          entity_type: "job",
          entity_id: "job-1",
          action: "update",
          before_data: { status: "new" },
          after_data: { status: "follow_up" },
          metadata: {}
        },
        {
          id: "general",
          created_at: "2026-08-04T14:00:00.000Z",
          actor_email: "system@805shutters.com",
          entity_type: "quote",
          entity_id: "quote-1",
          action: "share_link.create",
          before_data: null,
          after_data: null,
          metadata: {}
        },
        {
          id: "payment-audit-noise",
          created_at: "2026-08-04T16:00:01.000Z",
          actor_email: "system@805shutters.com",
          entity_type: "bookkeeping_payment",
          entity_id: "payment-venmo",
          action: "create",
          before_data: null,
          after_data: { amount: 750 },
          metadata: {}
        }
      ]
    } as never);

    expect(feed.map((event) => event.id)).toEqual([
      "crm:follow-up",
      "crm:note",
      "payment:payment-venmo",
      "crm:status",
      "crm:general"
    ]);
    expect(feed.map((event) => event.category)).toEqual([
      "follow_up",
      "note",
      "payment",
      "update",
      "update"
    ]);
    expect(feed[0]).toMatchObject({
      customerName: "Alex Rivera",
      typeLabel: "Follow-up",
      description: "Follow-up set: Call about fabric · due Aug 6, 2026"
    });
    expect(feed[1]).toMatchObject({
      customerName: "Alex Rivera",
      source: "Jessica",
      typeLabel: "Note",
      description: "Prefers morning calls"
    });
    expect(feed[2]).toMatchObject({
      customerName: "Alex Rivera",
      displayCustomer: "A. Rivera",
      source: "Venmo",
      typeLabel: "Payment",
      amount: 750,
      description: "Deposit received via Venmo"
    });
    expect(feed[3].description).toBe("Status changed from New to Follow up");
    expect(feed[4].description).toBe("Share link created");
  });

  it("resolves Square payments and metadata-only customer events", () => {
    const feed = buildUnifiedActivityFeed({
      jobs: [],
      quotes: [],
      rows: [],
      customers: [],
      payments: [
        {
          id: "square-payment",
          created_at: "2026-08-04T12:00:00.000Z",
          paid_at: null,
          payment_type: "credit_card",
          payment_label: "Balance",
          amount: 1200,
          external_source: "square_webhook",
          external_id: "sq-1",
          meta: { square_customer_name: "Jordan Lee" }
        }
      ],
      activityEvents: [
        {
          id: "metadata-note",
          created_at: "2026-08-04T11:00:00.000Z",
          actor_email: null,
          entity_type: "system",
          entity_id: null,
          action: "note.add",
          before_data: null,
          after_data: null,
          metadata: { customer_name: "Taylor Kim", note: "Left voicemail" }
        }
      ]
    } as never);

    expect(feed[0]).toMatchObject({ source: "Square", customerName: "Jordan Lee", amount: 1200 });
    expect(feed[1]).toMatchObject({ category: "note", customerName: "Taylor Kim", description: "Left voicemail" });
  });

  it("filters one feed without changing its order", () => {
    const feed = [
      { id: "1", category: "payment" },
      { id: "2", category: "note" },
      { id: "3", category: "follow_up" },
      { id: "4", category: "update" },
      { id: "5", category: "signed_contract" }
    ];

    expect(filterUnifiedActivity(feed as never, "all").map((event) => event.id)).toEqual(["1", "2", "3", "4", "5"]);
    expect(filterUnifiedActivity(feed as never, "payments").map((event) => event.id)).toEqual(["1"]);
    expect(filterUnifiedActivity(feed as never, "notes").map((event) => event.id)).toEqual(["2"]);
    expect(filterUnifiedActivity(feed as never, "follow_ups").map((event) => event.id)).toEqual(["3"]);
    expect(filterUnifiedActivity(feed as never, "updates").map((event) => event.id)).toEqual(["4"]);
    expect(filterUnifiedActivity(feed as never, "signed_contracts").map((event) => event.id)).toEqual(["5"]);
  });

  it("lists signed customers newest first and suppresses duplicate signing audit rows", () => {
    const feed = buildUnifiedActivityFeed({
      jobs: [
        { id: "job-old", customer_name: "Older Customer" },
        { id: "job-new", customer_name: "Newest Customer" }
      ],
      quotes: [
        { id: "quote-old", job_id: "job-old", customer_name: "Older Customer" },
        { id: "quote-new", job_id: "job-new", customer_name: "Newest Customer" }
      ],
      rows: [],
      customers: [],
      payments: [],
      signedContracts: [
        { id: "quote-old", job_id: "job-old", signed_at: "2026-08-04T18:00:00.000Z", customer_printed_name: "Older Customer", quote_number: "Q-100" },
        { id: "quote-new", job_id: "job-new", signed_at: "2026-08-05T18:00:00.000Z", customer_printed_name: "Newest Customer", quote_number: "Q-101" }
      ],
      activityEvents: [
        { id: "duplicate", created_at: "2026-08-05T18:00:01.000Z", actor_email: "customer:Newest Customer", entity_type: "quote", entity_id: "quote-new", action: "customer.sign", before_data: null, after_data: null, metadata: {} }
      ]
    } as never);

    const signed = filterUnifiedActivity(feed, "signed_contracts");
    expect(signed.map((event) => event.customerName)).toEqual(["Newest Customer", "Older Customer"]);
    expect(signed.map((event) => event.description)).toEqual(["Contract Q-101 signed", "Contract Q-100 signed"]);
    expect(feed.filter((event) => event.entityId === "quote-new")).toHaveLength(1);
  });

  it("uses creation time to order same-day ledger payments without changing the paid date", () => {
    const feed = buildUnifiedActivityFeed({
      jobs,
      quotes,
      rows,
      customers: [],
      activityEvents: [],
      payments: [
        { id: "first", paid_at: "2026-08-04", created_at: "2026-08-04T08:00:00.000Z", payment_type: "zelle", payment_label: "Deposit", amount: 100, bookkeeping_entry_id: "entry-1", meta: {} },
        { id: "second", paid_at: "2026-08-04", created_at: "2026-08-04T20:00:00.000Z", payment_type: "venmo", payment_label: "Balance", amount: 200, bookkeeping_entry_id: "entry-1", meta: {} }
      ]
    } as never);

    expect(feed.map((event) => event.id)).toEqual(["payment:second", "payment:first"]);
    expect(feed.map((event) => event.timestamp)).toEqual(["2026-08-04", "2026-08-04"]);
  });

  it("resolves customers through linked metadata and keeps non-duplicate payment edits", () => {
    const feed = buildUnifiedActivityFeed({
      jobs,
      quotes,
      rows: [{ ...rows[0], payments: [{ id: "payment-1" }] }],
      customers: [],
      payments: [{ id: "payment-1", paid_at: "2026-08-04", created_at: "2026-08-04T10:00:00.000Z", payment_type: "venmo", payment_label: "Deposit", amount: 100, bookkeeping_entry_id: "entry-1", meta: {} }],
      activityEvents: [
        { id: "calendar", created_at: "2026-08-05T10:00:00.000Z", actor_email: "mike@805shutters.com", entity_type: "calendar_event", entity_id: "calendar-1", action: "reschedule", before_data: null, after_data: null, metadata: { jobId: "job-1" } },
        { id: "payment-edit", created_at: "2026-08-05T09:00:00.000Z", actor_email: "mike@805shutters.com", entity_type: "bookkeeping_payment", entity_id: "payment-1", action: "update", before_data: { amount: 100, bookkeeping_entry_id: "entry-1" }, after_data: { amount: 125, bookkeeping_entry_id: "entry-1" }, metadata: {} },
        { id: "payment-create", created_at: "2026-08-04T10:00:01.000Z", actor_email: "system@805shutters.com", entity_type: "bookkeeping_payment", entity_id: "payment-1", action: "create", before_data: null, after_data: { amount: 100 }, metadata: {} },
        { id: "payment-delete", created_at: "2026-08-03T10:00:00.000Z", actor_email: "mike@805shutters.com", entity_type: "bookkeeping_payment", entity_id: "deleted-payment", action: "delete", before_data: { amount: 50, bookkeeping_entry_id: "entry-1" }, after_data: null, metadata: {} }
      ]
    } as never);

    expect(feed.map((event) => event.id)).toEqual([
      "crm:calendar",
      "crm:payment-edit",
      "payment:payment-1",
      "crm:payment-delete"
    ]);
    expect(feed.every((event) => event.customerName === "Alex Rivera")).toBe(true);
    expect(feed.find((event) => event.id === "crm:payment-edit")?.description).toBe("Payment amount changed from $100.00 to $125.00");
    expect(feed.find((event) => event.id === "crm:payment-delete")?.description).toBe("Payment deleted");
  });

  it("buffers unseen rows away from the top and merges them at the top", () => {
    const displayed = [{ id: "old" }];
    const latest = [{ id: "new" }, { id: "old" }];

    expect(reconcileDisplayedActivity(displayed as never, latest as never, 100)).toEqual({ feed: displayed, pendingCount: 1 });
    expect(reconcileDisplayedActivity(displayed as never, latest as never, 0)).toEqual({ feed: latest, pendingCount: 0 });
  });
});
