import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isTelegramConfigured, sendTelegramMessage } from "./telegram";

describe("telegram notification guards", () => {
  beforeEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("skips when Telegram is not configured", async () => {
    await expect(sendTelegramMessage({ text: "hello" })).resolves.toEqual({
      sent: false,
      skipped: "telegram not configured",
    });
    expect(isTelegramConfigured()).toBe(false);
  });

  it("sends a message when token and chat are configured", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.TELEGRAM_CHAT_ID = "12345";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 42 } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendTelegramMessage({ text: "site visitor" })).resolves.toEqual({
      sent: true,
      messageId: 42,
    });
    expect(isTelegramConfigured()).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("https://api.telegram.org/bottest-token/sendMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: "12345",
        text: "site visitor",
        disable_web_page_preview: true,
      }),
    });
  });
});
