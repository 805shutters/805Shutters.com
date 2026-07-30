import {describe,expect,it} from "vitest";
import {mobileMapTarget,mobilePhoneTarget,projectMobileCustomers} from "./mobile-customers";
describe("mobile customer info/payments",()=>{
  const jobs=[{id:"j1",customer_name:"Ada",phone:"805-555-1212",address:"1 Main St",city:"Ventura",state:"CA",zip:"93001"}];
  const quotes=[{id:"q1",job_id:"j1",status:"closed",quote_total:1000,deposit_required:500},{id:"q2",job_id:"j1",status:"archived",quote_total:800,deposit_required:400}];
  it("keeps closed work active until explicitly archived",()=>{expect(projectMobileCustomers({jobs,quotes,scope:"active"}).map(r=>r.id)).toEqual(["q1"]);expect(projectMobileCustomers({jobs,quotes,scope:"archived"}).map(r=>r.id)).toEqual(["q2"])});
  it("projects authoritative ledger balances",()=>{expect(projectMobileCustomers({jobs,quotes:quotes.slice(0,1),payments:[{quote_id:"q1",amount:200,payment_label:"Deposit"}],scope:"active"})[0]).toMatchObject({deposit:300,balance:500,contractTotal:1000})});
  it("creates safe native targets",()=>{expect(mobilePhoneTarget("(805) 555-1212")).toBe("tel:+18055551212");expect(mobilePhoneTarget("bad")).toBeNull();expect(mobileMapTarget("1 Main St, Ventura, CA")).toContain("1%20Main%20St%2C%20Ventura%2C%20CA");expect(mobileMapTarget(" ")).toBeNull()});
  it("includes brand-new jobs without quotes only in active results",()=>{const newJob={...jobs[0],id:"new",estimated_total:500,deposit_paid:100};expect(projectMobileCustomers({jobs:[newJob],quotes:[],scope:"active"})[0]).toMatchObject({jobId:"new",quoteId:null,contractTotal:500,deposit:100,balance:400});expect(projectMobileCustomers({jobs:[newJob],quotes:[],scope:"archived"})).toEqual([])});
});
