import { it, expect, vi } from "vitest";
vi.mock("./public-quote", () => ({ buildSignedShopSmsForRecipient: vi.fn() }));
import { processSignedSmsRetries, signedSmsRetryOutcome } from "./signed-sms-retry";
import type { SoldQuoteSmsNotification } from "./sold-quote-notifications";
const delivery = (status: SoldQuoteSmsNotification['delivery']['status'], persisted = true) => ({
  recipient: "staff", result: { sent: status === "accepted" },
  delivery: { recipient: "staff", recipientE164: null, status, persisted },
}) as SoldQuoteSmsNotification;
it("completes only after all recipients have durable provider acceptance", () => {
  expect(signedSmsRetryOutcome([delivery("accepted"), delivery("delivered")], 1).status).toBe("complete");
  expect(signedSmsRetryOutcome([delivery("accepted"), delivery("failed")], 1).status).toBe("retry");
  expect(signedSmsRetryOutcome([delivery("accepted",false)], 1).status).toBe("retry");
});
it.each(["unknown","sending","undelivered","invalid"] as const)("holds %s instead of blindly resending", status => {
  expect(signedSmsRetryOutcome([delivery(status)], 1).status).toBe("blocked");
});
it("caps repeated known failures and rejects an empty recipient set", () => {
  expect(signedSmsRetryOutcome([delivery("failed")],6).status).toBe("blocked");
  expect(signedSmsRetryOutcome([],1).status).toBe("blocked");
});
it("recovers a signed contract independently of the original request and records its result", async () => {
  const claim = {quote_id:"quote",lease_token:"lease",attempts:1};
  const finish = vi.fn(); const deliver = vi.fn().mockResolvedValue([delivery("accepted")]);
  const result = await processSignedSmsRetries({} as never, {}, {
    claim: vi.fn().mockResolvedValueOnce(claim).mockResolvedValue(null), deliver, finish, now: () => 1_000_000,
  });
  expect(deliver).toHaveBeenCalledWith(claim); expect(result.complete).toBe(1);
  expect(finish).toHaveBeenCalledWith(claim,{status:"complete",error:null},new Date(1_300_000).toISOString());
});
it("schedules pre-send failure without losing the ticket and applies backoff", async () => {
  const finish = vi.fn();
  const result = await processSignedSmsRetries({} as never, {limit:1}, {
    claim: async () => ({quote_id:"quote",lease_token:"lease",attempts:3}),
    deliver: async () => {throw new Error("database unavailable")},finish,now: () => 1_000_000,
  });
  expect(result.retry).toBe(1);
  expect(finish.mock.calls[0][2]).toBe(new Date(2_200_000).toISOString());
});
it("honors notification suppression on a queued contract", async () => {
  const finish=vi.fn();
  const result=await processSignedSmsRetries({} as never,{limit:1},{
    claim:async()=>({quote_id:"quote",lease_token:"lease",attempts:1}),deliver:async()=>null,finish,now:()=>1_000_000,
  });
  expect(result.suppressed).toBe(1);
});
