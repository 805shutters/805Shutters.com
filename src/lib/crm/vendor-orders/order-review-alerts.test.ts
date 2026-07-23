import { describe, expect, it, vi } from "vitest";
import { buildNormanOrderReviewTelegram, sendNormanOrderReviewTelegram } from "./order-review-alerts";

const alert = {
  formId: "form 123",
  taskId: "norman:form-123:abc",
  customerName: "CODEX TEST CUSTOMER",
  quoteNumber: "805-0141",
  poNumber: "805-0141",
  lineCount: 2,
  portalDraftId: "RR-456",
};

describe("Norman order review Telegram alert", () => {
  it("includes the review facts and states that the order was not placed", () => {
    const message = buildNormanOrderReviewTelegram(alert);
    expect(message).toContain("805 ORDER READY TO REVIEW");
    expect(message).toContain("Manufacturer: Norman");
    expect(message).toContain("PO: 805-0141");
    expect(message).toContain("Customer: CODEX TEST CUSTOMER");
    expect(message).toContain("Items entered: 2");
    expect(message).toContain("Norman draft: RR-456");
    expect(message).toContain("/crm/technical-measures/form%20123");
    expect(message).toContain("THE ORDER HAS NOT BEEN PLACED");
  });

  it("sends exactly one Telegram message", async () => {
    const sender = vi.fn().mockResolvedValue({ sent: true, messageId: 789 });
    const sent = await sendNormanOrderReviewTelegram(alert, sender);
    expect(sender).toHaveBeenCalledTimes(1);
    expect(sender).toHaveBeenCalledWith({ text: sent.text });
    expect(sent.result).toEqual({ sent: true, messageId: 789 });
  });
});
