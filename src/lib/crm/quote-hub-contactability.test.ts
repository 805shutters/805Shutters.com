import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CrmQuote } from "./types";
const eligible = vi.hoisted(() => vi.fn());
vi.mock("./quote-hub-eligibility-server", () => ({loadFollowUpEligibleQuoteIds:eligible}));
import { loadHubConversation, prepareHubEmail } from "./quote-hub";
import { hubTemplate } from "./quote-hub-model";
const quote = { id:"quote",status:"sent",customer_name:"Customer",customer_email:"customer@example.com",share_token:null } as CrmQuote;
const db = {from:vi.fn(() => {
 const query={select:()=>query,eq:()=>query,order:async()=>({data:[],error:null})};return query;
})} as unknown as SupabaseClient;
describe("stale follow-up conversation safety", () => {
 beforeEach(()=>{eligible.mockReset().mockResolvedValue([]);});
 it("disables an individually sent quote after its linked customer sells",async()=>{
  const state=await loadHubConversation(db,quote);
  expect(state.canSend).toBe(false);
  expect(state.blockedReason).toContain("already sold");
 });
 it("rejects previewing a new offer from a stale open conversation",async()=>{
  await expect(prepareHubEmail(db,quote,"805@805shutters.com",{action:"savings",...hubTemplate("savings","Customer"),percent:10,photoIds:[]})).rejects.toMatchObject({status:409,message:expect.stringContaining("already sold")});
 });
 it("fails closed if sale verification becomes unavailable",async()=>{
  eligible.mockRejectedValue(new Error("sale history unavailable"));
  await expect(loadHubConversation(db,quote)).rejects.toThrow("sale history unavailable");
 });
});
