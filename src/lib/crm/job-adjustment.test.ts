import { describe, expect, it } from "vitest";
import { previewJobAdjustment, jobAdjustmentFields } from "./job-adjustment";
import { buildBookkeepingRows } from "./bookkeeping";
import { buildJobTrackingView } from "./job-tracking-view";
import type { CrmQuote, CrmBookkeepingCredit, CrmBookkeepingPayment } from "./types";

describe("customer job adjustments", () => {
  it("adds charges and credits in cents, including settling the balance", () => {
    expect(previewJobAdjustment(100.1,"25.15","charge")).toEqual({amount:25.15,balance:125.25});
    expect(previewJobAdjustment(100.1,"100.10","credit").balance).toBe(0);
    expect(previewJobAdjustment(0,"50","charge").balance).toBe(50);
  });
  it.each(["", "0", "-1", "1.234", "1e3", "NaN", "Infinity", "1,000", "999999999999999999999"])("rejects invalid money %s", amount=>{
    expect(()=>previewJobAdjustment(100,amount,"charge")).toThrow();
  });
  it("requires a known balance and does not quietly turn an excessive credit into a refund",()=>{
    expect(()=>previewJobAdjustment(null,"10","charge")).toThrow();
    expect(()=>previewJobAdjustment(50,"50.01","credit")).toThrow(/exceeds/);
    expect(()=>previewJobAdjustment(-1,"10","charge")).toThrow();
  });
  it("requires a reason and uses the existing ledger adjustment fields",()=>{
    expect(()=>jobAdjustmentFields(100,"25","credit"," ")).toThrow(/note/);
    expect(jobAdjustmentFields(100,"25","charge"," Extension pole ")).toEqual({balance_due_target:125,balance_adjustment_note:"Added charge: Extension pole"});
    expect(jobAdjustmentFields(100,"25","credit","Courtesy discount")).toEqual({balance_due_target:75,balance_adjustment_note:"Credit: Courtesy discount"});
  });
  it("recalculates payment requests from ledger credits without rewriting the signed quote",()=>{
    const quote={id:"q1",job_id:"j1",customer_name:"Sample",status:"sold",quote_total:1000,deposit_required:500,materials_cost:100,meta:{},sold_at:"2026-09-01",created_at:"2026-09-01",updated_at:"2026-09-01"} as CrmQuote;
    const view=(credits:CrmBookkeepingCredit[],payments:CrmBookkeepingPayment[]=[])=>buildJobTrackingView({jobs:[],quotes:[quote],rows:buildBookkeepingRows({quotes:[quote],entries:[],credits,payments}),files:[]})[0];
    const credit={id:"c1",to_quote_id:"q1",amount:600,note:"Credit: Discount",credit_date:"2026-09-17"} as CrmBookkeepingCredit;
    const credited=view([credit]);
    expect(credited).toMatchObject({total:1000,balanceOutstanding:400,depositOutstanding:400,squareBalanceOutstanding:0});
    const charge={id:"c2",from_quote_id:"q1",amount:50,note:"Added charge: Pole",credit_date:"2026-09-17"} as CrmBookkeepingCredit;
    const charged=view([charge],[{id:"p1",quote_id:"q1",amount:500,payment_label:"Deposit payment",payment_type:"cash",paid_at:"2026-09-16"} as CrmBookkeepingPayment]);
    expect(charged).toMatchObject({total:1000,balanceOutstanding:550,depositOutstanding:0,squareBalanceOutstanding:550});
    expect(charged.row?.creditsOut[0].note).toBe("Added charge: Pole");
    expect(quote.quote_total).toBe(1000);
  });
});
