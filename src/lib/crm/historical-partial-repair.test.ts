import { describe, expect, it } from "vitest";
import {
  parseHistoricalPartialRepairInput,
  validateHistoricalPartialRepairEvidence,
  type HistoricalPartialRepairEvidence,
} from "./historical-partial-repair";
import type { PublicQuote } from "./public-quote";

const sourceQuote = {
  id: "quote-id",
  quoteNumber: "805-0172",
  token: "token",
  status: "sold",
  customerName: "Customer",
  customerEmail: null,
  customerPhone: null,
  customerAddress: null,
  business: { name: "805 Shutters", phone: "", email: "", website: "" },
  lines: [
    {
      id: "future-line",
      lineItemId: "future-line",
      room: "Sunroom",
      productName: "Roller Shades",
      styleName: "",
      options: [],
      designOptions: [],
      showDesignOptions: false,
      unitPrice: 2617.2,
      quantity: 1,
      lineTotal: 2617.2,
      discountPercent: 0,
      priceReady: true,
    },
    {
      id: "selected-line",
      lineItemId: "selected-line",
      room: "Primary Bedroom",
      productName: "Honeycomb Shades",
      styleName: "",
      options: [],
      designOptions: [],
      showDesignOptions: false,
      unitPrice: 685.8,
      quantity: 1,
      lineTotal: 685.8,
      discountPercent: 0,
      priceReady: true,
    },
  ],
  adjustments: {
    fees: [],
    discountPercent: 0,
    discountFlat: 0,
    taxPercent: 0,
    depositPercent: 50,
    totalOverride: null,
    balanceDueOverride: null,
    balanceAdjustmentNote: null,
  },
  subtotal: 3303,
  fees: [],
  discount: 0,
  tax: 0,
  sourceTotalAdjustment: 0,
  depositDue: 1651.5,
  balanceDue: 1651.5,
  payment: {
    available: true,
    dueType: "deposit",
    amountDue: 1308.6,
    outstanding: 2960.1,
    depositPaid: 342.9,
    paidTotal: 342.9,
  },
  total: 3303,
  allPriced: true,
  versions: [],
  signed: true,
  signedAt: "2026-08-06T12:00:00.000Z",
  hasOnyxShutters: false,
} satisfies PublicQuote;

const input = parseHistoricalPartialRepairInput({
  mode: "dryRun",
  confirmation: "review",
  expectedQuoteNumber: "805-0172",
  expectedSignedAt: "2026-08-06T12:00:00.000Z",
  expectedSourceTotal: 3303,
  expectedSelectedTotal: 685.8,
  expectedDepositPaid: 342.9,
  selectedLineIds: ["selected-line"],
});

const evidence: HistoricalPartialRepairEvidence = {
  quote: {
    id: "quote-id",
    updated_at: "2026-08-06T12:01:00.000Z",
    external_id: "quote:00000000-0000-4000-8000-000000000001",
    quote_number: "805-0172",
    quote_total: 3303,
    signed_at: "2026-08-06T12:00:00.000Z",
    share_token: "token",
    customer_printed_name: "Customer",
    meta: {},
  },
  job: { id: "job-id", deposit_paid: 342.9 },
  contract: {
    id: "contract-id",
    updated_at: "2026-08-06T12:01:00.000Z",
    total_amount: 3303,
    signed_at: "2026-08-06T12:00:00.000Z",
    meta: {},
  },
  publicQuote: sourceQuote,
};

describe("historical partial acceptance repair guards", () => {
  it("requires the explicit confirmation literal before apply", () => {
    expect(() => parseHistoricalPartialRepairInput({ ...input, mode: "apply" }))
      .toThrow(/confirmation REPAIR_SIGNED_PARTIAL_ACCEPTANCE/);
  });

  it("builds an exact selected/future plan when all evidence agrees", () => {
    const plan = validateHistoricalPartialRepairEvidence(evidence, input);
    expect(plan.current.total).toBe(685.8);
    expect(plan.future.total).toBe(2617.2);
    expect(plan.selectedLineIds).toEqual(["selected-line"]);
  });

  it.each([
    ["source quote", { quote: { ...evidence.quote, quote_total: 3302 } }, /source quote total changed/],
    ["deposit", { job: { ...evidence.job, deposit_paid: 0 } }, /recorded deposit changed/],
    ["contract", { contract: { ...evidence.contract, total_amount: 685.8 } }, /contract source total changed/],
    ["selection", { publicQuote: { ...sourceQuote, lines: [sourceQuote.lines[0]] } }, /changed|select/i],
  ])("fails closed when %s evidence differs", (_label, patch, message) => {
    expect(() =>
      validateHistoricalPartialRepairEvidence(
        { ...evidence, ...patch } as HistoricalPartialRepairEvidence,
        input,
      )
    ).toThrow(message);
  });
});
