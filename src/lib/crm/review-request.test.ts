import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  REVIEW_REQUEST_META_KEY,
  buildReviewRequestSmsBody,
  customerFirstName,
  getReviewRequestMeta,
  isReviewRequestTransition,
  maybeSendReviewRequestForJob
} from "./review-request";

vi.mock("@/lib/notify/twilio", () => ({
  sendSms: vi.fn()
}));
vi.mock("@/lib/crm/backend", () => ({
  recordCrmActivity: vi.fn().mockResolvedValue(undefined)
}));

import { sendSms } from "@/lib/notify/twilio";
import { recordCrmActivity } from "@/lib/crm/backend";

const sendSmsMock = vi.mocked(sendSms);
const recordActivityMock = vi.mocked(recordCrmActivity);

type JobRow = Record<string, unknown>;

function makeSupabase(job: JobRow | null) {
  const updates: Array<Record<string, unknown>> = [];
  const supabase = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: job, error: null }))
        }))
      })),
      update: vi.fn((patch: Record<string, unknown>) => {
        updates.push(patch);
        return { eq: vi.fn(async () => ({ error: null })) };
      })
    }))
  };
  return { supabase: supabase as never, updates };
}

const actor = { email: "mike@805shutters.com" };

const baseJob: JobRow = {
  id: "job-1",
  status: "installed",
  customer_name: "susan milani",
  phone: "8055551234",
  meta: {}
};

describe("isReviewRequestTransition", () => {
  it("fires when entering installed, invoiced, or closed from an earlier stage", () => {
    expect(isReviewRequestTransition("ordered", "installed")).toBe(true);
    expect(isReviewRequestTransition("sold", "invoiced")).toBe(true);
    expect(isReviewRequestTransition("ordered", "closed")).toBe(true);
  });
  it("does not fire when moving between completed-install statuses", () => {
    expect(isReviewRequestTransition("installed", "invoiced")).toBe(false);
    expect(isReviewRequestTransition("invoiced", "closed")).toBe(false);
    expect(isReviewRequestTransition("installed", "closed")).toBe(false);
  });
  it("does not fire for non-install statuses", () => {
    expect(isReviewRequestTransition("new", "scheduled")).toBe(false);
    expect(isReviewRequestTransition("scheduled", "quoted")).toBe(false);
  });
});

describe("buildReviewRequestSmsBody", () => {
  it("uses the customer's capitalized first name and the link", () => {
    const body = buildReviewRequestSmsBody({ customer_name: "susan milani" }, "https://g.page/r/x");
    expect(body).toContain("Hi Susan,");
    expect(body).toContain("https://g.page/r/x");
    expect(body).toContain("STOP");
  });
  it("falls back when the name is missing", () => {
    expect(customerFirstName("")).toBe("there");
  });
});

describe("maybeSendReviewRequestForJob", () => {
  beforeEach(() => {
    process.env.GOOGLE_REVIEW_LINK = "https://g.page/r/test-link";
    sendSmsMock.mockReset();
    recordActivityMock.mockClear();
  });
  afterEach(() => {
    delete process.env.GOOGLE_REVIEW_LINK;
  });

  it("is disabled (and writes nothing) without GOOGLE_REVIEW_LINK", async () => {
    delete process.env.GOOGLE_REVIEW_LINK;
    const { supabase, updates } = makeSupabase({ ...baseJob });
    const result = await maybeSendReviewRequestForJob(supabase, "job-1", actor);
    expect(result.status).toBe("disabled");
    expect(updates).toHaveLength(0);
    expect(sendSmsMock).not.toHaveBeenCalled();
  });

  it("sends once and stamps meta", async () => {
    sendSmsMock.mockResolvedValue({ sent: true, sid: "SM123" });
    const { supabase, updates } = makeSupabase({ ...baseJob });
    const result = await maybeSendReviewRequestForJob(supabase, "job-1", actor, "job_update");
    expect(result.status).toBe("sent");
    expect(sendSmsMock).toHaveBeenCalledOnce();
    expect(updates).toHaveLength(1);
    const stamped = getReviewRequestMeta(updates[0].meta);
    expect(stamped.status).toBe("sent");
    expect(stamped.sms_sid).toBe("SM123");
    expect(stamped.request_source).toBe("job_update");
    expect(recordActivityMock).toHaveBeenCalledOnce();
  });

  it("never sends twice for the same job", async () => {
    const { supabase, updates } = makeSupabase({
      ...baseJob,
      meta: { [REVIEW_REQUEST_META_KEY]: { status: "sent", sent_at: "2026-07-01T00:00:00Z" } }
    });
    const result = await maybeSendReviewRequestForJob(supabase, "job-1", actor);
    expect(result.status).toBe("already_handled");
    expect(sendSmsMock).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it("skips jobs that are not in a completed-install status", async () => {
    const { supabase } = makeSupabase({ ...baseJob, status: "ordered" });
    const result = await maybeSendReviewRequestForJob(supabase, "job-1", actor);
    expect(result.status).toBe("not_applicable");
    expect(sendSmsMock).not.toHaveBeenCalled();
  });

  it("stamps skipped when the phone is invalid, so it will not retry", async () => {
    sendSmsMock.mockResolvedValue({ sent: false, skipped: "invalid or missing destination phone" });
    const { supabase, updates } = makeSupabase({ ...baseJob, phone: "n/a" });
    const result = await maybeSendReviewRequestForJob(supabase, "job-1", actor);
    expect(result.status).toBe("skipped");
    expect(getReviewRequestMeta(updates[0].meta).status).toBe("skipped");
  });

  it("leaves no stamp when Twilio is unconfigured (local dev)", async () => {
    sendSmsMock.mockResolvedValue({ sent: false, skipped: "twilio not configured" });
    const { supabase, updates } = makeSupabase({ ...baseJob });
    const result = await maybeSendReviewRequestForJob(supabase, "job-1", actor);
    expect(result.status).toBe("skipped");
    expect(updates).toHaveLength(0);
  });

  it("never throws when the job lookup fails", async () => {
    const { supabase } = makeSupabase(null);
    const result = await maybeSendReviewRequestForJob(supabase, "job-1", actor);
    expect(result.status).toBe("error");
  });
});
