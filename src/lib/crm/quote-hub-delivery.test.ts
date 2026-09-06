import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deliverHubEmail,
  HubDeliveryRejected,
  type HubDeliveryInput,
} from "./quote-hub-delivery";
const input = (): HubDeliveryInput => ({
  id: "review-123",
  createdAt: new Date().toISOString(),
  to: "customer@example.com",
  subject: "Your project",
  html: '<img src="cid:photo-0">',
  text: "Your project",
  rfcMessageId: "<review-123@805shutters.com>",
  replyToMessageId: "<reply@example.com>",
  attachments: [
    {
      content: Buffer.from("sample-image"),
      contentType: "image/png",
      filename: "photo.png",
    },
  ],
});
describe("805 hub email delivery", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "test-only");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: "provider-123" }), { status: 200 }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });
  it("uses only the 805 sender and embeds photos with matching content IDs", async () => {
    expect(await deliverHubEmail(input())).toBe("provider-123");
    const [url, options] = fetchMock.mock.calls[0];
    const payload = JSON.parse(options.body);
    expect(url).toBe("https://api.resend.com/emails");
    expect(payload.from).toBe("805 Shutters <805@805shutters.com>");
    expect(payload.reply_to).toBe("805@805shutters.com");
    expect(payload.attachments[0]).toMatchObject({
      content_id: "photo-0",
      content_type: "image/png",
      content: Buffer.from("sample-image").toString("base64"),
    });
    expect(payload.headers["In-Reply-To"]).toBe("<reply@example.com>");
  });
  it("reuses an identical provider key and payload after an uncertain response", async () => {
    const reviewed = input();
    fetchMock.mockRejectedValueOnce(new Error("timeout"));
    await expect(deliverHubEmail(reviewed)).rejects.toThrow("timeout");
    await deliverHubEmail(reviewed);
    expect(fetchMock.mock.calls[0][1].headers["Idempotency-Key"]).toBe(
      "quote-hub/review-123",
    );
    expect(fetchMock.mock.calls[1][1].headers).toEqual(
      fetchMock.mock.calls[0][1].headers,
    );
    expect(fetchMock.mock.calls[1][1].body).toBe(
      fetchMock.mock.calls[0][1].body,
    );
  });
  it("refuses an expired retry before contacting the provider", async () => {
    await expect(
      deliverHubEmail({
        ...input(),
        createdAt: new Date(Date.now() - 24 * 3600000).toISOString(),
      }),
    ).rejects.toThrow("too old");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("distinguishes rejection from uncertain server failures", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 422 }));
    await expect(deliverHubEmail(input())).rejects.toBeInstanceOf(
      HubDeliveryRejected,
    );
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 503 }));
    await expect(deliverHubEmail(input())).rejects.not.toBeInstanceOf(
      HubDeliveryRejected,
    );
  });
  it("fails closed when the provider is unavailable or returns no ID", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 200 }));
    await expect(deliverHubEmail(input())).rejects.toThrow("message ID");
    vi.stubEnv("RESEND_API_KEY", "");
    await expect(deliverHubEmail(input())).rejects.toThrow("not configured");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
