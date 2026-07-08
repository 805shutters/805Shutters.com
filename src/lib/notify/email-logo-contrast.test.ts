import { afterEach, describe, expect, it, vi } from "vitest";
import { sendEmail } from "./email";

describe("sendEmail logo contrast", () => {
  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM;
    delete process.env.BOOKING_EMAIL_FROM;
    vi.unstubAllGlobals();
  });

  it("sends the white-letter 805 logo asset instead of the black header logo", async () => {
    process.env.RESEND_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "email-id" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendEmail({
      to: "customer@example.com",
      subject: "Contract",
      html: '<img src="https://www.805shutters.com/brand/805-shutters-logo-header.png" alt="805 Shutters">',
      text: "Contract",
    });

    expect(result).toEqual({ sent: true, id: "email-id" });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(init.body)) as { html: string };
    expect(body.html).toContain("/brand/805-shutters-logo-email-white.png");
    expect(body.html).not.toContain("/brand/805-shutters-logo-header.png");
  });
});
