import { describe, expect, it } from "vitest";
import {
  BUSINESS_PAYOFF_TARGET,
  ADVERTISING_RESERVE_EFFECTIVE_FROM,
  ADVERTISING_RESERVE_RATE,
  OWNER_COMMISSION_RATE,
  buildAccountabilityQueue,
  buildBookkeepingRows,
  buildKenPayoffSummary,
  effectiveBookkeepingStatus,
  kenCutOverrideInputValue,
  normalizeKenCutOverrideInput,
  sumBookkeepingRows
} from "@/lib/crm/bookkeeping";
import { buildCommissionSummary } from "@/lib/crm/commissions";
import {
  CrmBookkeepingCredit,
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
    sold_date: ADVERTISING_RESERVE_EFFECTIVE_FROM,
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
    installation_invoice_paid_at: null,
    installation_invoice_paid_amount: 0,
    installation_invoice_payment_method: null,
    installation_invoice_payment_notes: null,
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

// Convenience: an entry whose installation is fully matched, so install cost is
// applied before profit is split.
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

function credit(overrides: Partial<CrmBookkeepingCredit> = {}): CrmBookkeepingCredit {
  return {
    id: "credit-1",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    from_quote_id: null,
    from_bookkeeping_entry_id: null,
    to_quote_id: null,
    to_bookkeeping_entry_id: null,
    amount: 0,
    credit_date: null,
    note: null,
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
  credits?: CrmBookkeepingCredit[];
}) {
  return buildBookkeepingRows({
    quotes: args.quotes ?? [],
    entries: args.entries ?? [],
    payments: args.payments ?? [],
    credits: args.credits ?? [],
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

describe("signed quote sale projection", () => {
  it("creates a sold ledger row when a quote has a signature but stale sent status", () => {
    const signedAt = "2026-07-02T22:15:00.000Z";
    const rows = rowsFrom({
      quotes: [
        quote({
          id: "signed-stale-sent",
          status: "sent",
          quote_total: 2500,
          signed_at: signedAt
        })
      ]
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "signed-stale-sent",
      status: "sold",
      soldDate: signedAt,
      total: 2500
    });
    expect(effectiveBookkeepingStatus(rows[0])).toBe("sold");
  });

  it("projects a sent quote into bookkeeping when it has a recorded payment", () => {
    const rows = rowsFrom({
      quotes: [
        quote({
          id: "paid-stale-sent",
          status: "sent",
          quote_total: 1222.14,
          deposit_required: 611.07
        })
      ],
      payments: [
        payment({
          id: "square-deposit",
          quote_id: "paid-stale-sent",
          payment_label: "Deposit",
          payment_type: "credit_card",
          amount: 611.07,
          source: "crm_quote"
        })
      ]
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "paid-stale-sent",
      depositPaid: 611.07,
      balance: 611.07,
      paidTotal: 611.07
    });
  });
});

describe("paid-in-full status", () => {
  it("keeps open-balance rows financially active even if the live lifecycle says closed", () => {
    const [row] = rowsFrom({
      quotes: [quote({ id: "q1", status: "paid", quote_total: 1000, deposit_required: 500 })]
    });

    const projected = { ...row, liveStatus: "closed" as const };

    expect(projected.isPaidInFull).toBe(false);
    expect(projected.balance).toBe(1000);
    expect(effectiveBookkeepingStatus(projected)).toBe("invoiced");
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
        payment({ id: "p1", quote_id: "q1", payment_label: "Deposit", payment_type: "check", amount: 500 }),
        payment({ id: "p2", quote_id: "q1", payment_label: "Balance payment", payment_type: "venmo", amount: 500 })
      ]
    });

    expect(row.isPaidInFull).toBe(true);
    expect(row.status).toBe("closed");
    expect(row.balance).toBe(0);
    expect(row.depositPaymentType).toBe("check");
    expect(row.balancePaymentType).toBe("venmo");
  });

  it("applies balance adjustment credits to the visible open balance", () => {
    const [discountedRow, increasedRow] = rowsFrom({
      entries: [
        entry({ id: "discounted", total_amount: 1000 }),
        entry({ id: "increased", total_amount: 1000 })
      ],
      payments: [
        payment({ id: "discounted-payment", bookkeeping_entry_id: "discounted", amount: 500 }),
        payment({ id: "increased-payment", bookkeeping_entry_id: "increased", amount: 500 })
      ],
      credits: [
        credit({ id: "discount", to_bookkeeping_entry_id: "discounted", amount: 125 }),
        credit({ id: "correction", from_bookkeeping_entry_id: "increased", amount: 75 })
      ]
    });

    expect(discountedRow.balance).toBe(375);
    expect(discountedRow.creditIn).toBe(125);
    expect(increasedRow.balance).toBe(575);
    expect(increasedRow.creditOut).toBe(75);
  });
});

describe("Ken cut", () => {
  it("defaults to 10% of the sale total for a Mike sale", () => {
    const [row] = rowsFrom({
      entries: [
        entry({
          total_amount: 10000,
          cogs_amount: 3000,
          sales_owner: "mike",
          sold_date: ADVERTISING_RESERVE_EFFECTIVE_FROM
        })
      ]
    });
    expect(row.kenCut).toBe(1000);
    expect(row.advertisingReserve).toBe(700);
    expect(row.remainingProfitBeforeJessica).toBe(5300);
    expect(row.jessicaCommission).toBe(0);
    expect(row.mikeProfit).toBe(5300);
  });

  it("charges 10% on Jessica's sales too — the June 2026 exemption is gone", () => {
    const [row] = rowsFrom({
      entries: [entry({ total_amount: 10000, sales_owner: "jessica", sold_date: ADVERTISING_RESERVE_EFFECTIVE_FROM })]
    });
    expect(row.kenCut).toBe(1000);
  });

  it("charges 10% regardless of sold date", () => {
    const dates = ["2026-06-09", "2026-06-10", "2026-12-01"];
    for (const soldDate of dates) {
      const [row] = rowsFrom({
        entries: [entry({ total_amount: 10000, sales_owner: "jessica", sold_date: soldDate })]
      });
      expect(row.kenCut).toBe(1000);
    }
  });
});

describe("ken_cut_override", () => {
  it("keeps automatic Ken input blank and preserves explicit zero", () => {
    expect(kenCutOverrideInputValue(null)).toBe("");
    expect(kenCutOverrideInputValue(undefined)).toBe("");
    expect(kenCutOverrideInputValue(0)).toBe("0");
    expect(kenCutOverrideInputValue(320.51)).toBe("320.51");
    expect(normalizeKenCutOverrideInput("")).toBeNull();
    expect(normalizeKenCutOverrideInput("   ")).toBeNull();
    expect(normalizeKenCutOverrideInput("320.515")).toBe(320.52);
    expect(normalizeKenCutOverrideInput("-10")).toBe(0);
  });

  it("recalculates automatic Ken when gross changes without materializing an override", () => {
    const [before] = rowsFrom({
      entries: [entry({ total_amount: 3205.12, sales_owner: "jessica", ken_cut_override: null })]
    });
    const [after] = rowsFrom({
      entries: [entry({ total_amount: 3955.12, sales_owner: "jessica", ken_cut_override: null })]
    });

    expect(before.kenCut).toBe(320.51);
    expect(before.kenCutOverride).toBeNull();
    expect(after.kenCut).toBe(395.51);
    expect(after.kenCutOverride).toBeNull();
  });

  it("pins an explicit dollar amount over the default rule", () => {
    const [row] = rowsFrom({
      entries: [entry({ total_amount: 10000, cogs_amount: 3000, sales_owner: "mike", ken_cut_override: 500 })]
    });
    expect(row.kenCut).toBe(500);
    expect(row.remainingProfitBeforeJessica).toBe(5800);
  });

  it("waives Ken's cut entirely when set to 0", () => {
    const [row] = rowsFrom({
      entries: [entry({ total_amount: 10000, cogs_amount: 3000, sales_owner: "mike", ken_cut_override: 0 })]
    });
    expect(row.kenCut).toBe(0);
    expect(row.remainingProfitBeforeJessica).toBe(6300);
  });

  it("returns to automatic 10% when an override is cleared", () => {
    const [row] = rowsFrom({
      entries: [entry({ total_amount: 3955.12, sales_owner: "jessica", ken_cut_override: null })]
    });
    expect(row.kenCut).toBe(395.51);
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
    expect(row.remainingProfitBeforeJessica).toBe(5900);
    expect(row.mikeProfit).toBe(5900);
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
    expect(row.remainingProfitBeforeJessica).toBe(5725);
    expect(row.mikeProfit).toBe(5725);
  });

  it("matches job-linked expenses to the row and counts each only once", () => {
    const [row] = rowsFrom({
      entries: [entry({ id: "e1", job_id: "job-9", total_amount: 5000, cogs_amount: 0, ken_cut_override: 0 })],
      expenses: [expense({ id: "x1", job_id: "job-9", amount: 300 })]
    });
    expect(row.expenses).toHaveLength(1);
    expect(row.expensesTotal).toBe(300);
    expect(row.remainingProfitBeforeJessica).toBe(4350);
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
  it("pays Jessica half of net profit on her own completed installs", () => {
    const [row] = rowsFrom({
      entries: [
        installedEntry({
          total_amount: 10000,
          cogs_amount: 3000,
          sales_owner: "jessica",
          sold_date: ADVERTISING_RESERVE_EFFECTIVE_FROM,
          installation_invoice_amount: 1000
        })
      ]
    });
    // Ken's 10% comes off first, then the matched install cost.
    expect(row.kenCut).toBe(1000);
    expect(row.isInstallationComplete).toBe(true);
    expect(row.advertisingReserve).toBe(700);
    expect(row.remainingProfitBeforeJessica).toBe(4300);
    expect(row.jessicaCommission).toBe(2150);
    expect(row.mikeProfit).toBe(2150);
  });

  it("splits Jessica's own sale even before an install invoice is matched", () => {
    const [row] = rowsFrom({
      entries: [
        entry({ total_amount: 10000, cogs_amount: 3000, sales_owner: "jessica", sold_date: ADVERTISING_RESERVE_EFFECTIVE_FROM })
      ]
    });
    expect(row.isInstallationComplete).toBe(false);
    expect(row.remainingProfitBeforeJessica).toBe(5300);
    expect(row.jessicaCommission).toBe(2650);
    expect(row.mikeProfit).toBe(2650);
  });

  it("uses a quote's sold-by Jessica value for the 50/50 split", () => {
    const [row] = rowsFrom({
      quotes: [
        quote({
          id: "q1",
          status: "sold",
          quote_total: 10000,
          materials_cost: 3000,
          sold_by: "Jessica",
          sold_at: ADVERTISING_RESERVE_EFFECTIVE_FROM
        })
      ]
    });
    expect(row.salesOwner).toBe("jessica");
    expect(row.isInstallationComplete).toBe(false);
    expect(row.remainingProfitBeforeJessica).toBe(5300);
    expect(row.jessicaCommission).toBe(2650);
    expect(row.mikeProfit).toBe(2650);
  });

  it("keeps 100% with Mike on his own sales (no split)", () => {
    const [row] = rowsFrom({
      entries: [
        installedEntry({
          total_amount: 10000,
          cogs_amount: 3000,
          sales_owner: "mike",
          sold_date: ADVERTISING_RESERVE_EFFECTIVE_FROM,
          installation_invoice_amount: 1000
        })
      ]
    });
    expect(row.kenCut).toBe(1000); // Mike is not exempt
    expect(row.jessicaCommission).toBe(0);
    expect(row.mikeProfit).toBe(4300);
  });

  it("nets expenses out before splitting Jessica's commission", () => {
    const [row] = rowsFrom({
      entries: [
        installedEntry({
          id: "e1",
          total_amount: 10000,
          cogs_amount: 3000,
          sales_owner: "jessica",
          sold_date: ADVERTISING_RESERVE_EFFECTIVE_FROM,
          installation_invoice_amount: 1000
        })
      ],
      expenses: [expense({ id: "x1", bookkeeping_entry_id: "e1", amount: 400 })]
    });
    expect(row.remainingProfitBeforeJessica).toBe(3900);
    expect(row.jessicaCommission).toBe(1950);
    expect(row.mikeProfit).toBe(1950);
  });

  it("nets remake costs out before splitting Jessica's commission", () => {
    const [row] = rowsFrom({
      entries: [
        installedEntry({
          id: "e1",
          total_amount: 10000,
          cogs_amount: 3000,
          sales_owner: "jessica",
          sold_date: ADVERTISING_RESERVE_EFFECTIVE_FROM,
          installation_invoice_amount: 1000
        })
      ],
      expenses: [expense({ id: "r1", bookkeeping_entry_id: "e1", category: "remake", amount: 500 })]
    });
    expect(row.expensesTotal).toBe(0);
    expect(row.remakeTotal).toBe(500);
    expect(row.remainingProfitBeforeJessica).toBe(3800);
    expect(row.jessicaCommission).toBe(1900);
    expect(row.mikeProfit).toBe(1900);
  });

  it("reports commission as owed until it is marked paid", () => {
    const unpaid = installedEntry({
      total_amount: 10000,
      cogs_amount: 3000,
      sales_owner: "jessica",
      sold_date: ADVERTISING_RESERVE_EFFECTIVE_FROM,
      installation_invoice_amount: 1000
    });
    const [owedRow] = rowsFrom({ entries: [unpaid] });
    expect(owedRow.jessicaCommissionOwed).toBe(2150);

    const [paidRow] = rowsFrom({
      entries: [{ ...unpaid, jessica_commission_paid_at: "2026-08-01T00:00:00.000Z" }]
    });
    expect(paidRow.jessicaCommission).toBe(2150);
    expect(paidRow.jessicaCommissionOwed).toBe(0);
  });

  it("tracks paid and open installation invoice amounts separately from customer payments", () => {
    const rows = rowsFrom({
      entries: [
        installedEntry({
          id: "open-install",
          total_amount: 5000,
          cogs_amount: 1200,
          installation_invoice_amount: 750,
          installation_invoice_paid_amount: 250,
          installation_invoice_paid_at: null
        }),
        installedEntry({
          id: "paid-install",
          total_amount: 5000,
          cogs_amount: 1200,
          installation_invoice_amount: 750,
          installation_invoice_paid_amount: 750,
          installation_invoice_paid_at: "2026-07-20",
          installation_invoice_payment_method: "check",
          installation_invoice_payment_notes: "Installer batch"
        }),
        installedEntry({
          id: "date-only-install",
          total_amount: 5000,
          cogs_amount: 1200,
          installation_invoice_amount: 400,
          installation_invoice_paid_at: "2026-07-21"
        })
      ]
    });
    const rowsById = new Map(rows.map((row) => [row.id, row]));
    const openRow = rowsById.get("open-install");
    const paidRow = rowsById.get("paid-install");
    const paidDateOnlyRow = rowsById.get("date-only-install");

    expect(openRow?.installationInvoicePaidAmount).toBe(250);
    expect(openRow?.installationInvoiceOpenAmount).toBe(500);
    expect(openRow?.isInstallationInvoicePaid).toBe(false);
    expect(paidRow?.installationInvoicePaidAmount).toBe(750);
    expect(paidRow?.installationInvoiceOpenAmount).toBe(0);
    expect(paidRow?.isInstallationInvoicePaid).toBe(true);
    expect(paidRow?.installationInvoicePaymentMethod).toBe("check");
    expect(paidRow?.installationInvoicePaymentNotes).toBe("Installer batch");
    expect(paidDateOnlyRow?.installationInvoicePaidAmount).toBe(400);
    expect(paidDateOnlyRow?.isInstallationInvoicePaid).toBe(true);
  });

  it("rounds split commission to whole cents", () => {
    const [row] = rowsFrom({
      entries: [
        installedEntry({
          total_amount: 100,
          cogs_amount: 33.33,
          sales_owner: "jessica",
          sold_date: ADVERTISING_RESERVE_EFFECTIVE_FROM,
          installation_invoice_amount: 0,
          installation_invoice_document_id: "doc-1"
        })
      ]
    });
    expect(row.advertisingReserve).toBe(7);
    expect(row.remainingProfitBeforeJessica).toBe(49.67);
    expect(row.jessicaCommission).toBe(24.84);
    expect(row.mikeProfit).toBe(24.83);
  });
});

describe("missing installer invoice hold", () => {
  it("flags a paid-in-full manual row with no matched installer invoice and holds Jessica's owed", () => {
    const [row] = rowsFrom({
      entries: [entry({ id: "e1", total_amount: 10000, cogs_amount: 3000, sales_owner: "jessica", sold_date: ADVERTISING_RESERVE_EFFECTIVE_FROM })],
      payments: [payment({ id: "p1", bookkeeping_entry_id: "e1", amount: 10000 })]
    });
    expect(row.isMissingInstallerInvoice).toBe(true);
    expect(row.jessicaCommission).toBe(2650); // estimate still shown after the reserve
    expect(row.jessicaCommissionOwed).toBe(0); // but nothing owed until the invoice lands

    const queue = buildAccountabilityQueue([row]);
    expect(queue.some((item) => item.type === "missing_installer_invoice")).toBe(true);
    expect(queue.some((item) => item.type === "commission_due")).toBe(false);
  });

  it("flags an installed quote even before it is paid in full", () => {
    const [row] = rowsFrom({
      quotes: [quote({ id: "q1", status: "installed", quote_total: 10000, sold_by: "Jessica", sold_at: ADVERTISING_RESERVE_EFFECTIVE_FROM })]
    });
    expect(row.isMissingInstallerInvoice).toBe(true);
    expect(row.jessicaCommissionOwed).toBe(0);
  });

  it("clears the flag once the installer invoice is matched", () => {
    const [row] = rowsFrom({
      entries: [
        installedEntry({
          id: "e1",
          total_amount: 10000,
          cogs_amount: 3000,
          sales_owner: "jessica",
          sold_date: ADVERTISING_RESERVE_EFFECTIVE_FROM,
          installation_invoice_amount: 1000
        })
      ],
      payments: [payment({ id: "p1", bookkeeping_entry_id: "e1", amount: 10000 })]
    });
    expect(row.isMissingInstallerInvoice).toBe(false);
    expect(row.jessicaCommissionOwed).toBe(2150);
  });

  it("never flags legacy sheet rows", () => {
    const [row] = rowsFrom({
      entries: [entry({ id: "e1", source: "legacy_sheet", total_amount: 10000, sales_owner: "mike" })],
      payments: [payment({ id: "p1", bookkeeping_entry_id: "e1", amount: 10000 })]
    });
    expect(row.isMissingInstallerInvoice).toBe(false);
  });

  it("does not hold rows whose Jessica commission was already paid out", () => {
    const [row] = rowsFrom({
      entries: [
        entry({
          id: "e1",
          total_amount: 10000,
          sales_owner: "jessica",
          jessica_commission_paid_at: "2026-06-01T00:00:00.000Z"
        })
      ],
      payments: [payment({ id: "p1", bookkeeping_entry_id: "e1", amount: 10000 })]
    });
    expect(row.isMissingInstallerInvoice).toBe(false);
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
          sold_at: "2026-07-20T00:00:00.000Z"
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
    expect(row.kenCut).toBe(1000);
    expect(row.remainingProfitBeforeJessica).toBe(4300);
    expect(row.jessicaCommission).toBe(2150);
    expect(row.mikeProfit).toBe(2150);
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
          sold_date: ADVERTISING_RESERVE_EFFECTIVE_FROM,
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
    expect(totals.kenCut).toBe(1500); // 10% of 10000 + 10% of 5000
    expect(totals.advertisingReserve).toBe(700);
    expect(totals.jessicaCommission).toBe(1850);
    expect(totals.jessicaCommissionOwed).toBe(1850);
    expect(totals.mikeProfit).toBe(5350);
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
          sold_date: ADVERTISING_RESERVE_EFFECTIVE_FROM,
          installation_invoice_amount: 1000
        }),
        installedEntry({
          id: "jessica-closed",
          total_amount: 10000,
          cogs_amount: 3000,
          sales_owner: "jessica",
          sold_date: ADVERTISING_RESERVE_EFFECTIVE_FROM,
          installation_invoice_amount: 1000
        }),
        installedEntry({
          id: "jessica-open",
          total_amount: 10000,
          cogs_amount: 3000,
          sales_owner: "jessica",
          sold_date: ADVERTISING_RESERVE_EFFECTIVE_FROM,
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
      mikeEarned: 6450,
      jessicaEarned: 2150,
      mikePaid: 0,
      jessicaPaid: 0,
      mikeBalance: 6450,
      jessicaBalance: 2150
    });
    expect(summary.totals.mikeOwed).toBe(6450);
    expect(summary.totals.jessicaOwed).toBe(2150);
  });

  it("subtracts Mike/Jessica payment ledger rows into running balances", () => {
    const rows = rowsFrom({
      entries: [
        installedEntry({
          id: "mike-closed",
          total_amount: 10000,
          cogs_amount: 3000,
          sales_owner: "mike",
          sold_date: ADVERTISING_RESERVE_EFFECTIVE_FROM,
          installation_invoice_amount: 1000
        }),
        installedEntry({
          id: "jessica-closed",
          total_amount: 10000,
          cogs_amount: 3000,
          sales_owner: "jessica",
          sold_date: ADVERTISING_RESERVE_EFFECTIVE_FROM,
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
      mikeEarned: 6450,
      mikePaid: 2500,
      mikeOwed: 3950,
      jessicaEarned: 2150,
      jessicaPaid: 1000,
      jessicaOwed: 1150
    });
    expect(summary.monthly[0].mikeBalance).toBe(3950);
    expect(summary.monthly[0].jessicaBalance).toBe(1150);
  });
});

describe("constants", () => {
  it("holds back 7% of gross sales for advertising", () => {
    expect(ADVERTISING_RESERVE_RATE).toBe(0.07);
  });

  it("starts the advertising reserve on July 20 without changing older Jessica jobs", () => {
    const rows = rowsFrom({
      entries: [
        entry({ id: "older", total_amount: 10000, sales_owner: "jessica", sold_date: "2026-07-19" }),
        entry({
          id: "effective",
          total_amount: 10000,
          sales_owner: "jessica",
          sold_date: ADVERTISING_RESERVE_EFFECTIVE_FROM
        })
      ]
    });
    const older = rows.find((row) => row.id === "older")!;
    const effective = rows.find((row) => row.id === "effective")!;

    expect(older.advertisingReserve).toBe(0);
    expect(older.jessicaCommission).toBe(4500);
    expect(effective.advertisingReserve).toBe(700);
    expect(effective.jessicaCommission).toBe(4150);
  });

  it("keeps the historical 10% owner commission rate", () => {
    expect(OWNER_COMMISSION_RATE).toBe(0.1);
  });
});

describe("buildKenPayoffSummary", () => {
  it("accrues Ken's 10% on closed jobs regardless of customer payment status", () => {
    const builtRows = rowsFrom({
      entries: [
        entry({ id: "e1", total_amount: 10000, sales_owner: "mike", sold_date: "2026-05-01" }),
        entry({ id: "e2", total_amount: 10000, sales_owner: "mike", sold_date: "2026-05-01" })
      ],
      payments: [payment({ id: "p1", bookkeeping_entry_id: "e1", amount: 10000 })]
    });
    const rows = builtRows.map((row) => row.id === "e2" ? { ...row, liveStatus: "closed" as const } : row);
    const summary = buildKenPayoffSummary({ rows, payments: [] });
    expect(summary.kenAccruedCompleted).toBe(2000);
    expect(summary.kenAccruedAll).toBe(2000);
    expect(summary.completedJobs).toBe(2);
    expect(summary.kenOwed).toBe(2000);
  });

  it("rounds Ken's fixed 10% per closed job before summing", () => {
    const rows = rowsFrom({
      entries: [entry({ id: "round-a", total_amount: 10.05 }), entry({ id: "round-b", total_amount: 10.05 })]
    }).map((row) => ({ ...row, liveStatus: "closed" as const }));
    expect(buildKenPayoffSummary({ rows, payments: [] }).kenAccruedCompleted).toBe(2.02);
  });

  it("accrues Ken's 10% on Jessica's paid-in-full jobs too", () => {
    const rows = rowsFrom({
      entries: [entry({ id: "e1", total_amount: 10000, sales_owner: "jessica", sold_date: ADVERTISING_RESERVE_EFFECTIVE_FROM })],
      payments: [payment({ id: "p1", bookkeeping_entry_id: "e1", amount: 10000 })]
    });
    const summary = buildKenPayoffSummary({ rows, payments: [] });
    expect(summary.kenAccruedCompleted).toBe(1000);
    expect(summary.completedJobs).toBe(1);
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

  it("uses the fixed buyout target and subtracts Ken's corrected payment", () => {
    const summary = buildKenPayoffSummary({
      rows: [],
      payments: [kenPayment({ amount: 3778 })],
      payoffTarget: 450000
    });
    expect(summary.payoffTarget).toBe(500000);
    expect(summary.kenPaid).toBe(3778);
    expect(summary.payoffRemaining).toBe(496222);
    expect(summary.payoffPct).toBe(0.8);
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

  it("lets standalone bookkeeping rows override the displayed deposit due", () => {
    const [row] = rowsFrom({
      entries: [entry({ id: "e1", total_amount: 4000, meta: { deposit_required: 1200 } })],
    });

    expect(row.depositDue).toBe(1200);
    expect(row.depositPaid).toBe(0);
    expect(row.balance).toBe(4000);
  });
});
