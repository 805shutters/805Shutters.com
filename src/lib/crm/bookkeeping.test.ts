import { describe, expect, it } from "vitest";
import {
  BUSINESS_PAYOFF_TARGET,
  JESSICA_KEN_CUT_EXEMPT_FROM,
  OWNER_COMMISSION_RATE,
  buildBookkeepingRows,
  buildKenPayoffSummary,
  effectiveBookkeepingStatus,
  sumBookkeepingRows
} from "@/lib/crm/bookkeeping";
import { buildCommissionSummary } from "@/lib/crm/commissions";
import {
  CrmBookkeepingEntry,
  CrmBookkeepingPayment,
  CrmCommissionPayment,
  CrmJobExpense,
  CrmKenPayment,
  CrmQuote
} from "@/lib/crm/types";

function entry(overrides: Partial<CrmBookkeepingEntry> = {}): CrmBookkeepingEntry {
  return {
    id: "entry-1",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    quote_id: null,
    job_id: null,
    source: "manual",
    customer_name: "Test Customer",
    sold_date: "2026-05-01",
    total_amount: 0,
    payment_type: null,
    cogs_amount: 0,
    sales_owner: null,
    sales_owner_auth_user_id: null,
    sales_owner_set_at: null,
    installation_invoice_document_id: null,
    installation_invoice_amount: 0,
    installation_invoice_number: null,
    installation_invoice_url: null,
    installation_match_status: "unmatched",
    installation_matched_at: null,
    jessica_commission_paid_at: null,
    manufacturer_name: null,
    manufacturer_order_ref: null,
    manufacturer_order_url: null,
    manufacturer_document_url: null,
    notes: null,
    imported_sheet_row: null,
    ken_cut_override: null,
    ...overrides
  };
}

// Convenience: an entry whose installation is fully matched (so install cost is
// applied and Jessica's commission can be realized).
function installedEntry(overrides: Partial<CrmBookkeepingEntry> = {}): CrmBookkeepingEntry {
  return entry({
    installation_invoice_amount: 1000,
    installation_match_status: "matched",
    installation_matched_at: "2026-07-15T00:00:00.000Z",
    ...overrides
  });
}

function expense(overrides: Partial<CrmJobExpense> = {}): CrmJobExpense {
  return {
    id: "expense-1",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    bookkeeping_entry_id: null,
    quote_id: null,
    job_id: null,
    label: "Expense",
    category: "other",
    amount: 0,
    incurred_on: null,
    notes: null,
    source: "manual",
    ...overrides
  };
}

function payment(overrides: Partial<CrmBookkeepingPayment> = {}): CrmBookkeepingPayment {
  return {
    id: "pay-1",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    quote_id: null,
    job_id: null,
    bookkeeping_entry_id: null,
    payment_label: "Balance payment",
    payment_type: "cash",
    amount: 0,
    paid_at: null,
    notes: null,
    source: "manual",
    ...overrides
  };
}

function kenPayment(overrides: Partial<CrmKenPayment> = {}): CrmKenPayment {
  return {
    id: "ken-1",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    paid_on: "2026-06-30",
    period_month: "2026-06-30",
    amount: 0,
    note: null,
    created_by_email: null,
    meta: {},
    ...overrides
  };
}

function commissionPayment(overrides: Partial<CrmCommissionPayment> = {}): CrmCommissionPayment {
  return {
    id: "commission-1",
    created_at: "2026-06-30T00:00:00.000Z",
    updated_at: "2026-06-30T00:00:00.000Z",
    recipient: "mike",
    paid_on: "2026-06-30",
    period_month: "2026-06-01",
    amount: 0,
    note: null,
    created_by_email: null,
    meta: {},
    ...overrides
  };
}

function quote(overrides: Partial<CrmQuote> = {}): CrmQuote {
  return {
    id: "quote-1",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    job_id: "job-1",
    quote_number: null,
    status: "sold",
    quote_total: 0,
    materials_cost: 0,
    labor_cost: 0,
    discount: 0,
    tax: 0,
    deposit_required: 0,
    balance_due: 0,
    sold_by: null,
    sent_at: null,
    approved_at: null,
    sold_at: null,
    ordered_at: null,
    received_at: null,
    installed_at: null,
    archived_at: null,
    share_token: null,
    customer_signature: null,
    customer_printed_name: null,
    signed_at: null,
    quote_group_id: null,
    quote_label: null,
    meta: {},
    manufacturer_name: null,
    manufacturer_order_ref: null,
    manufacturer_order_url: null,
    manufacturer_document_url: null,
    customer_email: null,
    customer_phone: null,
    customer_address: null,
    notes: null,
    ...overrides
  };
}

function rowsFrom(args: {
  entries?: CrmBookkeepingEntry[];
  quotes?: CrmQuote[];
  expenses?: CrmJobExpense[];
  payments?: CrmBookkeepingPayment[];
}) {
  return buildBookkeepingRows({
    quotes: args.quotes ?? [],
    entries: args.entries ?? [],
    payments: args.payments ?? [],
    credits: [],
    expenses: args.expenses ?? []
  });
}

describe("bookkeeping notes", () => {
  it("does not show quote or contract notes as bookkeeping notes", () => {
    const [row] = rowsFrom({
      quotes: [
        quote({
          id: "q1",
          quote_total: 1000,
          notes:
            '{"__customerEmailNote":"Customer-facing pricing explanation that belongs on the quote, not bookkeeping."}'
        })
      ]
    });

    expect(row.notes).toBeNull();
  });

  it("shows notes saved on the bookkeeping entry for a quote row", () => {
    const [row] = rowsFrom({
      quotes: [quote({ id: "q1", quote_total: 1000 })],
      entries: [
        entry({
          id: "e1",
          source: "crm_quote",
          quote_id: "q1",
          notes: "Bookkeeping-only follow-up note"
        })
      ]
    });

    expect(row.notes).toBe("Bookkeeping-only follow-up note");
  });

  it("hides a legacy bookkeeping note that was copied from the quote note", () => {
    const copiedNote = "Contract note that belongs with the quote.";
    const [row] = rowsFrom({
      quotes: [quote({ id: "q1", quote_total: 1000, notes: copiedNote })],
      entries: [
        entry({
          id: "e1",
          source: "crm_quote",
          quote_id: "q1",
          notes: copiedNote
        })
      ]
    });

    expect(row.notes).toBeNull();
  });

  it("hides legacy customer email payloads copied into bookkeeping notes", () => {
    const [row] = rowsFrom({
      entries: [
        entry({
          id: "e1",
          notes:
            '{"__customerEmailNote":"Customer-facing pricing explanation that belongs on the quote, not bookkeeping."}'
        })
      ]
    });

    expect(row.notes).toBeNull();
  });
});

describe("bookkeeping ledger tombstones", () => {
  it("hides tombstoned entry rows from the ledger", () => {
    const rows = rowsFrom({
      entries: [
        entry({
          id: "e1",
          total_amount: 2704,
          meta: { bookkeeping_deleted_at: "2026-06-21T03:00:00.000Z" }
        })
      ]
    });

    expect(rows).toHaveLength(0);
  });

  it("uses a tombstoned linked entry to suppress the quote row underneath it", () => {
    const rows = rowsFrom({
      quotes: [quote({ id: "q1", quote_number: "Sheet row 7", quote_total: 2704 })],
      entries: [
        entry({
          id: "e1",
          source: "legacy_sheet",
          quote_id: "q1",
          imported_sheet_row: 7,
          total_amount: 2704,
          meta: { bookkeeping_deleted_at: "2026-06-21T03:00:00.000Z" }
        })
      ]
    });

    expect(rows).toHaveLength(0);
  });

  it("hides tombstoned quote rows from the ledger", () => {
    const rows = rowsFrom({
      quotes: [
        quote({
          id: "q1",
          quote_total: 2704,
          meta: { bookkeeping_deleted_at: "2026-06-21T03:00:00.000Z" }
        })
      ]
    });

    expect(rows).toHaveLength(0);
  });
});

describe("paid-in-full status", () => {
  it("keeps closed lifecycle status separate from paid-in-full balance math", () => {
    const [row] = rowsFrom({
      quotes: [quote({ id: "q1", status: "paid", quote_total: 1000, deposit_required: 500 })]
    });

    const projected = { ...row, liveStatus: "closed" as const };

    expect(projected.isPaidInFull).toBe(false);
    expect(projected.balance).toBe(1000);
    expect(effectiveBookkeepingStatus(projected)).toBe("closed");
  });

  it("marks a bookkeeping row closed when payments cover the total", () => {
    const [row] = rowsFrom({
      entries: [entry({ id: "e1", total_amount: 1000, sales_owner: "mike" })],
      payments: [payment({ id: "p1", bookkeeping_entry_id: "e1", amount: 1000 })]
    });
    const totals = sumBookkeepingRows([row]);

    expect(row.isPaidInFull).toBe(true);
    expect(row.status).toBe("closed");
    expect(row.balance).toBe(0);
    expect(totals.closedRows).toBe(1);
    expect(totals.closedTotal).toBe(1000);
    expect(totals.balance).toBe(0);
  });

  it("does not let overpayments reduce the open-balance ledger total", () => {
    const [row] = rowsFrom({
      entries: [entry({ id: "e1", total_amount: 1000, sales_owner: "mike" })],
      payments: [payment({ id: "p1", bookkeeping_entry_id: "e1", amount: 1200 })]
    });
    const totals = sumBookkeepingRows([row]);

    expect(row.isPaidInFull).toBe(true);
    expect(row.status).toBe("closed");
    expect(row.balance).toBe(-200);
    expect(totals.balance).toBe(0);
  });

  it("keeps a quote open when its status says paid but the ledger has a balance", () => {
    const [row] = rowsFrom({
      quotes: [quote({ id: "q1", status: "paid", quote_total: 1000, deposit_required: 500 })]
    });

    expect(row.isPaidInFull).toBe(false);
    expect(row.status).toBe("paid");
    expect(row.balance).toBe(1000);
  });

  it("marks a quote row closed when recorded deposit and balance payments cover the quote", () => {
    const [row] = rowsFrom({
      quotes: [quote({ id: "q1", status: "sold", quote_total: 1000, deposit_required: 500 })],
      payments: [
        payment({ id: "p1", quote_id: "q1", payment_label: "Deposit", amount: 500 }),
        payment({ id: "p2", quote_id: "q1", payment_label: "Balance payment", amount: 500 })
      ]
    });

    expect(row.isPaidInFull).toBe(true);
    expect(row.status).toBe("closed");
    expect(row.balance).toBe(0);
  });
});

describe("Ken cut", () => {
  it("defaults to 10% of the sale total for a Mike sale", () => {
    const [row] = rowsFrom({
      entries: [entry({ total_amount: 10000, cogs_amount: 3000, sales_owner: "mike", sold_date: "2026-05-01" })]
    });
    expect(row.kenCut).toBe(1000);
    expect(row.remainingProfitBeforeJessica).toBe(6000); // 10000 - 3000 - 1000
    expect(row.jessicaCommission).toBe(0);
    expect(row.mikeProfit).toBe(6000);
  });

  it("still charges Mike 10% even on sales after the exemption date", () => {
    const [row] = rowsFrom({
      entries: [entry({ total_amount: 10000, sales_owner: "mike", sold_date: "2026-12-01" })]
    });
    expect(row.kenCut).toBe(1000);
  });

  it("still charges Jessica 10% on sales before the exemption date", () => {
    const [row] = rowsFrom({
      entries: [entry({ total_amount: 10000, sales_owner: "jessica", sold_date: "2026-06-09" })]
    });
    expect(row.kenCut).toBe(1000);
  });

  it("exempts Jessica on sales on or after the exemption date", () => {
    const [row] = rowsFrom({
      entries: [entry({ total_amount: 10000, sales_owner: "jessica", sold_date: JESSICA_KEN_CUT_EXEMPT_FROM })]
    });
    expect(row.kenCut).toBe(0);
  });

  it("exempts Jessica regardless of whether installation is complete", () => {
    const [row] = rowsFrom({
      entries: [entry({ total_amount: 10000, sales_owner: "jessica", sold_date: "2026-07-01" })]
    });
    expect(row.kenCut).toBe(0);
  });
});

describe("ken_cut_override", () => {
  it("pins an explicit dollar amount over the default rule", () => {
    const [row] = rowsFrom({
      entries: [entry({ total_amount: 10000, cogs_amount: 3000, sales_owner: "mike", ken_cut_override: 500 })]
    });
    expect(row.kenCut).toBe(500);
    expect(row.remainingProfitBeforeJessica).toBe(6500); // 10000 - 3000 - 500
  });

  it("waives Ken's cut entirely when set to 0", () => {
    const [row] = rowsFrom({
      entries: [entry({ total_amount: 10000, cogs_amount: 3000, sales_owner: "mike", ken_cut_override: 0 })]
    });
    expect(row.kenCut).toBe(0);
    expect(row.remainingProfitBeforeJessica).toBe(7000);
  });
});

describe("job expenses", () => {
  it("subtracts entry-linked expenses from net profit", () => {
    const [row] = rowsFrom({
      entries: [entry({ id: "e1", total_amount: 10000, cogs_amount: 3000, sales_owner: "mike", ken_cut_override: 0 })],
      expenses: [
        expense({ id: "x1", bookkeeping_entry_id: "e1", amount: 250 }),
        expense({ id: "x2", bookkeeping_entry_id: "e1", amount: 150 })
      ]
    });
    expect(row.expensesTotal).toBe(400);
    expect(row.remakeTotal).toBe(0);
    expect(row.remainingProfitBeforeJessica).toBe(6600); // 10000 - 3000 - 0 - 400
    expect(row.mikeProfit).toBe(6600);
  });

  it("tracks remake costs separately from other expenses and subtracts both from profit", () => {
    const [row] = rowsFrom({
      entries: [entry({ id: "e1", total_amount: 10000, cogs_amount: 3000, sales_owner: "mike", ken_cut_override: 0 })],
      expenses: [
        expense({ id: "x1", bookkeeping_entry_id: "e1", category: "other", amount: 250 }),
        expense({ id: "r1", bookkeeping_entry_id: "e1", category: "remake", amount: 325 })
      ]
    });
    expect(row.expenses).toHaveLength(1);
    expect(row.expensesTotal).toBe(250);
    expect(row.remakeTotal).toBe(325);
    expect(row.remainingProfitBeforeJessica).toBe(6425); // 10000 - 3000 - 0 - 250 - 325
    expect(row.mikeProfit).toBe(6425);
  });

  it("matches job-linked expenses to the row and counts each only once", () => {
    const [row] = rowsFrom({
      entries: [entry({ id: "e1", job_id: "job-9", total_amount: 5000, cogs_amount: 0, ken_cut_override: 0 })],
      expenses: [expense({ id: "x1", job_id: "job-9", amount: 300 })]
    });
    expect(row.expenses).toHaveLength(1);
    expect(row.expensesTotal).toBe(300);
    expect(row.remainingProfitBeforeJessica).toBe(4700);
  });

  it("ignores expenses that do not match any row", () => {
    const [row] = rowsFrom({
      entries: [entry({ id: "e1", total_amount: 5000, ken_cut_override: 0 })],
      expenses: [expense({ id: "x1", bookkeeping_entry_id: "other", amount: 999 })]
    });
    expect(row.expensesTotal).toBe(0);
  });
});

describe("Jessica's 50% commission", () => {
  it("pays Jessica half of net profit only on her own completed installs", () => {
    const [row] = rowsFrom({
      entries: [
        installedEntry({
          total_amount: 10000,
          cogs_amount: 3000,
          sales_owner: "jessica",
          sold_date: "2026-07-01",
          installation_invoice_amount: 1000
        })
      ]
    });
    // Ken exempt (Jessica, after cutoff); install cost applies.
    expect(row.kenCut).toBe(0);
    expect(row.isInstallationComplete).toBe(true);
    expect(row.remainingProfitBeforeJessica).toBe(6000); // 10000 - 3000 - 0 - 1000
    expect(row.jessicaCommission).toBe(3000);
    expect(row.mikeProfit).toBe(3000);
  });

  it("pays Jessica nothing until installation is complete", () => {
    const [row] = rowsFrom({
      entries: [
        entry({ total_amount: 10000, cogs_amount: 3000, sales_owner: "jessica", sold_date: "2026-07-01" })
      ]
    });
    expect(row.isInstallationComplete).toBe(false);
    expect(row.jessicaCommission).toBe(0);
    expect(row.mikeProfit).toBe(7000); // 10000 - 3000 - 0 (exempt) - 0 install
  });

  it("keeps 100% with Mike on his own sales (no split)", () => {
    const [row] = rowsFrom({
      entries: [
        installedEntry({
          total_amount: 10000,
          cogs_amount: 3000,
          sales_owner: "mike",
          sold_date: "2026-07-01",
          installation_invoice_amount: 1000
        })
      ]
    });
    expect(row.kenCut).toBe(1000); // Mike is not exempt
    expect(row.jessicaCommission).toBe(0);
    expect(row.mikeProfit).toBe(5000); // 10000 - 3000 - 1000 - 1000
  });

  it("nets expenses out before splitting Jessica's commission", () => {
    const [row] = rowsFrom({
      entries: [
        installedEntry({
          id: "e1",
          total_amount: 10000,
          cogs_amount: 3000,
          sales_owner: "jessica",
          sold_date: "2026-07-01",
          installation_invoice_amount: 1000
        })
      ],
      expenses: [expense({ id: "x1", bookkeeping_entry_id: "e1", amount: 400 })]
    });
    expect(row.remainingProfitBeforeJessica).toBe(5600); // 10000 - 3000 - 0 - 1000 - 400
    expect(row.jessicaCommission).toBe(2800);
    expect(row.mikeProfit).toBe(2800);
  });

  it("nets remake costs out before splitting Jessica's commission", () => {
    const [row] = rowsFrom({
      entries: [
        installedEntry({
          id: "e1",
          total_amount: 10000,
          cogs_amount: 3000,
          sales_owner: "jessica",
          sold_date: "2026-07-01",
          installation_invoice_amount: 1000
        })
      ],
      expenses: [expense({ id: "r1", bookkeeping_entry_id: "e1", category: "remake", amount: 500 })]
    });
    expect(row.expensesTotal).toBe(0);
    expect(row.remakeTotal).toBe(500);
    expect(row.remainingProfitBeforeJessica).toBe(5500); // 10000 - 3000 - 0 - 1000 - 500
    expect(row.jessicaCommission).toBe(2750);
    expect(row.mikeProfit).toBe(2750);
  });

  it("reports commission as owed until it is marked paid", () => {
    const unpaid = installedEntry({
      total_amount: 10000,
      cogs_amount: 3000,
      sales_owner: "jessica",
      sold_date: "2026-07-01",
      installation_invoice_amount: 1000
    });
    const [owedRow] = rowsFrom({ entries: [unpaid] });
    expect(owedRow.jessicaCommissionOwed).toBe(3000);

    const [paidRow] = rowsFrom({
      entries: [{ ...unpaid, jessica_commission_paid_at: "2026-08-01T00:00:00.000Z" }]
    });
    expect(paidRow.jessicaCommission).toBe(3000);
    expect(paidRow.jessicaCommissionOwed).toBe(0);
  });

  it("rounds split commission to whole cents", () => {
    const [row] = rowsFrom({
      entries: [
        installedEntry({
          total_amount: 100,
          cogs_amount: 33.33,
          sales_owner: "jessica",
          sold_date: "2026-07-01",
          installation_invoice_amount: 0,
          installation_invoice_document_id: "doc-1"
        })
      ]
    });
    expect(row.remainingProfitBeforeJessica).toBe(66.67);
    expect(row.jessicaCommission).toBe(33.34); // 66.67 / 2, rounded
    expect(row.mikeProfit).toBe(33.33);
  });
});

describe("quote-sourced rows", () => {
  it("applies the same rules to a Jessica-sold quote with a matched install", () => {
    const rows = rowsFrom({
      quotes: [
        quote({
          id: "Q1",
          job_id: "J1",
          status: "sold",
          quote_total: 10000,
          materials_cost: 3000,
          sold_by: "Jessica",
          sold_at: "2026-07-01T00:00:00.000Z"
        })
      ],
      entries: [
        entry({
          id: "meta-1",
          source: "crm_quote",
          quote_id: "Q1",
          job_id: "J1",
          cogs_amount: 3000,
          sales_owner: "jessica",
          installation_invoice_amount: 1000,
          installation_match_status: "matched"
        })
      ]
    });
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row.source).toBe("crm_quote");
    expect(row.kenCut).toBe(0);
    expect(row.remainingProfitBeforeJessica).toBe(6000);
    expect(row.jessicaCommission).toBe(3000);
    expect(row.mikeProfit).toBe(3000);
  });
});

describe("sumBookkeepingRows", () => {
  it("aggregates expenses, remake costs, Ken cut, and both partners' profit", () => {
    const rows = rowsFrom({
      entries: [
        installedEntry({
          id: "e1",
          total_amount: 10000,
          cogs_amount: 3000,
          sales_owner: "jessica",
          sold_date: "2026-07-01",
          installation_invoice_amount: 1000
        }),
        entry({ id: "e2", total_amount: 5000, cogs_amount: 1000, sales_owner: "mike", sold_date: "2026-05-01" })
      ],
      expenses: [
        expense({ id: "x1", bookkeeping_entry_id: "e1", amount: 400 }),
        expense({ id: "r1", bookkeeping_entry_id: "e1", category: "remake", amount: 200 })
      ]
    });
    const totals = sumBookkeepingRows(rows);
    expect(totals.rows).toBe(2);
    expect(totals.total).toBe(15000);
    expect(totals.cogs).toBe(4000);
    expect(totals.expensesTotal).toBe(400);
    expect(totals.remakeTotal).toBe(200);
    expect(totals.kenCut).toBe(500); // e1 exempt (0) + e2 10% of 5000 (500)
    expect(totals.jessicaCommission).toBe(2700); // half of (10000-3000-1000-400-200)
    expect(totals.jessicaCommissionOwed).toBe(2700);
    expect(totals.mikeProfit).toBe(6200); // e1 2700 + e2 (5000-1000-500) 3500
  });

  it("tracks Ken's current-month due and running total from closed jobs only", () => {
    const rows = rowsFrom({
      entries: [
        entry({ id: "closed-june", total_amount: 10000, sales_owner: "mike", sold_date: "2026-06-01" }),
        entry({ id: "closed-july", total_amount: 10000, sales_owner: "mike", sold_date: "2026-06-01" }),
        entry({ id: "open-june", total_amount: 10000, sales_owner: "mike", sold_date: "2026-06-01" })
      ],
      payments: [
        payment({ id: "p1", bookkeeping_entry_id: "closed-june", amount: 10000, paid_at: "2026-06-20" }),
        payment({ id: "p2", bookkeeping_entry_id: "closed-july", amount: 5000, paid_at: "2026-06-25" }),
        payment({ id: "p3", bookkeeping_entry_id: "closed-july", amount: 5000, paid_at: "2026-07-02" }),
        payment({ id: "p4", bookkeeping_entry_id: "open-june", amount: 5000, paid_at: "2026-06-20" })
      ]
    });
    const totals = sumBookkeepingRows(rows, { month: "2026-06" });

    expect(totals.closedRows).toBe(2);
    expect(totals.kenMonthlyDue).toBe(1000);
    expect(totals.kenTotalClosed).toBe(2000);
  });
});

describe("buildCommissionSummary", () => {
  it("earns commission only after close/paid in full and applies Mike/Jessica sale rules", () => {
    const rows = rowsFrom({
      entries: [
        installedEntry({
          id: "mike-closed",
          total_amount: 10000,
          cogs_amount: 3000,
          sales_owner: "mike",
          sold_date: "2026-07-01",
          installation_invoice_amount: 1000
        }),
        installedEntry({
          id: "jessica-closed",
          total_amount: 10000,
          cogs_amount: 3000,
          sales_owner: "jessica",
          sold_date: "2026-07-01",
          installation_invoice_amount: 1000
        }),
        installedEntry({
          id: "jessica-open",
          total_amount: 10000,
          cogs_amount: 3000,
          sales_owner: "jessica",
          sold_date: "2026-07-01",
          installation_invoice_amount: 1000
        })
      ],
      payments: [
        payment({ id: "pay-mike", bookkeeping_entry_id: "mike-closed", amount: 10000, paid_at: "2026-07-20" }),
        payment({ id: "pay-jessica", bookkeeping_entry_id: "jessica-closed", amount: 10000, paid_at: "2026-07-21" })
      ]
    });

    const summary = buildCommissionSummary(rows, []);

    expect(summary.monthly).toHaveLength(1);
    expect(summary.monthly[0]).toMatchObject({
      periodMonth: "2026-07-01",
      mikeEarned: 8000,
      jessicaEarned: 3000,
      mikePaid: 0,
      jessicaPaid: 0,
      mikeBalance: 8000,
      jessicaBalance: 3000
    });
    expect(summary.totals.mikeOwed).toBe(8000);
    expect(summary.totals.jessicaOwed).toBe(3000);
  });

  it("subtracts Mike/Jessica payment ledger rows into running balances", () => {
    const rows = rowsFrom({
      entries: [
        installedEntry({
          id: "mike-closed",
          total_amount: 10000,
          cogs_amount: 3000,
          sales_owner: "mike",
          sold_date: "2026-07-01",
          installation_invoice_amount: 1000
        }),
        installedEntry({
          id: "jessica-closed",
          total_amount: 10000,
          cogs_amount: 3000,
          sales_owner: "jessica",
          sold_date: "2026-07-01",
          installation_invoice_amount: 1000
        })
      ],
      payments: [
        payment({ id: "pay-mike", bookkeeping_entry_id: "mike-closed", amount: 10000, paid_at: "2026-07-20" }),
        payment({ id: "pay-jessica", bookkeeping_entry_id: "jessica-closed", amount: 10000, paid_at: "2026-07-21" })
      ]
    });

    const summary = buildCommissionSummary(rows, [
      commissionPayment({ id: "mike-check", recipient: "mike", amount: 2500, paid_on: "2026-07-31", period_month: "2026-07-01" }),
      commissionPayment({
        id: "jessica-check",
        recipient: "jessica",
        amount: 1000,
        paid_on: "2026-07-31",
        period_month: "2026-07-01"
      })
    ]);

    expect(summary.totals).toMatchObject({
      mikeEarned: 8000,
      mikePaid: 2500,
      mikeOwed: 5500,
      jessicaEarned: 3000,
      jessicaPaid: 1000,
      jessicaOwed: 2000
    });
    expect(summary.monthly[0].mikeBalance).toBe(5500);
    expect(summary.monthly[0].jessicaBalance).toBe(2000);
  });
});

describe("constants", () => {
  it("keeps the historical 10% owner commission rate", () => {
    expect(OWNER_COMMISSION_RATE).toBe(0.1);
  });
});

describe("buildKenPayoffSummary", () => {
  it("accrues Ken's 10% only on jobs the customer has paid in full", () => {
    const rows = rowsFrom({
      entries: [
        entry({ id: "e1", total_amount: 10000, sales_owner: "mike", sold_date: "2026-05-01" }),
        entry({ id: "e2", total_amount: 10000, sales_owner: "mike", sold_date: "2026-05-01" })
      ],
      payments: [payment({ id: "p1", bookkeeping_entry_id: "e1", amount: 10000 })]
    });
    const summary = buildKenPayoffSummary({ rows, payments: [] });
    expect(summary.kenAccruedCompleted).toBe(1000); // only e1 is paid in full
    expect(summary.kenAccruedAll).toBe(2000);
    expect(summary.completedJobs).toBe(1);
    expect(summary.kenOwed).toBe(1000);
  });

  it("excludes Jessica's exempt jobs from Ken's check even when paid in full", () => {
    const rows = rowsFrom({
      entries: [entry({ id: "e1", total_amount: 10000, sales_owner: "jessica", sold_date: "2026-07-01" })],
      payments: [payment({ id: "p1", bookkeeping_entry_id: "e1", amount: 10000 })]
    });
    const summary = buildKenPayoffSummary({ rows, payments: [] });
    expect(summary.kenAccruedCompleted).toBe(0);
    expect(summary.completedJobs).toBe(0);
  });

  it("counts opening balance plus recorded payments toward the payoff", () => {
    const summary = buildKenPayoffSummary({
      rows: [],
      payments: [kenPayment({ amount: 50000 }), kenPayment({ id: "ken-2", amount: 25000 })],
      openingBalance: 100000
    });
    expect(summary.recordedPayments).toBe(75000);
    expect(summary.kenPaid).toBe(175000);
    expect(summary.payoffTarget).toBe(500000);
    expect(summary.payoffRemaining).toBe(325000);
    expect(summary.payoffPct).toBe(35);
    expect(summary.isPaidOff).toBe(false);
  });

  it("reduces what's owed by what Ken has already been paid", () => {
    const rows = rowsFrom({
      entries: [entry({ id: "e1", total_amount: 10000, sales_owner: "mike" })],
      payments: [payment({ id: "p1", bookkeeping_entry_id: "e1", amount: 10000 })]
    });
    const summary = buildKenPayoffSummary({ rows, payments: [], openingBalance: 100000 });
    expect(summary.kenAccruedCompleted).toBe(1000);
    expect(summary.kenOwed).toBe(0); // already paid far more than accrued
  });

  it("flags paid off and caps the percentage at 100", () => {
    const summary = buildKenPayoffSummary({ rows: [], payments: [], openingBalance: 600000 });
    expect(summary.payoffRemaining).toBe(0);
    expect(summary.isPaidOff).toBe(true);
    expect(summary.payoffPct).toBe(100);
  });

  it("honors a custom payoff target", () => {
    const summary = buildKenPayoffSummary({
      rows: [],
      payments: [],
      openingBalance: 45000,
      payoffTarget: 450000
    });
    expect(summary.payoffTarget).toBe(450000);
    expect(summary.payoffRemaining).toBe(405000);
    expect(summary.payoffPct).toBe(10);
  });

  it("defaults the target to the business payoff constant", () => {
    const summary = buildKenPayoffSummary({ rows: [], payments: [] });
    expect(summary.payoffTarget).toBe(BUSINESS_PAYOFF_TARGET);
    expect(BUSINESS_PAYOFF_TARGET).toBe(500000);
  });
});

describe("deposit/balance only count recorded money (H7/M10/L16)", () => {
  it("a sold-but-unpaid quote shows nothing collected and the full balance owed", () => {
    const [row] = rowsFrom({
      quotes: [quote({ id: "q1", status: "sold", quote_total: 4000, deposit_required: 2000 })],
    });
    // deposit_required is what's OWED, not collected — nothing was recorded as paid
    expect(row.depositPaid).toBe(0);
    expect(row.paidTotal).toBe(0);
    expect(row.balance).toBe(4000);
    // depositDue reflects the quote's configured deposit, not a hardcoded 50%
    expect(row.depositDue).toBe(2000);
  });

  it("counts a recorded deposit payment as collected", () => {
    const [row] = rowsFrom({
      quotes: [quote({ id: "q2", status: "sold", quote_total: 4000, deposit_required: 2000 })],
      payments: [payment({ quote_id: "q2", amount: 2000, payment_label: "Deposit" })],
    });
    expect(row.depositPaid).toBe(2000);
    expect(row.paidTotal).toBe(2000);
    expect(row.balance).toBe(2000);
  });
});
