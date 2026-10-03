import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { CustomerContractDocument } from "../../src/app/quote/[token]/CustomerContractDocument";
import {
  PaymentScheduleSelector,
  InHousePayments,
} from "../../src/components/crm/InHousePayments";
import {
  IN_HOUSE_SCHEDULE,
  type PaymentSchedule,
} from "../../src/lib/crm/payment-schedule";
import { customerContractTerms } from "../../src/lib/crm/customer-contract-terms";
import type { PublicQuote } from "../../src/lib/crm/public-quote";
import "../../src/app/globals.css";
const baseQuote = {
  token: "synthetic-signing",
  id: "fixture",
  quoteNumber: "LOCAL-TEST",
  customerName: "Synthetic Customer",
  customerAddress: "123 Example Lane",
  customerPhone: null,
  customerEmail: null,
  status: "sent",
  signed: false,
  signedAt: null,
  lines: ["Kitchen", "Living room"].map((room, index) => ({
    id: `line-${index + 1}`,
    lineItemId: `line-${index + 1}`,
    room,
    productName: "Roller Shades",
    styleName: "",
    options: ["Lift System: Cordless"],
    designOptions: [],
    showDesignOptions: false,
    quantity: 1,
    unitPrice: 450,
    lineTotal: 450,
    discountPercent: 0,
    priceReady: true,
  })),
  subtotal: 900,
  fees: [],
  discount: 0,
  tax: 0,
  sourceTotalAdjustment: 0,
  total: 900,
  depositDue: 450,
  balanceDue: 450,
  payment: {
    available: true,
    dueType: "deposit",
    amountDue: 450,
    outstanding: 900,
    depositPaid: 0,
    paidTotal: 0,
  },
  allPriced: true,
  hasOnyxShutters: false,
  adjustments: {
    discountFlat: 0,
    discountPercent: 0,
    taxPercent: 0,
    depositPercent: 50,
    fees: [],
    totalOverride: null,
    balanceDueOverride: null,
    balanceAdjustmentNote: "",
  },
  business: {
    name: "805 Shutters",
    phone: "805-806-9344",
    website: "https://www.805shutters.com",
    email: "805@805shutters.com",
  },
  versions: [],
} satisfies PublicQuote;

function Fixture() {
  const [schedule, setSchedule] = useState<PaymentSchedule>(
    (localStorage.getItem("schedule") || "standard") as PaymentSchedule,
  );
  const signed = new URLSearchParams(location.search).has("signed");
  const quote: PublicQuote = {
    ...baseQuote,
    paymentSchedule: IN_HOUSE_SCHEDULE,
    signed,
    signedAt: signed ? "2026-01-31T20:00Z" : null,
    status: signed ? "sold" : "sent",
    adjustments: {
      ...baseQuote.adjustments,
      paymentSchedule: IN_HOUSE_SCHEDULE,
    },
    total: 900.03,
    subtotal: 900.03,
    depositDue: 300.01,
    balanceDue: 600.02,
    lines: baseQuote.lines.map((l, n) => ({
      ...l,
      unitPrice: n ? 450.02 : 450.01,
      lineTotal: n ? 450.02 : 450.01,
    })),
    payment: { ...baseQuote.payment, amountDue: 300.01, outstanding: 900.03 },
    inHousePlan: signed
      ? {
          status: "waiting_deposit",
          target: { quoteId: "fixture" },
          depositOutstandingCents: 30001,
          links: {},
          installments: [30001, 30001, 30001].map((c, n) => ({
            id: `installment-${n + 1}`,
            plan_id: "plan",
            number: n + 1,
            amount_cents: c,
            paid_cents: 0,
            due_date: n === 0 ? "2026-01-31" : null,
          })),
        }
      : null,
  };
  return (
    <>
      <div style={{ maxWidth: 900, margin: "auto", padding: 16 }}>
        <h1>Local synthetic in-house payment checks</h1>
        <PaymentScheduleSelector
          value={schedule}
          total={900.03}
          onSave={async (s) => {
            await fetch("/api/test/payment-schedule", {
              method: "POST",
              body: JSON.stringify({ schedule: s }),
            });
            localStorage.setItem("schedule", s);
            setSchedule(s);
          }}
        />
        <InHousePayments quoteId="fixture" initiallyOpen />
      </div>
      <CustomerContractDocument
        quote={quote}
        paymentOptions={{ zelleDestination: "805-555-0100" }}
        contractTerms={customerContractTerms(false, IN_HOUSE_SCHEDULE)}
      />
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
