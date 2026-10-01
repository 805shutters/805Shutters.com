import { describe, expect, it } from "vitest";
import { followUpEligibleQuoteIds, type FollowUpData, type FollowUpRecord } from "./quote-hub-eligibility";
const empty = (): FollowUpData => ({ quotes: [], salesQuotes: [], jobs: [], customers: [], contracts: [], products: [], entries: [] });
const sent = (id: string, extra: Partial<FollowUpRecord> = {}): FollowUpRecord => ({ id, status: "sent", ...extra });
describe("unsold customer follow-ups", () => {
  it("excludes all options of a job when an option has sold", () => {
    const data = empty();
    data.quotes = [sent("option-b", {job_id:"job"}), {id:"option-a",job_id:"job",status:"sold"}, sent("other",{job_id:"other-job"})];
    expect(followUpEligibleQuoteIds(data)).toEqual(["other"]);
  });
  it("excludes different jobs and groups linked to the same sold customer", () => {
    const data = empty();
    data.quotes = [sent("new",{job_id:"new-job"}), {id:"old",job_id:"old-job",status:"installed"},sent("unrelated")];
    data.contracts = [{id:"a",customer_id:"customer",job_id:"old-job",quote_id:"old"}, {id:"b",customer_id:"customer",job_id:"new-job",quote_id:"new"}];
    expect(followUpEligibleQuoteIds(data)).toEqual(["unrelated"]);
  });
  it("connects sales options, CRM mirrors, and a sold group outside the sent list", () => {
    const data = empty();
    data.quotes = [sent("mirror", {external_id:"quote:sales-b"})];
    data.salesQuotes = [sent("sales-b",{quote_group_id:"group"}),{id:"sales-a",quote_group_id:"group",status:"draft",signed_at:"2026-10-01"}];
    expect(followUpEligibleQuoteIds(data)).toEqual([]);
  });
  it.each(["sold", "ordered", "installed", "closed"])("blocks a job with %s evidence even without a sold quote", status => {
    const data = empty();data.quotes=[sent("q",{job_id:"j"})];data.jobs=[{id:"j",status}];
    expect(followUpEligibleQuoteIds(data)).toEqual([]);
  });
  it("blocks a signed contract and a linked historical customer sale", () => {
    const data = empty();data.quotes=[sent("q1"),sent("q2")];
    data.contracts=[{id:"c1",quote_id:"q1",signed_at:"2026-10-01"},{id:"c2",quote_id:"q2",customer_id:"buyer"}];
    data.customers=[{id:"buyer",latest_sold_date:"2026-09-01"}];
    expect(followUpEligibleQuoteIds(data)).toEqual([]);
  });
  it("preserves genuinely unsold alternatives and excludes drafts and archives", () => {
    const data = empty();data.quotes=[sent("a",{quote_group_id:"g"}),sent("b",{quote_group_id:"g"}),{id:"draft",status:"draft"},sent("archived",{archived_at:"2026-10-01"})];
    expect(followUpEligibleQuoteIds(data)).toEqual(["a","b"]);
  });
  it("ignores deleted sale evidence and never joins customers by their names", () => {
    const data = empty();data.quotes=[sent("unsold"),{id:"sold",status:"sold",meta:{deleted_at:"2026-10-01"}}];
    expect(followUpEligibleQuoteIds(data)).toEqual(["unsold"]);
  });
  it("suppresses historical options with corroborated contact identity but does not match name alone", () => {
    const data = empty();
    data.quotes = [
      {id:"sold",status:"sold",customer_name:"Same Name",customer_email:"buyer@example.com",customer_address:"123 Main St",customer_phone:"+18055551234"},
      sent("email-match",{customer_name:"Same Name",customer_email:"buyer@example.com"}),
      sent("home-match",{customer_name:"Same Name",customer_address:"123 Main St",customer_phone:"805-555-1234"}),
      sent("different-person",{customer_name:"Same Name",customer_email:"other@example.com",customer_address:"456 Other St",customer_phone:"8055559876"}),
      sent("name-only",{customer_name:"Same Name"}),
    ];
    expect(followUpEligibleQuoteIds(data)).toEqual(["different-person","name-only"]);
  });
  it("joins native V2 source identities when their group IDs differ", () => {
    const data = empty();data.quotes=[{id:"native-sold",status:"sold",meta:{source_sales_quote_id:"original"}},sent("alternative",{quote_group_id:"original-group"})];
    data.salesQuotes=[sent("original",{quote_group_id:"original-group"})];
    expect(followUpEligibleQuoteIds(data)).toEqual([]);
  });
  it("does not treat payment totals alone as sold", () => {
    const data = empty();data.quotes=[sent("paid-unsigned",{meta:{deposit_paid:100}})];
    expect(followUpEligibleQuoteIds(data)).toEqual(["paid-unsigned"]);
  });
});
