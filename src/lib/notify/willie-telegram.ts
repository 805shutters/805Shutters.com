import { feedbackCallbackData, type FeedbackApprovalType } from "@/lib/crm/feedback-workflow";

type WillieResult = { sent: boolean; messageId?: number; skipped?: string; error?: string };

export function isWillieTelegramConfigured() {
  return Boolean(
    process.env.WILLIE_TELEGRAM_BOT_TOKEN?.trim() &&
    process.env.WILLIE_TELEGRAM_CHAT_ID?.trim()
  );
}

export async function sendWillieFeedbackApproval(input: {
  id: string;
  revision: number;
  type: FeedbackApprovalType;
  title: string;
  summary: string;
}): Promise<WillieResult> {
  const token = process.env.WILLIE_TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.WILLIE_TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) return { sent: false, skipped: "Willie Telegram is not configured" };

  const actionLabel = input.type === "implementation"
    ? "Approve implementation"
    : "Approve push / deployment";
  const text = [
    `Jessica CRM request ready: ${input.title}`,
    `Topic: ${input.id}`,
    `Revision: ${input.revision}`,
    "",
    input.summary.slice(0, 3000),
    "",
    `Use the topic-specific button below to ${actionLabel.toLowerCase()}.`
  ].join("\n");

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [[{
            text: actionLabel,
            callback_data: feedbackCallbackData(input.id, input.revision, input.type)
          }]]
        }
      })
    });
    const body = await response.json().catch(() => ({})) as {
      ok?: boolean;
      description?: string;
      result?: { message_id?: number };
    };
    if (!response.ok || !body.ok) {
      return { sent: false, error: body.description || `Telegram error ${response.status}` };
    }
    return { sent: true, messageId: body.result?.message_id };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : "Willie Telegram failed" };
  }
}

export async function answerWillieCallback(callbackQueryId: string, text: string) {
  const token = process.env.WILLIE_TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text, show_alert: true })
  }).catch(() => undefined);
}
