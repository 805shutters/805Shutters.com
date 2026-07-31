import { describe, expect, it } from "vitest";
import { matchSquareApiPayment } from "@/lib/crm/square-api-reconciliation";
import type { SquareCustomerFacts, SquarePaymentFacts } from "@/lib/finance/square";

const payment: SquarePaymentFacts = {
  squarePaymentId: "square-pay-gloria-balance",
  amountCents: 30150,
  currency: "USD",
  status: "COMPLETED",
  quoteId: null,
  jobId: null,
  paymentType: null,
  orderId: "square-order-gloria-balance",
  customerId: "square-customer-gloria",
  referenceId: null,
  note: null,
  paidAt: "2026-07-30T20:00:00.000Z",
  eventId: "square-event-gloria",
  receiptUrl: null,
  refundedAmountCents: 0,
};

const customer: SquareCustomerFacts = {
  customerId: "square-customer-gloria",
  name: "Gloria White",
  email: "glo_jean_w@hotmail.com",
  phone: "(805) 415-1940",
  address: "2963 Las Posas Rd Camarillo",
};

const quote = {
  id: "quote-gloria",
  job_id: "job-gloria",
  quote_number: "805-0079",
  status: "ordered",
  quote_total: 601,
  deposit_required: 300.5,
  customer_name: "Gloria White",
  customer_email: "glo_jean_w@hotmail.com",
  customer_phone: "8054151940",
  customer_address: "2963 Las Posas Rd Camarillo",
};

const job = {
  id: "job-gloria",
  customer_name: "Gloria White",
  email: "glo_jean_w@hotmail.com",
  phone: "8054151940",
  address: "2963 Las Posas Rd Camarillo",
};

describe("Square API to CRM exact matching", () => {
  it("classifies a unique exact customer payment for the remaining amount as balance", () => {
    expect(matchSquareApiPayment({
      payment,
      customer,
      quotes: [quote],
      jobs: [job],
      payments: [{ quote_id: quote.id, payment_label: "Deposit", amount: 300.5 }],
      credits: [],
    })).toMatchObject({
      candidate: {
        quoteId: quote.id,
        jobId: job.id,
        paymentType: "balance",
        evidence: ["exact_name", "exact_email", "exact_phone", "exact_address"],
      },
    });
  });

  it("does not fuzzy-match a similar customer name", () => {
    expect(matchSquareApiPayment({
      payment,
      customer: { ...customer, name: "Gloria White-Smith", email: null, phone: null, address: null },
      quotes: [quote],
      jobs: [job],
      payments: [{ quote_id: quote.id, payment_label: "Deposit", amount: 300.5 }],
      credits: [],
    }).candidate).toBeNull();
  });

  it("refuses an ambiguous exact identity and amount match", () => {
    const secondQuote = { ...quote, id: "quote-gloria-2", job_id: "job-gloria-2" };
    const secondJob = { ...job, id: "job-gloria-2" };
    expect(matchSquareApiPayment({
      payment,
      customer,
      quotes: [quote, secondQuote],
      jobs: [job, secondJob],
      payments: [
        { quote_id: quote.id, payment_label: "Deposit", amount: 300.5 },
        { quote_id: secondQuote.id, payment_label: "Deposit", amount: 300.5 },
      ],
      credits: [],
    })).toMatchObject({ candidate: null, reason: "2 CRM quotes exactly matched the Square customer and remaining amount." });
  });
});
