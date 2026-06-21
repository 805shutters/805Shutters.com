import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_INSTALLATION_INVOICE_MAILBOX,
  InstallationInvoiceCandidate,
  buildInstallationInvoiceGmailQuery,
  buildInstallationInvoiceWorkflowPatches,
  extractInstallationInvoiceDetails,
  hasInstallationInvoiceGmailAuth,
  matchInstallationInvoiceToCandidate,
  normalizeInstallationInvoiceMailbox,
  resolveInstallationInvoiceGmailQuery,
  normalizeCustomerName
} from "@/lib/crm/installation-invoices";

const gmailAuthEnvKeys = [
  "GMAIL_805_CLIENT_ID",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CALENDAR_CLIENT_ID",
  "GMAIL_805_CLIENT_SECRET",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_CALENDAR_CLIENT_SECRET",
  "GMAIL_805_REFRESH_TOKEN",
  "GMAIL_REFRESH_TOKEN",
  "GOOGLE_CALENDAR_REFRESH_TOKEN",
  "GMAIL_ACCESS_TOKEN_BROKER_URL",
  "INSTALLATION_INVOICE_GMAIL_ACCESS_TOKEN_BROKER_URL",
  "GMAIL_ACCESS_TOKEN_BROKER_SECRET",
  "INSTALLATION_INVOICE_GMAIL_ACCESS_TOKEN_BROKER_SECRET"
];

function clearGmailAuthEnv() {
  for (const key of gmailAuthEnvKeys) vi.stubEnv(key, "");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

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

describe("installation invoice mailbox", () => {
  it("defaults the MTS invoice puller to the 805 Shutters Gmail inbox", () => {
    const query = buildInstallationInvoiceGmailQuery(DEFAULT_INSTALLATION_INVOICE_MAILBOX);

    expect(DEFAULT_INSTALLATION_INVOICE_MAILBOX).toBe("805shutters@gmail.com");
    expect(query).toContain("to:805shutters@gmail.com");
    expect(query).toContain('"MTS Installations"');
  });

  it("treats the old installation invoice inbox as stale config", () => {
    const mailbox = normalizeInstallationInvoiceMailbox("805@805shutters.com");
    const query = resolveInstallationInvoiceGmailQuery(
      mailbox,
      'to:805@805shutters.com newer_than:30d (invoice OR "amount due")'
    );

    expect(mailbox).toBe("805shutters@gmail.com");
    expect(query).toContain("to:805shutters@gmail.com");
    expect(query).not.toContain("to:805@805shutters.com");
  });
});

describe("installation invoice Gmail auth config", () => {
  it("accepts direct Gmail OAuth credentials", () => {
    clearGmailAuthEnv();
    vi.stubEnv("GMAIL_805_CLIENT_ID", "client");
    vi.stubEnv("GMAIL_805_CLIENT_SECRET", "secret");
    vi.stubEnv("GMAIL_805_REFRESH_TOKEN", "refresh");

    expect(hasInstallationInvoiceGmailAuth()).toBe(true);
  });

  it("accepts a protected access-token broker", () => {
    clearGmailAuthEnv();
    vi.stubEnv("GMAIL_ACCESS_TOKEN_BROKER_URL", "https://example.test/gmail-token");
    vi.stubEnv("GMAIL_ACCESS_TOKEN_BROKER_SECRET", "broker-secret");

    expect(hasInstallationInvoiceGmailAuth()).toBe(true);
  });

  it("rejects incomplete auth config", () => {
    clearGmailAuthEnv();
    vi.stubEnv("GMAIL_805_CLIENT_ID", "client");
    vi.stubEnv("GMAIL_ACCESS_TOKEN_BROKER_URL", "https://example.test/gmail-token");

    expect(hasInstallationInvoiceGmailAuth()).toBe(false);
  });
});

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

describe("installation invoice workflow updates", () => {
  it("moves matched quote jobs to payment collection and stamps installation completion", () => {
    const patches = buildInstallationInvoiceWorkflowPatches({
      currentQuote: { status: "received", installed_at: null, meta: { existing: true } },
      currentJob: { status: "ordered", meta: { owner: "Jessica" } },
      messageId: "gmail-1",
      threadId: "thread-1",
      actorEmail: "installation-invoice-cron",
      now: "2026-06-20T12:00:00.000Z"
    });

    expect(patches.quotePatch).toMatchObject({
      status: "invoiced",
      installed_at: "2026-06-20T12:00:00.000Z",
      meta: {
        existing: true,
        installationInvoiceMessageId: "gmail-1",
        installationInvoicePreviousQuoteStatus: "received"
      }
    });
    expect(patches.jobPatch).toMatchObject({
      status: "invoiced",
      next_action: "Collect payment",
      meta: {
        owner: "Jessica",
        installationInvoiceWorkflowAppliedBy: "installation-invoice-cron",
        installationInvoicePreviousJobStatus: "ordered"
      }
    });
  });

  it("does not reopen terminal jobs or downgrade paid quotes", () => {
    const patches = buildInstallationInvoiceWorkflowPatches({
      currentQuote: { status: "paid", installed_at: "2026-06-19T12:00:00.000Z", meta: null },
      currentJob: { status: "closed", meta: null },
      messageId: "gmail-2",
      now: "2026-06-20T12:00:00.000Z"
    });

    expect(patches.quotePatch).toMatchObject({
      status: "paid",
      installed_at: "2026-06-19T12:00:00.000Z"
    });
    expect(patches.jobPatch).not.toMatchObject({
      status: "invoiced",
      next_action: "Collect payment"
    });
    expect(patches.jobPatch).toMatchObject({
      meta: {
        installationInvoicePreviousJobStatus: "closed"
      }
    });
  });
});
