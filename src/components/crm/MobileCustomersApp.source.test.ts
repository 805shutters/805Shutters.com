import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";

const source=readFileSync(new URL("./MobileCustomersApp.tsx",import.meta.url),"utf8");

describe("mobile customer payment-link confirmation",()=>{
  it("offers one explicit text or email choice with a privacy-safe review",()=>{
    expect(source).toContain("Choose exactly one delivery channel");
    expect(source).toContain("maskedPhone(action.row.phone)");
    expect(source).toContain("maskedEmail(action.row.email)");
    expect(source).toContain("Confirm and send by ${channel}");
  });

  it("reports provider acceptance truthfully and never claims delivery",()=>{
    expect(source).toContain('result.deliveryState!=="accepted"');
    expect(source).toContain("Provider acceptance does not mean delivery");
    expect(source).toContain("Delivery is not yet confirmed");
    expect(source).not.toContain("link sent by");
  });
});
