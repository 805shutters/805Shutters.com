import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  sms: vi.fn(),
  email: vi.fn(),
  activity: vi.fn(),
}));
vi.mock("@/lib/notify/twilio", async (original) => ({
  ...(await original<typeof import("@/lib/notify/twilio")>()),
  sendSms: mocks.sms,
}));
vi.mock("@/lib/notify/email", async (original) => ({
  ...(await original<typeof import("@/lib/notify/email")>()),
  sendEmail: mocks.email,
}));
vi.mock("@/lib/crm/backend", async (original) => ({
  ...(await original<typeof import("@/lib/crm/backend")>()),
  recordCrmActivity: mocks.activity,
}));
vi.mock("@/lib/crm/quote-groups", async (original) => ({
  ...(await original<typeof import("@/lib/crm/quote-groups")>()),
  listQuoteVersions: async () => [],
}));
import { sendQuoteToCustomer } from "./public-quote";
function database(status: string) {
  const updates: { table: string; patch: Record<string, unknown> }[] = [];
  const db = {
    from(table: string) {
      let field = "",
        patch: Record<string, unknown> | null = null;
      const builder = {
        select() {
          return builder;
        },
        eq(key: string) {
          field = key;
          return builder;
        },
        order() {
          return builder;
        },
        limit() {
          return builder;
        },
        update(value: Record<string, unknown>) {
          patch = value;
          return builder;
        },
        async maybeSingle() {
          if (table === "crm_quotes" && field === "id")
            return {
              data: {
                id: "q",
                share_token: "existing",
                status,
                quote_total: 200,
                job_id: "j",
                meta: {},
              },
              error: null,
            };
          if (table === "crm_jobs")
            return {
              data: {
                status: "quoted",
                phone: "8055550100",
                email: "sample@example.com",
                customer_name: "Sample",
              },
              error: null,
            };
          return { data: null, error: null };
        },
        then(resolve: (result: { error: null }) => unknown) {
          if (patch) updates.push({ table, patch });
          return Promise.resolve(resolve({ error: null }));
        },
      };
      return builder;
    },
  };
  return {
    db: db as unknown as Parameters<typeof sendQuoteToCustomer>[0],
    updates,
  };
}
describe("mobile contract send preserves business state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sms.mockResolvedValue({ sent: false, error: "Text rejected" });
    mocks.email.mockResolvedValue({ sent: false, error: "Email rejected" });
  });
  it("does not mark a draft sent when all selected providers fail", async () => {
    const { db, updates } = database("draft");
    const result = await sendQuoteToCustomer(db, "q", {
      email: "operator@example.com",
    });
    expect(result.status).toBe("draft");
    expect(updates.some((update) => update.patch.status === "sent")).toBe(
      false,
    );
  });
  it("advances a draft after actual channel acceptance and exposes partial failure", async () => {
    mocks.sms.mockResolvedValue({ sent: true });
    const { db, updates } = database("draft");
    const result = await sendQuoteToCustomer(db, "q", {
      email: "operator@example.com",
    });
    expect(result).toMatchObject({
      status: "sent",
      sms: { sent: true },
      email: { sent: false },
    });
    expect(updates).toContainEqual({
      table: "crm_quotes",
      patch: expect.objectContaining({ status: "sent", sent_via: "sms" }),
    });
  });
  it.each(["sold", "approved", "paid", "archived"])(
    "resending preserves %s status and signature fields",
    async (status) => {
      mocks.sms.mockResolvedValue({ sent: true });
      const { db, updates } = database(status);
      const result = await sendQuoteToCustomer(
        db,
        "q",
        { email: "operator@example.com" },
        { email: false },
      );
      expect(result.status).toBe(status);
      expect(updates.filter((update) => update.table === "crm_quotes")).toEqual(
        [{ table: "crm_quotes", patch: { sent_via: "sms" } }],
      );
    },
  );
  it("rejects changed recipients before either provider is called", async () => {
    const { db } = database("draft");
    await expect(
      sendQuoteToCustomer(
        db,
        "q",
        { email: "operator@example.com" },
        {
          expectedRecipients: {
            email: "different@example.com",
            sms: "8055550100",
          },
        },
      ),
    ).rejects.toThrow("recipient changed");
    expect(mocks.sms).not.toHaveBeenCalled();
    expect(mocks.email).not.toHaveBeenCalled();
  });
});
