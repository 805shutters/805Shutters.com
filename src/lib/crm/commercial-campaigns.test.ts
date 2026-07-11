import { describe, expect, it } from "vitest";
import { campaignInput, campaignStopReason } from "@/lib/crm/commercial-campaigns";
import type { CommercialAccount } from "@/lib/crm/commercial-types";

const account: CommercialAccount = {
  id: "account-1",
  created_at: "2026-07-10T12:00:00Z",
  updated_at: "2026-07-10T12:00:00Z",
  company_name: "Acme Builders",
  account_type: "general_contractor",
  status: "ready",
  priority: "high",
  assigned_to: "Unassigned",
  contact_name: "Taylor Smith",
  contact_title: "Estimator",
  email: "taylor@example.com",
  phone: null,
  website: null,
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

describe("commercial campaign audience safeguards", () => {
  it("keeps a campaign audience to valid types, stages, and a safe daily limit", () => {
    const campaign = campaignInput({
      name: "Ventura GCs",
      account_type: "general_contractor",
      audience_statuses: ["researching", "ready"],
      intro_subject: "Intro for {{company_name}}",
      intro_body: "Hi {{first_name}}",
      follow_up_subject: "Following up",
      follow_up_body: "Hi again {{first_name}}",
      follow_up_delay_days: 5,
      daily_limit: 6500
    });

    expect(campaign.audience_statuses).toEqual(["researching", "ready"]);
    expect(campaign.daily_limit).toBe(5000);
    expect(campaign.follow_up_delay_days).toBe(5);
  });

  it("does not queue a follow-up after a reply, opt-out, or missing email", () => {
    const enrollment = { started_at: "2026-07-10T12:00:00Z" };
    expect(campaignStopReason({ ...account, last_replied_at: "2026-07-10T13:00:00Z" }, enrollment)).toBe("replied");
    expect(campaignStopReason({ ...account, do_not_email: true }, enrollment)).toBe("opted_out");
    expect(campaignStopReason({ ...account, email: null }, enrollment)).toBe("missing_email");
    expect(campaignStopReason(account, enrollment)).toBeNull();
  });
});
