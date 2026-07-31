import { describe, expect, it } from "vitest";
import { maskedPaymentRecipient, mobilePaymentRecipient, mobilePaymentReplay, MOBILE_CUSTOMER_JOB_COLUMNS, MOBILE_CUSTOMER_QUOTE_COLUMNS } from "./route";

describe("mobile customer search query", () => {
  it("selects only columns that exist on crm_jobs", () => {
    expect(MOBILE_CUSTOMER_JOB_COLUMNS.split(",")).toEqual([
      "id",
      "customer_name",
      "phone",
      "email",
      "address",
      "city",
      "estimated_total",
      "deposit_paid",
      "meta",
    ]);
    expect(MOBILE_CUSTOMER_JOB_COLUMNS).not.toMatch(/\b(state|zip)\b/);
  });

  it("loads the authoritative quote archive timestamp for strict scope filtering", () => {
    expect(MOBILE_CUSTOMER_QUOTE_COLUMNS.split(",")).toContain("archived_at");
  });
});

describe("mobile payment-link governance", () => {
  it("selects exactly the matching text recipient and masks it for review", () => {
    const recipient=mobilePaymentRecipient({quote:{phone:"805-555-1212"},job:{phone:"(805) 555-1212"},channel:"text"});
    expect(recipient).toBe("+18055551212");
    expect(maskedPaymentRecipient("text",recipient)).toBe("•••-•••-1212");
  });

  it("selects exactly the matching email recipient and masks it for review", () => {
    const recipient=mobilePaymentRecipient({quote:{email:"Customer@Example.com"},job:{email:"customer@example.com"},channel:"email"});
    expect(recipient).toBe("customer@example.com");
    expect(maskedPaymentRecipient("email",recipient)).toBe("c•••@example.com");
  });

  it("fails closed for missing, opted-out, or mismatched recipients", () => {
    expect(()=>mobilePaymentRecipient({quote:{},job:{},channel:"text"})).toThrow("No eligible customer phone");
    expect(()=>mobilePaymentRecipient({quote:{email:"a@example.com"},job:{email:"b@example.com"},channel:"email"})).toThrow("do not exactly match");
    expect(()=>mobilePaymentRecipient({quote:{phone:"8055551212"},job:{phone:"8055551212"},channel:"text",preference:{do_not_contact:true}})).toThrow("opted out");
  });

  it("replays an accepted exact request without another provider send", () => {
    const prior={quote_id:"q1",job_id:"j1",payment_type:"balance",channel:"email",recipient:"a@example.com",status:"accepted",amount:123,provider_status:"accepted"};
    expect(mobilePaymentReplay(prior,{quoteId:"q1",jobId:"j1",paymentType:"balance",channel:"email",recipient:"a@example.com"})).toEqual({amount:123,providerStatus:"accepted"});
    expect(()=>mobilePaymentReplay(prior,{quoteId:"q2",jobId:"j1",paymentType:"balance",channel:"email",recipient:"a@example.com"})).toThrow("different customer");
  });

  it("does not retry failed or unknown provider attempts", () => {
    const base={quote_id:"q1",job_id:"j1",payment_type:"balance",channel:"text",recipient:"+18055551212",amount:123};
    expect(()=>mobilePaymentReplay({...base,status:"failed"},{quoteId:"q1",jobId:"j1",paymentType:"balance",channel:"text",recipient:"+18055551212"})).toThrow("prior text attempt is failed");
    expect(()=>mobilePaymentReplay({...base,status:"sending"},{quoteId:"q1",jobId:"j1",paymentType:"balance",channel:"text",recipient:"+18055551212"})).toThrow("prior text attempt is unknown");
  });
});
