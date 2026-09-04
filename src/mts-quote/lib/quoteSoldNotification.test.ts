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
        "Technical Measure: Needed",
      ].join("\n")
    );
  });

  it("can flag technical measure needed", () => {
    expect(build805SoldQuoteSmsMessage({ ...quote, technical_measure: "needed" }, null)).toContain(
      "Technical Measure: Needed"
    );
  });

  it("defaults a null decision to needed", () => {
    expect(build805SoldQuoteSmsMessage({ ...quote, technical_measure: null }, null))
      .toContain("Technical Measure: Needed");
  });

  it("honors an explicit technical measure waiver", () => {
    expect(build805SoldQuoteSmsMessage({ ...quote, technical_measure: "not_needed" }, null))
      .toContain("Technical Measure: Not Needed");
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

  it("keeps other recipients on the base sale fields only", () => {
    expect(build805SoldQuoteSmsMessageForRecipient("805-555-0400", quote, null)).toBe(
      build805SoldQuoteSmsMessage(quote, null)
    );
  });

  it("uses the resolver's primary role when Michael's configured number changes", () => {
    expect(
      build805SoldQuoteSmsMessageForRecipient(
        "805-555-0200",
        quote,
        null,
        null,
        true,
      ),
    ).toContain("Customer Phone: 805-555-1212");
  });
});
