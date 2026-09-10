import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
const mocks = vi.hoisted(() => ({ email: vi.fn(), sms: vi.fn(), pub: vi.fn(), prepare: vi.fn() }));
vi.mock("@/lib/notify/email", () => ({ sendEmail: mocks.email, buildQuoteEmail: () => ({ subject: "Quote", html: "safe", text: "safe" }) }));
vi.mock("@/lib/notify/twilio", () => ({ sendSms: mocks.sms, toE164: (v: string) => /^\+1\d{10}$/.test(v) ? v : null }));
vi.mock("./public-quote", () => ({ loadPublicQuoteByToken: mocks.pub, publicQuoteUrl: (t: string) => `https://805shutters.com/quote/${t}`, buildQuoteShareSms: (url: string) => url }));
vi.mock("./sales-quote-v2-send", () => ({ prepareV2CustomerSendPayloadFromDatabase: mocks.prepare }));
import { deliverFrozenNativeQuote, nativeDeliveryRequest, nativeQuoteDeliveryCapability } from "./native-quote-delivery";
const delivery = { id: "delivery", quote_id: "source", crm_quote_id: "crm", share_token: "preserved", request_key: "request-1", quote_revision: 1, customer_payload: { total: 100.01 }, request: { email: ["customer@example.invalid"], sms: ["+18055550100"], note: null, measureDecision: null } };
function db(states: string[] = ["pending", "pending"]) {
 const attempts = states.map((state, i) => ({ id: `attempt-${i}`, channel: i ? "sms" : "email", recipient: i ? "+18055550100" : "customer@example.invalid", state, claim_token: "claim" }));
 const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
  const a = attempts.find(item => item.id === args.p_attempt_id)!;
  if (name === "claim_native_quote_delivery_attempt") return { data: { claimed: ["pending", "failed"].includes(a.state), attempt: a }, error: null };
  const result = args.p_result as { sent: boolean; uncertain?: boolean };
  return { data: { ...a, state: result.sent ? "sent" : result.uncertain ? "uncertain" : "failed", result }, error: null };
 });
 const query = { select: () => query, eq: () => query, order: async () => ({ data: attempts, error: null }) };
 return { client: { from: () => query, rpc } as unknown as SupabaseClient, rpc };
}
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
function ready() {
 vi.stubEnv("QUOTE_V2_NATIVE_CUSTOMER_DELIVERY", "enabled-after-native-delivery-migration");
 mocks.pub.mockResolvedValue({ total: 100.01, allPriced: true, signed: false, customerName: "Synthetic", lines: [], versions: [] });
 mocks.email.mockResolvedValue({ sent: true, id: "email-receipt" });
 mocks.sms.mockResolvedValue({ sent: true, sid: "sms-receipt" });
}
describe("native customer delivery", () => {
 it("fails closed before touching a provider without activation", async () => {
  vi.stubEnv("QUOTE_V2_NATIVE_CUSTOMER_DELIVERY", "");
  await expect(deliverFrozenNativeQuote(db().client, delivery, "actor")).rejects.toThrow("activation");
  expect(mocks.email).not.toHaveBeenCalled();
 });
 it("requires the applied capability RPC", async () => {
  ready();
  const client = { rpc: vi.fn().mockResolvedValue({ data: null, error: { code: "42883" } }) } as unknown as SupabaseClient;
  expect(await nativeQuoteDeliveryCapability(client, "quote", "actor")).toMatchObject({ enabled: false, canSend: false });
 });
 it("claims each recipient and persists provider identities", async () => {
  ready(); const test = db();
  expect(await deliverFrozenNativeQuote(test.client, delivery, "actor")).toMatchObject({ email: { sent: true }, sms: { sent: true } });
  expect(mocks.email).toHaveBeenCalledWith(expect.objectContaining({ from: "805 Shutters <805@805shutters.com>", idempotencyKey: "native-quote:attempt-0" }));
  expect(test.rpc).toHaveBeenCalledWith("finish_native_quote_delivery_attempt", expect.objectContaining({ p_result: expect.objectContaining({ providerId: "sms-receipt" }) }));
 });
 it.each(["sent", "sending", "uncertain"])("never resends a %s recipient", async (state) => {
  ready(); await deliverFrozenNativeQuote(db([state, state]).client, delivery, "actor");
  expect(mocks.email).not.toHaveBeenCalled(); expect(mocks.sms).not.toHaveBeenCalled();
 });
 it("does not repeat successful channels when a definite failure retries", async () => {
  ready(); await deliverFrozenNativeQuote(db(["sent", "failed"]).client, delivery, "actor");
  expect(mocks.email).not.toHaveBeenCalled(); expect(mocks.sms).toHaveBeenCalledTimes(1);
 });
 it("keeps missing provider receipts uncertain", async () => {
  ready(); mocks.email.mockResolvedValue({ sent: true }); const test = db(["pending", "sent"]);
  const result = await deliverFrozenNativeQuote(test.client, delivery, "actor");
  expect(result.email.sent).toBe(false);
  expect(test.rpc).toHaveBeenCalledWith("finish_native_quote_delivery_attempt", expect.objectContaining({ p_result: expect.objectContaining({ uncertain: true, sent: false }) }));
 });
 it.each([{ total: 100, allPriced: true }, { total: 100.01, allPriced: false }, { total: 100.01, allPriced: true, signed: true }])("rejects drift or signed contracts before delivery", async (pub) => {
  ready(); mocks.pub.mockResolvedValue(pub);
  await expect(deliverFrozenNativeQuote(db().client, delivery, "actor")).rejects.toThrow();
  expect(mocks.email).not.toHaveBeenCalled();
 });
 it("normalizes and validates explicit recipients", () => {
  expect(nativeDeliveryRequest({}, { channels: { email: true, sms: false }, emails: [" CUSTOMER@example.invalid ", "customer@example.invalid"] })).toMatchObject({ email: ["customer@example.invalid"], sms: [] });
  expect(() => nativeDeliveryRequest({}, { channels: { email: false, sms: false } })).toThrow("Select");
  expect(() => nativeDeliveryRequest({}, { emails: "malformed" as unknown as string[] })).toThrow("Invalid");
 });
});
