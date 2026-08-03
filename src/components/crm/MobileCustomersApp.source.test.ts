import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {mobilePaymentSendRequest} from "./MobileCustomersApp";

const source=readFileSync(new URL("./MobileCustomersApp.tsx",import.meta.url),"utf8");

describe("mobile customer payment-link confirmation",()=>{
  it("offers one explicit text or email choice with a privacy-safe review",()=>{
    expect(source).toContain("How should the Square payment link be sent?");
    expect(source).toContain("Text Message");
    expect(source).toContain("maskedPhone(action.row.phone)");
    expect(source).toContain("maskedEmail(action.row.email)");
    expect(source).toContain('channel==="text"?"Text Message":"Email"');
    expect(source).toContain('aria-pressed={channel==="text"}');
    expect(source).toContain('aria-pressed={channel==="email"}');
  });

  it("posts the selected channel to the governed Square payment route",()=>{
    const action={row:{quoteId:"quote-1",jobId:"job-1"} as never,type:"balance" as const,key:"request-1"};
    expect(mobilePaymentSendRequest(action,"text")).toEqual({quoteId:"quote-1",jobId:"job-1",paymentType:"balance",channel:"text",idempotencyKey:"request-1"});
    expect(mobilePaymentSendRequest(action,"email")).toMatchObject({channel:"email"});
  });

  it("reports provider acceptance truthfully and never claims delivery",()=>{
    expect(source).toContain('result.deliveryState!=="accepted"');
    expect(source).toContain("Provider acceptance does not mean delivery");
    expect(source).toContain("Delivery is not yet confirmed");
    expect(source).not.toContain("link sent by");
  });
});
