import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPageByPath } from "@/lib/site-data";
import { AGENT_STAFF_SMS_FOOTER, SMS_OPT_IN_NO_SHARING_STATEMENT, staffBookingSmsNotice } from "./staff-booking-notice";

describe("staff booking SMS public notice", () => {
  it("keeps the required no-sharing sentence and the existing analytics disclosure", () => {
    expect(SMS_OPT_IN_NO_SHARING_STATEMENT).toBe(
      "We do not sell or share your SMS opt-in data or personal information with third parties for marketing purposes",
    );
    const privacy = getPageByPath("/privacy-policy/");
    const sms = privacy?.sections.find((section) => section.heading === "Staff booking text messages");
    const analytics = privacy?.sections.find((section) => section.heading === "Advertising And Analytics");
    expect(sms?.body.startsWith(SMS_OPT_IN_NO_SHARING_STATEMENT)).toBe(true);
    expect(sms?.body).toContain(staffBookingSmsNotice.legalName);
    expect(sms?.body).toContain("Message frequency varies.");
    expect(sms?.body).toContain("Message and data rates may apply.");
    expect(sms?.body).toContain("STOP");
    expect(sms?.body).toContain("805@805shutters.com");
    expect(sms?.body).toContain("805-590-8050");
    expect(sms?.body).toContain("Carriers are not liable for delayed or undelivered messages.");
    expect(sms?.body).toContain("still pending");
    expect(sms?.body).not.toContain("consent was collected");
    expect(sms?.body).not.toMatch(/checkbox|opt in by texting|customers opt in/i);
    expect(analytics?.body).toBe(
      "The website may use analytics and advertising tools, including Google and Meta technologies, to understand campaign performance and show relevant ads. These tools may use cookies or similar identifiers.",
    );
  });

  it("publishes staff terms with bold STOP and HELP and no consent claim", () => {
    const source = readFileSync(new URL("../../app/staff-booking-sms/page.tsx", import.meta.url), "utf8");
    expect(source).toContain("<strong>STOP</strong>");
    expect(source).toContain("<strong>HELP</strong>");
    expect(source).toContain("SMS_OPT_IN_NO_SHARING_STATEMENT");
    expect(staffBookingSmsNotice.consentGap).toContain("still pending");
    expect(AGENT_STAFF_SMS_FOOTER).toBe("Reply STOP to unsubscribe; HELP for help.");
    expect(staffBookingSmsNotice.program).toBe("staff-only confirmed consultation alerts");
  });
});
