import { describe, expect, it } from "vitest";
import { buildCommercialOutreachMessage } from "@/lib/crm/commercial-outreach";
import type { CommercialAccount } from "@/lib/crm/commercial-types";

const account: CommercialAccount = {
  id: "account-1",
  created_at: "2026-07-09T12:00:00Z",
  updated_at: "2026-07-09T12:00:00Z",
  company_name: "Acme Builders",
  account_type: "general_contractor",
  status: "ready",
  priority: "high",
  assigned_to: "Unassigned",
  contact_name: "Taylor Smith",
  contact_title: "Estimator",
  email: "taylor@example.com",
  phone: "805-555-0100",
  website: "https://example.com/",
  address: null,
  city: "Ventura",
  state: "CA",
  postal_code: null,
  license_number: null,
  license_classifications: [],
  license_status: "unverified",
  license_verified_at: null,
  source_type: "manual",
  source_name: null,
  source_url: null,
  source_checked_at: null,
  external_id: null,
  next_action: null,
  next_action_due: null,
  last_contacted_at: null,
  last_replied_at: null,
  estimated_value: 0,
  notes: null,
  tags: [],
  do_not_email: false,
  meta: {}
};

describe("commercial outreach", () => {
  it("personalizes the contact and company without changing the template", () => {
    const message = buildCommercialOutreachMessage(
      account,
      "Window coverings for {{company_name}}",
      "Hi {{first_name}},\nI can help {{company_name}} in {{city}}.",
      "123 Business St, Ventura, CA 93001"
    );

    expect(message.subject).toBe("Window coverings for Acme Builders");
    expect(message.text).toContain("Hi Taylor,");
    expect(message.text).toContain("Acme Builders in Ventura");
    expect(message.text).toContain("123 Business St, Ventura, CA 93001");
    expect(message.text).toContain("reply “unsubscribe”");
  });

  it("escapes user-controlled content in HTML", () => {
    const message = buildCommercialOutreachMessage(
      { ...account, company_name: "<script>alert(1)</script>" },
      "Hello {{company_name}}",
      "Hi {{first_name}}, {{company_name}}",
      "123 Business St"
    );

    expect(message.html).not.toContain("<script>");
    expect(message.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});
