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
      ].join("\n")
    );
  });

  it("adds customer phone and address for the primary recipient", () => {
    expect(build805SoldQuoteSmsMessageForRecipient(SOLD_QUOTE_CONTACT_NOTIFICATION_RECIPIENT, quote, null)).toBe(
      [
        "Customer Name: Jane Smith",
        "Total Sale Amount: $4,250.00",
        "Deposit Amount: $2,125.00",
        "Customer Phone: 805-555-1212",
        "Customer Address: 123 Main St, Ventura, CA",
      ].join("\n")
    );
  });

  it("keeps other recipients on the base sale fields only", () => {
    expect(build805SoldQuoteSmsMessageForRecipient("805-630-0848", quote, null)).toBe(
      build805SoldQuoteSmsMessage(quote, null)
    );
  });
});
