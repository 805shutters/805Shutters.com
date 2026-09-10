import { describe, expect, it, vi } from "vitest";
import { markSalesQuoteSent } from "./sales-quote-send";

function database() {
  const eq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn((_patch: Record<string, unknown>) => ({ eq }));
  const from = vi.fn(() => ({ update }));
  return { client: { from } as unknown as Parameters<typeof markSalesQuoteSent>[0], from, update, eq };
}
describe("sales quote delivery status", () => {
  it("does not mark an undelivered quote sent when both requested channels fail or skip", async () => {
    const db = database();
    await markSalesQuoteSent(db.client, "quote", { status: "draft" }, { channels: { email: true, sms: true } }, { email: { sent: false }, sms: { sent: false } });
    expect(db.from).not.toHaveBeenCalled();
  });
  it.each([[true, false, "email"], [false, true, "sms"], [true, true, "both"]] as const)("records only confirmed channels (%s, %s)", async (email, sms, sentVia) => {
    const db = database();
    await markSalesQuoteSent(db.client, "quote", { status: "draft" }, { channels: { email: true, sms: true } }, { email: { sent: email }, sms: { sent: sms } });
    expect(db.update).toHaveBeenCalledWith(expect.objectContaining({ status: "sent", sent_via: sentVia }));
    expect(db.eq).toHaveBeenCalledWith("id", "quote");
  });
  it("does not downgrade a signed quote when its contract is resent", async () => {
    const db = database();
    await markSalesQuoteSent(db.client, "quote", { status: "sold" }, {}, { email: { sent: true }, sms: { sent: false } });
    expect(db.update.mock.calls[0][0]).not.toHaveProperty("status");
  });
});
