import { beforeEach, describe, expect, it } from "vitest";
import {
  buildPartnerPaymentReceiptCsv,
  buildPartnerPaymentReceiptEmail,
  buildPartnerPaymentReceiptPdf,
  sendPartnerPaymentReceiptEmail
} from "@/lib/crm/partner-payment-receipts";

const receipt = {
  paymentId: "11111111-2222-3333-4444-555555555555",
  person: "ken" as const,
  paidOn: "2026-07-05",
  amount: 441.62,
  note: "Zelle",
  createdByEmail: "805shutters@gmail.com",
  allocations: [
    {
      customerName: "Melisa Asimus",
      quoteNumber: "805-0013",
      closedAt: "2026-05-13",
      amount: 306.12,
      total: 3061.19,
      jobId: "job-1"
    },
    {
      customerName: "Kahn, Andrew",
      quoteNumber: "805-0023",
      closedAt: "2026-05-29",
      amount: 135.5,
      total: 1408,
      jobId: "job-2"
    }
  ]
};

describe("partner payment receipts", () => {
  beforeEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM;
    delete process.env.BOOKING_EMAIL_FROM;
  });

  it("builds an email with the grouped total and job allocations", () => {
    const email = buildPartnerPaymentReceiptEmail(receipt);

    expect(email.subject).toContain("Ken");
    expect(email.subject).toContain("$441.62");
    expect(email.text).toContain("Melisa Asimus");
    expect(email.text).toContain("$306.12");
    expect(email.html).toContain("805-0023");
  });

  it("builds a PDF receipt containing the payment header and job names", () => {
    const pdf = buildPartnerPaymentReceiptPdf(receipt);
    const raw = pdf.toString("latin1");

    expect(raw.startsWith("%PDF-1.4")).toBe(true);
    expect(raw).toContain("Partner Payment Receipt");
    expect(raw).toContain("Melisa Asimus");
    expect(raw).toContain("Kahn, Andrew");
  });

  it("builds a spreadsheet breakdown with every paid job and the total", () => {
    const csv = buildPartnerPaymentReceiptCsv({ ...receipt, advanceApplied: 100 }).toString("utf8");

    expect(csv).toContain('"Customer","Quote","Closed","Job Total","Amount Paid","Job ID","Item Key"');
    expect(csv).toContain('"Melisa Asimus","805-0013"');
    expect(csv).toContain('"Kahn, Andrew","805-0023"');
    expect(csv).toContain('"ADVANCE OFFSET","","","","-100.00"');
    expect(csv).toContain('"TOTAL","","","","441.62"');
  });

  it("uses Ken's recipient and skips sending without an explicitly configured 805 sender", async () => {
    const result = await sendPartnerPaymentReceiptEmail(receipt);

    expect(result.sent).toBe(false);
    expect(result.skipped).toBe("Ken payment receipt email is not explicitly enabled and verified");
    expect(result.to).toBe("khill31@msn.com");
    expect(result.filename).toMatch(/805-shutters-ken-payment-2026-07-05/);
  });
});
