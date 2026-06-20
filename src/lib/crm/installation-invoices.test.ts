import { describe, expect, it } from "vitest";
import {
  InstallationInvoiceCandidate,
  extractInstallationInvoiceDetails,
  matchInstallationInvoiceToCandidate,
  normalizeCustomerName
} from "@/lib/crm/installation-invoices";

function candidate(overrides: Partial<InstallationInvoiceCandidate> = {}): InstallationInvoiceCandidate {
  return {
    source: "entry",
    customerName: "Victoria Norman",
    jobId: "job-1",
    quoteId: "quote-1",
    entryId: "entry-1",
    totalAmount: 5000,
    cogsAmount: 2000,
    salesOwner: "jessica",
    soldDate: "2026-06-19",
    existingInstallationAmount: 0,
    existingInstallationMatchStatus: "unmatched",
    ...overrides
  };
}

describe("installation invoice extraction", () => {
  it("extracts the labeled final invoice amount and invoice number", () => {
    const extracted = extractInstallationInvoiceDetails({
      subject: "Invoice #MTS-1048 for Victoria Norman",
      body: "Customer: Victoria Norman\nFinal invoice amount: $1,250.00\nThank you"
    });

    expect(extracted.customerName).toBe("Victoria Norman");
    expect(extracted.invoiceAmount).toBe(1250);
    expect(extracted.invoiceNumber).toBe("MTS-1048");
    expect(extracted.amountConfidence).toBeGreaterThan(0.9);
  });

  it("uses a single standalone currency amount with lower confidence", () => {
    const extracted = extractInstallationInvoiceDetails({
      subject: "Install invoice for Victoria Norman",
      body: "Please reconcile $875.50 for this install."
    });

    expect(extracted.invoiceAmount).toBe(875.5);
    expect(extracted.amountConfidence).toBe(0.75);
  });

  it("extracts the customer name from QuickBooks invoice PDF text", () => {
    const extracted = extractInstallationInvoiceDetails({
      subject: "Invoice 955472023 from MTS Installations Inc",
      body: "$1,588.27",
      attachmentText:
        "Customer Name: Brian Knoll (Knoll psychiatry)\nTechnician: Danny Ruiz\nService Type: Installation"
    });

    expect(extracted.customerName).toBe("Brian Knoll (Knoll psychiatry)");
    expect(extracted.invoiceAmount).toBe(1588.27);
  });
});

describe("installation invoice customer matching", () => {
  it("normalizes punctuation and spacing for full-name matching", () => {
    expect(normalizeCustomerName("  Victoria   O'Norman-Smith ")).toBe("victoria o norman smith");
  });

  it("matches an invoice to one clear bookkeeping row by full customer name", () => {
    const match = matchInstallationInvoiceToCandidate({
      text: "Invoice #9\nCustomer: Victoria Norman\nTotal due: $100.00",
      candidates: [candidate(), candidate({ customerName: "Victor Norton", entryId: "entry-2" })]
    });

    expect(match.status).toBe("matched");
    expect(match.candidate?.entryId).toBe("entry-1");
    expect(match.confidence).toBeGreaterThan(0.9);
  });

  it("matches a CRM customer from the customer name printed in the invoice PDF", () => {
    const extracted = extractInstallationInvoiceDetails({
      subject: "Invoice 955472023 from MTS Installations Inc",
      body: "$1,588.27",
      attachmentText:
        "Customer Name: Brian Knoll (Knoll psychiatry)\nTechnician: Danny Ruiz\nService Type: Installation"
    });
    const match = matchInstallationInvoiceToCandidate({
      text: extracted.text,
      extractedCustomerName: extracted.customerName,
      candidates: [
        candidate({ customerName: "Brian Knoll", entryId: "entry-brian", quoteId: "quote-brian" }),
        candidate({ customerName: "Brian Knox", entryId: "entry-knox", quoteId: "quote-knox" })
      ]
    });

    expect(match.status).toBe("matched");
    expect(match.candidate?.entryId).toBe("entry-brian");
  });

  it("requires review when two customer rows are too close to call", () => {
    const match = matchInstallationInvoiceToCandidate({
      text: "Install invoice for Victoria Norman\nAmount due: $100.00",
      candidates: [
        candidate({ entryId: "entry-1" }),
        candidate({ entryId: "entry-2", quoteId: "quote-2" })
      ]
    });

    expect(match.status).toBe("needs_review");
    expect(match.reason).toContain("Ambiguous");
  });
});
