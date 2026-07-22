import { describe, expect, it } from "vitest";
import {
  build805SoldQuoteSmsMessage,
  build805SoldQuoteSmsMessageForRecipient,
  SOLD_QUOTE_CONTACT_NOTIFICATION_RECIPIENT,
} from "./quoteSoldNotification";

const quote = {
  customer_name: "Jane Smith",
  customer_phone: "805-555-1212",
  customer_address: "123 Main St, Ventura, CA",
  total_amount: 4250,
  deposit_paid: 2125,
  share_token: "quote-token",
};

describe("805 sold quote SMS notification", () => {
  it("keeps the base sale fields by default", () => {
    expect(build805SoldQuoteSmsMessage(quote, null)).toBe(
      [
        "Customer Name: Jane Smith",
        "Total Sale Amount: $4,250.00",
        "Deposit Amount: $2,125.00",
        "Technical Measure: Not Needed",
      ].join("\n")
    );
  });

  it("can flag technical measure needed", () => {
    expect(build805SoldQuoteSmsMessage({ ...quote, technical_measure: "needed" }, null)).toContain(
      "Technical Measure: Needed"
    );
  });

  it("adds customer phone and address for the primary recipient", () => {
    expect(build805SoldQuoteSmsMessageForRecipient(SOLD_QUOTE_CONTACT_NOTIFICATION_RECIPIENT, { ...quote, technical_measure: "needed" }, null)).toBe(
      [
        "Customer Name: Jane Smith",
        "Total Sale Amount: $4,250.00",
        "Deposit Amount: $2,125.00",
        "Technical Measure: Needed",
        "Customer Phone: 805-555-1212",
        "Customer Address: 123 Main St, Ventura, CA",
      ].join("\n")
    );
  });

  it("replaces the contract with the measure form for the primary recipient", () => {
    const message = build805SoldQuoteSmsMessageForRecipient(
      SOLD_QUOTE_CONTACT_NOTIFICATION_RECIPIENT,
      { ...quote, technical_measure: "needed" },
      "https://805shutters.com/quote/quote-token",
      "https://805shutters.com/crm/technical-measures/form-id",
    );
    expect(message).toContain("Measure Form: https://805shutters.com/crm/technical-measures/form-id");
    expect(message).not.toContain("Contract PDF:");
  });

  it("removes the contract from the primary recipient when no measure is needed", () => {
    const message = build805SoldQuoteSmsMessageForRecipient(
      SOLD_QUOTE_CONTACT_NOTIFICATION_RECIPIENT,
      { ...quote, technical_measure: "not_needed" },
      "https://805shutters.com/quote/quote-token",
    );
    expect(message).not.toContain("Contract PDF:");
    expect(message).not.toContain("Measure Form:");
  });

  it("keeps the contract for other recipients and omits the measure form", () => {
    const message = build805SoldQuoteSmsMessageForRecipient(
      "805-630-0848",
      { ...quote, technical_measure: "needed" },
      "https://805shutters.com/quote/quote-token",
      "https://805shutters.com/crm/technical-measures/form-id",
    );
    expect(message).toContain("Contract PDF: https://805shutters.com/quote/quote-token");
    expect(message).not.toContain("Measure Form:");
  });

  it("keeps other recipients on the base sale fields only", () => {
    expect(build805SoldQuoteSmsMessageForRecipient("805-630-0848", quote, null)).toBe(
      build805SoldQuoteSmsMessage(quote, null)
    );
  });
});
