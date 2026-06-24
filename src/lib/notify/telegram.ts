// Telegram helper for internal alerts. Env-gated and NEVER throws so a failed
// alert cannot affect the public website.
//
// Env: TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID. When unset, sends are skipped.

export type TelegramResult = {
  sent: boolean;
  skipped?: string;
  error?: string;
  messageId?: number;
};

type TelegramSendResponse = {
  ok?: boolean;
  description?: string;
  result?: {
    message_id?: number;
  };
};

const maxTelegramMessageLength = 3900;

export function isTelegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim() && process.env.TELEGRAM_CHAT_ID?.trim());
}

export async function sendTelegramMessage(input: { text: string; chatId?: string }): Promise<TelegramResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = input.chatId?.trim() || process.env.TELEGRAM_CHAT_ID?.trim();
  const text = truncateTelegramMessage(input.text.trim());

  if (!text) return { sent: false, skipped: "empty telegram message" };
  if (!token || !chatId) return { sent: false, skipped: "telegram not configured" };

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as TelegramSendResponse;
    if (!response.ok || !data.ok) {
      console.warn("Telegram send failed:", data.description || response.status);
      return { sent: false, error: data.description || `Telegram error ${response.status}` };
    }
    return { sent: true, messageId: data.result?.message_id };
  } catch (error) {
    console.warn("Telegram send threw:", error);
    return { sent: false, error: error instanceof Error ? error.message : "telegram send failed" };
  }
}

function truncateTelegramMessage(text: string) {
  if (text.length <= maxTelegramMessageLength) return text;
  return `${text.slice(0, maxTelegramMessageLength - 3)}...`;
}
