import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
const mocks = vi.hoisted(() => ({ email: vi.fn(), sms: vi.fn(), pub: vi.fn(), prepare: vi.fn() }));
vi.mock("@/lib/notify/email", () => ({ sendEmail: mocks.email, buildQuoteEmail: () => ({ subject: "Quote", html: "safe", text: "safe" }) }));
vi.mock("@/lib/notify/twilio", () => ({ sendSms: mocks.sms, toE164: (v: string) => /^\+1\d{10}$/.test(v) ? v : null }));
vi.mock("./public-quote", () => ({ loadPublicQuoteByToken: mocks.pub, publicQuoteUrl: (t: string) => `https://805shutters.com/quote/${t}`, buildQuoteShareSms: (url: string) => url }));
vi.mock("./sales-quote-v2-send", async (importOriginal) => ({ ...await importOriginal<typeof import("./sales-quote-v2-send")>(), prepareV2CustomerSendPayloadFromDatabase: mocks.prepare }));
import { deliverFrozenNativeQuote, prepareNativeInPersonQuote, nativeDeliveryRequest, nativeQuoteDeliveryCapability, sendNativeSalesQuote } from "./native-quote-delivery";
import { V2SendPreparationError } from "./sales-quote-v2-send";
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
 it("reports an old success as already sent, never as a fresh send", async () => {
  ready(); const result = await deliverFrozenNativeQuote(db(["sent", "sent"]).client, delivery, "actor");
  expect(result.email).toEqual({ sent: false, alreadySent: true, acceptedCount: 0 });
  expect(result.sms).toEqual({ sent: false, alreadySent: true, acceptedCount: 0 });
  expect(mocks.email).not.toHaveBeenCalled(); expect(mocks.sms).not.toHaveBeenCalled();
 });
 it("limits provider calls to the requested resend batch", async () => {
  ready(); const test = db(); const filters: unknown[][] = [];
  const query = { select: () => query, eq: (...args: unknown[]) => { filters.push(args); return query; }, order: async () => ({data:[{id:"attempt-0",channel:"email",recipient:"customer@example.invalid",state:"pending"}],error:null}) };
  const result = await deliverFrozenNativeQuote({ from: () => query, rpc: test.rpc } as unknown as SupabaseClient, {...delivery,send_key:"resend-request"}, "actor");
  expect(filters).toContainEqual(["send_key","resend-request"]);
  expect(result.email).toMatchObject({sent:true,acceptedCount:1});
  expect(mocks.email).toHaveBeenCalledTimes(1);
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

describe("native quote preparation errors", () => {
 const actor = { userId: "10000000-0000-4000-8000-000000000001" };
 const options = { expectedRevision: 8, idempotencyKey: "test-delivery-8", channels: { email: true, sms: false }, emails: ["customer@example.invalid"] };
 function preparationDb() {
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({data:null,error:null}) };
  const rpc = vi.fn().mockResolvedValue({data:{enabled:true,schemaVersion:1,native:true,canSend:true},error:null});
  return {client:{from:()=>query,rpc} as unknown as SupabaseClient,rpc};
 }
 it.each([{status:"archived"},{status:"draft",archived_at:"2026-09-23T00:00:00Z"}])("blocks an archived quote before preparation or provider calls", async (quote) => {
  ready(); const test=preparationDb();
  await expect(sendNativeSalesQuote(test.client,quote,actor,options)).rejects.toMatchObject({status:409,message:expect.stringContaining("archived")});
  expect(mocks.prepare).not.toHaveBeenCalled();expect(test.rpc).not.toHaveBeenCalled();expect(mocks.email).not.toHaveBeenCalled();
 });
 it("returns the quote and actionable preparation reason as a conflict", async () => {
  ready(); const test=preparationDb();
  mocks.prepare.mockRejectedValueOnce(new V2SendPreparationError("This quote has unfinished pricing. Save and price all selected designs before sending."));
  await expect(sendNativeSalesQuote(test.client,{id:"quote",quote_number:"805-TEST",status:"draft"},actor,options)).rejects.toMatchObject({status:409,message:expect.stringContaining("Quote 805-TEST cannot be sent: This quote has unfinished pricing")});
  expect(test.rpc).not.toHaveBeenCalledWith("reserve_native_quote_group_delivery",expect.anything());expect(mocks.email).not.toHaveBeenCalled();expect(mocks.sms).not.toHaveBeenCalled();
 });
 it("does not disguise an unexpected preparation failure as a user error", async () => {
  ready(); const test=preparationDb(); const failure=new Error("unexpected database failure");mocks.prepare.mockRejectedValueOnce(failure);
  await expect(sendNativeSalesQuote(test.client,{id:"quote",status:"draft"},actor,options)).rejects.toBe(failure);
 });
});

describe("in-person contract preparation",()=>{
 const actor={userId:"10000000-0000-4000-8000-000000000001"};
 function client(existing:unknown=delivery){
  const rpc=vi.fn(async(name:string)=>({data:name==='native_quote_delivery_capability'?{schemaVersion:1,native:true,supportsInPerson:true}:delivery,error:null}));
  const query={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:existing,error:null})};
  return {db:{rpc,from:()=>query} as unknown as SupabaseClient,rpc};
 }
 it('reuses a delivered contract without resending to any saved recipients',async()=>{
  ready();const test=client();
  expect(await prepareNativeInPersonQuote(test.db,{id:'source',status:'sent'},actor,{expectedRevision:1,idempotencyKey:'in-person-review'})).toEqual({path:'/quote/preserved',signed:false});
  expect(test.rpc).toHaveBeenCalledTimes(1);expect(mocks.email).not.toHaveBeenCalled();expect(mocks.sms).not.toHaveBeenCalled();
 });
 it('reserves a draft with an explicitly empty message request',async()=>{
  ready();const test=client(null);mocks.prepare.mockResolvedValue({backend:'authoritative_v2',total:100.01,lines:[]});
  await prepareNativeInPersonQuote(test.db,{id:'source',status:'draft',quote_v2_revision:1},actor,{expectedRevision:1,idempotencyKey:'in-person-review'});
  expect(test.rpc).toHaveBeenCalledWith('reserve_native_quote_group_delivery',expect.objectContaining({p_request:{email:[],sms:[],note:null,measureDecision:null,purpose:'in_person'}}));
  expect(mocks.email).not.toHaveBeenCalled();expect(mocks.sms).not.toHaveBeenCalled();
 });
 it('rejects a stale browser revision before opening the signing page',async()=>{
  ready();const test=client();
  await expect(prepareNativeInPersonQuote(test.db,{id:'source',status:'sent'},actor,{expectedRevision:2,idempotencyKey:'in-person-review'})).rejects.toMatchObject({status:409});
 });
});
