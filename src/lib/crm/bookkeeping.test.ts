import { describe, expect, it } from "vitest";
import {
  KEN_CUT_JESSICA_EXEMPTION_DATE,
  buildAccountabilityQueue,
  buildBookkeepingRows,
  calculateJobProfit,
  resolveKenCut,
  sumBookkeepingRows
} from "@/lib/crm/bookkeeping";
import {
  CrmBookkeepingEntry,
  CrmBookkeepingPayment,
  CrmJobExpense,
  CrmQuote
} from "@/lib/crm/types";

function makeEntry(overrides: Partial<CrmBookkeepingEntry> = {}): CrmBookkeepingEntry {
  return {
    id: "entry-1",
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    quote_id: null,
    job_id: null,
    source: "manual",
    customer_name: "Test Customer",
    sold_date: "2026-07-01",
    total_amount: 10000,
    payment_type: "check",
    cogs_amount: 4000,
    ken_cut_override: null,
    sales_owner: "mike",
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
    manufacturer_order_ref: "PO-100",
    manufacturer_order_url: null,
    manufacturer_document_url: null,
    notes: null,
    imported_sheet_row: null,
    ...overrides
  };
}

function makeQuote(overrides: Partial<CrmQuote> = {}): CrmQuote {
  return {
    id: "quote-1",
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    job_id: "job-1",
    quote_number: "805-1001",
    status: "sold",
    quote_total: 10000,
    materials_cost: 4000,
    labor_cost: 0,
    discount: 0,
    tax: 0,
    deposit_required: 5000,
    balance_due: 5000,
    sold_by: "Mike",
    sent_at: null,
    approved_at: null,
    sold_at: "2026-07-01T00:00:00Z",
    ordered_at: null,
    received_at: null,
    installed_at: null,
    archived_at: null,
    manufacturer_name: null,
    manufacturer_order_ref: "PO-200",
    manufacturer_order_url: null,
    manufacturer_document_url: null,
    notes: null,
    customer_name: "Quote Customer",
    ...overrides
  };
}

function makePayment(overrides: Partial<CrmBookkeepingPayment> = {}): CrmBookkeepingPayment {
  return {
    id: "payment-1",
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    quote_id: null,
    job_id: null,
    bookkeeping_entry_id: null,
    payment_label: "Balance payment",
    payment_type: "check",
    amount: 0,
    paid_at: "2026-07-01",
    notes: null,
    source: "manual",
    ...overrides
  };
}

function makeExpense(overrides: Partial<CrmJobExpense> = {}): CrmJobExpense {
  return {
    id: "expense-1",
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    bookkeeping_entry_id: null,
    quote_id: null,
    job_id: null,
    label: "Card fee",
    category: "processing_fee",
    amount: 0,
    incurred_on: "2026-07-01",
    notes: null,
    source: "manual",
    ...overrides
  };
}

const BEFORE_POLICY = "2026-05-01";
const AFTER_POLICY = "2026-07-01";

describe("resolveKenCut", () => {
  it("keeps the historical 10% on jobs sold before the exemption date, even Jessica's", () => {
    expect(
      resolveKenCut({ total: 10000, salesOwner: "jessica", soldDate: BEFORE_POLICY, kenCutOverride: null })
    ).toBe(1000);
    expect(
      resolveKenCut({ total: 10000, salesOwner: "mike", soldDate: BEFORE_POLICY, kenCutOverride: null })
    ).toBe(1000);
  });

  it("exempts Jessica-assigned jobs sold on/after the exemption date", () => {
    expect(
      resolveKenCut({
        total: 10000,
        salesOwner: "jessica",
        soldDate: KEN_CUT_JESSICA_EXEMPTION_DATE,
        kenCutOverride: null
      })
    ).toBe(0);
    expect(
      resolveKenCut({ total: 10000, salesOwner: "jessica", soldDate: AFTER_POLICY, kenCutOverride: null })
    ).toBe(0);
  });

  it("still takes 10% on new jobs assigned to Mike or unassigned", () => {
    expect(
      resolveKenCut({ total: 10000, salesOwner: "mike", soldDate: AFTER_POLICY, kenCutOverride: null })
    ).toBe(1000);
    expect(
      resolveKenCut({ total: 10000, salesOwner: null, soldDate: AFTER_POLICY, kenCutOverride: null })
    ).toBe(1000);
  });

  it("treats undated rows as new sales", () => {
    expect(resolveKenCut({ total: 10000, salesOwner: "jessica", soldDate: null, kenCutOverride: null })).toBe(0);
    expect(resolveKenCut({ total: 10000, salesOwner: "mike", soldDate: null, kenCutOverride: null })).toBe(1000);
  });

  it("honors an explicit override, including zero", () => {
    expect(
      resolveKenCut({ total: 10000, salesOwner: "mike", soldDate: AFTER_POLICY, kenCutOverride: 0 })
    ).toBe(0);
    expect(
      resolveKenCut({ total: 10000, salesOwner: "jessica", soldDate: AFTER_POLICY, kenCutOverride: 250 })
    ).toBe(250);
  });
});

describe("calculateJobProfit", () => {
  it("computes net profit after all expenses and splits it 50/50", () => {
    const result = calculateJobProfit({
      total: 10000,
      cogs: 4000,
      kenCut: 1000,
      installationAmount: 500,
      expensesTotal: 300,
      installationMatchStatus: "matched"
    });

    expect(result.netProfit).toBe(4200);
    expect(result.mikeShare).toBe(2100);
    expect(result.jessicaShare).toBe(2100);
    expect(result.isProfitFinal).toBe(true);
  });

  it("splits odd cents without losing a penny", () => {
    const result = calculateJobProfit({
      total: 100.01,
      cogs: 0.0,
      kenCut: 0,
      installationAmount: 0,
      expensesTotal: 0,
      installationMatchStatus: "matched"
    });

    expect(result.netProfit).toBe(100.01);
    const mikeCents = Math.round(result.mikeShare * 100);
    const jessicaCents = Math.round(result.jessicaShare * 100);
    expect(mikeCents + jessicaCents).toBe(Math.round(result.netProfit * 100));
    expect(Math.abs(mikeCents - jessicaCents)).toBe(1);
  });

  it("always deducts the installation amount, even before the invoice is matched", () => {
    const result = calculateJobProfit({
      total: 10000,
      cogs: 4000,
      kenCut: 1000,
      installationAmount: 500,
      expensesTotal: 0,
      installationMatchStatus: "unmatched"
    });

    expect(result.netProfit).toBe(4500);
    expect(result.isProfitFinal).toBe(false);
  });

  it("is only final once installation is settled and COGS is entered", () => {
    const noCogs = calculateJobProfit({
      total: 10000,
      cogs: 0,
      kenCut: 1000,
      installationAmount: 500,
      expensesTotal: 0,
      installationMatchStatus: "matched"
    });
    expect(noCogs.isProfitFinal).toBe(false);

    const noInstallNeeded = calculateJobProfit({
      total: 10000,
      cogs: 4000,
      kenCut: 1000,
      installationAmount: 0,
      expensesTotal: 0,
      installationMatchStatus: "matched"
    });
    expect(noInstallNeeded.isProfitFinal).toBe(true);
  });

  it("splits a loss between both partners", () => {
    const result = calculateJobProfit({
      total: 5000,
      cogs: 4000,
      kenCut: 500,
      installationAmount: 800,
      expensesTotal: 0,
      installationMatchStatus: "matched"
    });

    expect(result.netProfit).toBe(-300);
    expect(result.mikeShare + result.jessicaShare).toBe(-300);
  });
});

describe("buildBookkeepingRows - manual entries", () => {
  it("computes the full split for a Mike job sold under the new policy", () => {
    const entry = makeEntry({
      sold_date: AFTER_POLICY,
      sales_owner: "mike",
      total_amount: 10000,
      cogs_amount: 4000,
      installation_invoice_amount: 500,
      installation_match_status: "matched",
      installation_matched_at: "2026-07-10T00:00:00Z"
    });
    const expense = makeExpense({ bookkeeping_entry_id: entry.id, amount: 200 });

    const [row] = buildBookkeepingRows({ quotes: [], entries: [entry], payments: [], expenses: [expense] });

    expect(row.kenCut).toBe(1000);
    expect(row.expensesTotal).toBe(200);
    // 10000 - 4000 cogs - 1000 ken - 500 install - 200 expenses
    expect(row.netProfit).toBe(4300);
    expect(row.mikeShare).toBe(2150);
    expect(row.jessicaShare).toBe(2150);
    expect(row.isProfitFinal).toBe(true);
    expect(row.jessicaShareOwed).toBe(2150);
  });

  it("waives the Ken cut for a Jessica job sold under the new policy", () => {
    const entry = makeEntry({
      sold_date: AFTER_POLICY,
      sales_owner: "jessica",
      total_amount: 10000,
      cogs_amount: 4000,
      installation_invoice_amount: 500,
      installation_match_status: "matched"
    });

    const [row] = buildBookkeepingRows({ quotes: [], entries: [entry], payments: [] });

    expect(row.kenCut).toBe(0);
    expect(row.netProfit).toBe(5500);
    expect(row.mikeShare).toBe(2750);
    expect(row.jessicaShare).toBe(2750);
  });

  it("keeps legacy rows on the historical 10% Ken cut", () => {
    const entry = makeEntry({
      source: "legacy_sheet",
      sold_date: BEFORE_POLICY,
      sales_owner: "jessica",
      total_amount: 10000,
      cogs_amount: 4000,
      installation_match_status: "matched"
    });

    const [row] = buildBookkeepingRows({ quotes: [], entries: [entry], payments: [] });

    expect(row.kenCut).toBe(1000);
    expect(row.netProfit).toBe(5000);
    expect(row.mikeShare).toBe(2500);
    expect(row.jessicaShare).toBe(2500);
  });

  it("holds Jessica's share as not-owed until profit is final, and zero once paid", () => {
    const unfinished = makeEntry({
      id: "entry-unfinished",
      installation_invoice_amount: 500,
      installation_match_status: "unmatched"
    });
    const paid = makeEntry({
      id: "entry-paid",
      installation_invoice_amount: 500,
      installation_match_status: "matched",
      jessica_commission_paid_at: "2026-07-15T00:00:00Z"
    });

    const rows = buildBookkeepingRows({ quotes: [], entries: [unfinished, paid], payments: [] });
    const unfinishedRow = rows.find((row) => row.id === "entry-unfinished");
    const paidRow = rows.find((row) => row.id === "entry-paid");

    expect(unfinishedRow?.isProfitFinal).toBe(false);
    expect(unfinishedRow?.jessicaShareOwed).toBe(0);
    expect(paidRow?.isProfitFinal).toBe(true);
    expect(paidRow?.jessicaShareOwed).toBe(0);
    expect(paidRow?.jessicaSharePaidAt).toBe("2026-07-15T00:00:00Z");
  });

  it("never owes Jessica on a loss", () => {
    const entry = makeEntry({
      total_amount: 5000,
      cogs_amount: 5200,
      installation_match_status: "matched"
    });

    const [row] = buildBookkeepingRows({ quotes: [], entries: [entry], payments: [] });

    expect(row.netProfit).toBeLessThan(0);
    expect(row.jessicaShareOwed).toBe(0);
  });
});

describe("buildBookkeepingRows - quote rows", () => {
  it("uses recorded payments as the truth and does not assume a phantom deposit", () => {
    const quote = makeQuote({ deposit_required: 5000 });
    const balanceOnly = makePayment({ quote_id: quote.id, payment_label: "Balance payment", amount: 1000 });

    const [row] = buildBookkeepingRows({ quotes: [quote], entries: [], payments: [balanceOnly] });

    expect(row.depositPaid).toBe(0);
    expect(row.balancePaid).toBe(1000);
    expect(row.paidTotal).toBe(1000);
    expect(row.balance).toBe(9000);
  });

  it("assumes the required deposit only when no payments are recorded", () => {
    const quote = makeQuote({ deposit_required: 5000 });

    const [row] = buildBookkeepingRows({ quotes: [quote], entries: [], payments: [] });

    expect(row.depositPaid).toBe(5000);
    expect(row.paidTotal).toBe(5000);
    expect(row.balance).toBe(5000);
  });

  it("merges quote-linked and entry-linked expenses without double counting", () => {
    const quote = makeQuote();
    const metaEntry = makeEntry({
      id: "entry-meta",
      source: "crm_quote",
      quote_id: quote.id,
      sales_owner: "jessica",
      sold_date: AFTER_POLICY,
      cogs_amount: 4000,
      installation_match_status: "matched"
    });
    const sharedExpense = makeExpense({
      id: "expense-shared",
      quote_id: quote.id,
      bookkeeping_entry_id: metaEntry.id,
      amount: 150
    });
    const entryExpense = makeExpense({ id: "expense-entry", bookkeeping_entry_id: metaEntry.id, amount: 100 });

    const [row] = buildBookkeepingRows({
      quotes: [quote],
      entries: [metaEntry],
      payments: [],
      expenses: [sharedExpense, entryExpense]
    });

    expect(row.expensesTotal).toBe(250);
    // Jessica-assigned new job: no Ken cut. 10000 - 4000 - 0 - 0 - 250.
    expect(row.kenCut).toBe(0);
    expect(row.netProfit).toBe(5750);
  });

  it("respects a Ken-cut override stored on the linked entry", () => {
    const quote = makeQuote({ sold_by: "Mike" });
    const metaEntry = makeEntry({
      id: "entry-override",
      source: "crm_quote",
      quote_id: quote.id,
      sales_owner: "mike",
      ken_cut_override: 0,
      cogs_amount: 4000,
      installation_match_status: "matched"
    });

    const [row] = buildBookkeepingRows({ quotes: [quote], entries: [metaEntry], payments: [] });

    expect(row.kenCut).toBe(0);
    expect(row.netProfit).toBe(6000);
  });

  it("excludes draft and lost quotes from the ledger", () => {
    const rows = buildBookkeepingRows({
      quotes: [makeQuote({ id: "q-draft", status: "draft" }), makeQuote({ id: "q-lost", status: "lost" })],
      entries: [],
      payments: []
    });

    expect(rows).toHaveLength(0);
  });
});

describe("buildBookkeepingRows - imported entries linked to quotes", () => {
  it("absorbs quote-linked payments into a standalone entry row", () => {
    const entry = makeEntry({
      id: "entry-import",
      source: "legacy_sheet",
      quote_id: "quote-mts",
      total_amount: 10000
    });
    const quote = makeQuote({ id: "quote-mts", status: "installed" });
    const quotePayment = makePayment({ id: "p-quote", quote_id: "quote-mts", payment_label: "Deposit", amount: 5000 });
    const entryPayment = makePayment({
      id: "p-entry",
      bookkeeping_entry_id: "entry-import",
      payment_label: "Balance payment",
      amount: 2000
    });
    const both = makePayment({
      id: "p-both",
      quote_id: "quote-mts",
      bookkeeping_entry_id: "entry-import",
      payment_label: "Balance payment",
      amount: 1000
    });

    const rows = buildBookkeepingRows({
      quotes: [quote],
      entries: [entry],
      payments: [quotePayment, entryPayment, both]
    });

    // The entry suppresses the quote row and owns all of its money.
    expect(rows).toHaveLength(1);
    expect(rows[0]?.depositPaid).toBe(5000);
    expect(rows[0]?.balancePaid).toBe(3000);
    expect(rows[0]?.paidTotal).toBe(8000);
    expect(rows[0]?.balance).toBe(2000);
  });
});

describe("sumBookkeepingRows", () => {
  it("aggregates the split so Mike + Jessica always equals net profit", () => {
    const entries = [
      makeEntry({ id: "e1", sold_date: AFTER_POLICY, sales_owner: "mike", total_amount: 10000.01, cogs_amount: 4000 }),
      makeEntry({ id: "e2", sold_date: AFTER_POLICY, sales_owner: "jessica", total_amount: 8000, cogs_amount: 3000 }),
      makeEntry({ id: "e3", sold_date: BEFORE_POLICY, sales_owner: null, total_amount: 6000, cogs_amount: 2000 })
    ];

    const rows = buildBookkeepingRows({ quotes: [], entries, payments: [] });
    const totals = sumBookkeepingRows(rows);

    expect(totals.rows).toBe(3);
    expect(totals.total).toBe(24000.01);
    expect(totals.mikeShare + totals.jessicaShare).toBeCloseTo(totals.netProfit, 2);
    expect(totals.missingSalesOwner).toBe(1);
    expect(totals.projectedRows).toBe(3);
    expect(totals.kenCut).toBe(1000 + 0 + 600);
  });

  it("reproduces the legacy MTS dashboard math (screenshot parity)", () => {
    // Mirrors the MTS CRM totals strip: $105,202.33 sales, $53,788.13 COGS,
    // $2,953.27 installation -> Total Profit $48,460.93, Ken $10,520.23,
    // MTS (net) profit $37,940.70, margin 46.1%.
    const entry = makeEntry({
      source: "legacy_sheet",
      sold_date: BEFORE_POLICY,
      total_amount: 105202.33,
      cogs_amount: 53788.13,
      installation_invoice_amount: 2953.27,
      installation_match_status: "matched"
    });

    const totals = sumBookkeepingRows(buildBookkeepingRows({ quotes: [], entries: [entry], payments: [] }));

    expect(totals.total).toBe(105202.33);
    expect(totals.cogs).toBe(53788.13);
    expect(totals.installationAmount).toBe(2953.27);
    expect(totals.grossProfit).toBe(48460.93);
    expect(totals.kenCut).toBe(10520.23);
    expect(totals.netProfit).toBe(37940.7);
    expect(totals.profitMargin).toBe(46.1);
    expect(totals.mikeShare + totals.jessicaShare).toBeCloseTo(37940.7, 2);
  });

  it("counts Jessica's paid and owed shares separately", () => {
    const entries = [
      makeEntry({
        id: "owed",
        sold_date: AFTER_POLICY,
        sales_owner: "mike",
        total_amount: 10000,
        cogs_amount: 4000,
        installation_match_status: "matched"
      }),
      makeEntry({
        id: "paid",
        sold_date: AFTER_POLICY,
        sales_owner: "mike",
        total_amount: 10000,
        cogs_amount: 4000,
        installation_match_status: "matched",
        jessica_commission_paid_at: "2026-07-20T00:00:00Z"
      })
    ];

    const totals = sumBookkeepingRows(buildBookkeepingRows({ quotes: [], entries, payments: [] }));

    // Each job: 10000 - 4000 - 1000 ken = 5000 net, Jessica 2500.
    expect(totals.jessicaShareOwed).toBe(2500);
    expect(totals.jessicaSharePaid).toBe(2500);
  });
});

describe("buildAccountabilityQueue", () => {
  it("flags sold rows without a salesperson, but not legacy imports", () => {
    const rows = buildBookkeepingRows({
      quotes: [],
      entries: [
        makeEntry({ id: "no-owner", sales_owner: null }),
        makeEntry({ id: "legacy", source: "legacy_sheet", sales_owner: null })
      ],
      payments: []
    });

    const queue = buildAccountabilityQueue(rows);
    const assignments = queue.filter((item) => item.type === "assign_sales_owner");

    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.rowId).toBe("no-owner");
  });

  it("raises a commission task only when Jessica's share is actually owed", () => {
    const rows = buildBookkeepingRows({
      quotes: [],
      entries: [
        makeEntry({ id: "final-unpaid", installation_match_status: "matched" }),
        makeEntry({ id: "still-projected", installation_match_status: "unmatched" })
      ],
      payments: []
    });

    const queue = buildAccountabilityQueue(rows);
    const commissionTasks = queue.filter((item) => item.type === "commission_due");

    expect(commissionTasks).toHaveLength(1);
    expect(commissionTasks[0]?.rowId).toBe("final-unpaid");
  });
});
