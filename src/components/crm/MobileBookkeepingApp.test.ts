import { describe, expect, it } from "vitest";
import type { CrmBookkeepingRow, CrmCustomerFile } from "@/lib/crm/types";
import {
  buildMobileBookkeepingPatch,
  draftForRecord,
  matchesMobileBookkeepingFile,
  mobileBookkeepingRemaining,
  type MobileBookkeepingDraft
} from "./MobileBookkeepingApp";

const draft: MobileBookkeepingDraft = {
  total: "10000",
  cogs: "3200",
  depositDue: "5000",
  depositPaid: "4500",
  balancePaid: "1000",
  paymentType: "check",
  manufacturerName: "Norman",
  manufacturerOrderRef: "WO-805",
  notes: "Deposit includes check 1042"
};

describe("mobile bookkeeping customer search", () => {
  it("matches customer identity and quote details", () => {
    const file = {
      customerName: "Gloria White",
      phone: "805-555-0100",
      email: "gloria@example.com",
      address: "10 Main Street",
      city: "Camarillo",
      jobs: [],
      bookkeepingRows: [{ customerName: "Gloria White", customerPhone: null, quoteNumber: "805-0079" }]
    } as unknown as CrmCustomerFile;

    expect(matchesMobileBookkeepingFile(file, "gloria")).toBe(true);
    expect(matchesMobileBookkeepingFile(file, "805-0079")).toBe(true);
    expect(matchesMobileBookkeepingFile(file, "ventura")).toBe(false);
  });
});

describe("mobile bookkeeping financial edits", () => {
  it("hydrates populated ledger amounts without inventing a deposit requirement", () => {
    const populated = draftForRecord({
      key: "row:ledger-1",
      row: {
        total: 8000,
        cogs: 2700,
        depositDue: 0,
        depositPaid: 3000,
        balancePaid: 1250,
        paymentType: "credit_card",
        manufacturerName: "Onyx",
        manufacturerOrderRef: "ONYX-77",
        notes: "Authoritative ledger values"
      } as CrmBookkeepingRow,
      job: null
    });

    expect(populated).toMatchObject({
      total: "8000",
      cogs: "2700",
      depositDue: "",
      depositPaid: "3000",
      balancePaid: "1250",
      paymentType: "credit_card",
      manufacturerName: "Onyx",
      manufacturerOrderRef: "ONYX-77",
      notes: "Authoritative ledger values"
    });
  });

  it("calculates the remaining customer balance from payment targets", () => {
    expect(mobileBookkeepingRemaining(draft)).toBe(4500);
  });

  it("maps quote rows to the quote and ledger target fields", () => {
    const patch = buildMobileBookkeepingPatch(
      { source: "crm_quote" } as CrmBookkeepingRow,
      draft
    );

    expect(patch).toMatchObject({
      quote_total: 10000,
      materials_cost: 3200,
      deposit_required: 5000,
      deposit_paid_target: 4500,
      balance_paid_target: 1000,
      payment_type: "check",
      manufacturer_name: "Norman",
      manufacturer_order_ref: "WO-805",
      bookkeeping_notes: "Deposit includes check 1042"
    });
  });

  it("maps manual rows to bookkeeping entry fields", () => {
    const patch = buildMobileBookkeepingPatch(
      { source: "manual" } as CrmBookkeepingRow,
      draft
    );

    expect(patch).toMatchObject({
      total_amount: 10000,
      cogs_amount: 3200,
      deposit_paid_target: 4500,
      balance_paid_target: 1000,
      notes: "Deposit includes check 1042"
    });
  });
});
