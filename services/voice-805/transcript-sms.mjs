export const TRANSCRIPT_SMS_CAMPAIGN_SID = "CMaba6c0b6723563c5a514181126ab706c";
export const TRANSCRIPT_SMS_CAMPAIGN_STATUS = "approved";
export const TRANSCRIPT_SMS_SENDER_REGISTERED = true;
export const DEDICATED_805_MESSAGING_SERVICE_SID = "MG60d4038bf54bffa0690cce85a6e49147";
export const DEDICATED_805_SMS_FROM = "+18055908050";
export const TRANSCRIPT_SMS_LIMIT = 1600;
export const TRANSCRIPT_SMS_FOOTER = "Reply STOP to unsubscribe; HELP for help.";
export const TRANSCRIPT_SHORTENED_NOTICE = "Message shortened; full transcript in CRM Message Center";

// Both carrier approval and this campaign's sender registration need verified
// readback before release. A live secret cannot bypass either gate.
export function transcriptSmsSendingEnabled() {
  return TRANSCRIPT_SMS_CAMPAIGN_STATUS === "approved" && TRANSCRIPT_SMS_SENDER_REGISTERED;
}

export function transcriptNoticeBody(message) {
  const status = message?.confirmed === true ? "" : "UNCONFIRMED. ";
  const head = `805 Shutters message from ${message?.name || "caller"}, ${message?.callback || "callback number not confirmed"}. ${status}`;
  const full = String(message?.text || "");
  const footerTail = ` ${TRANSCRIPT_SMS_FOOTER}`;
  const notice = ` ${TRANSCRIPT_SHORTENED_NOTICE}`;
  const room = TRANSCRIPT_SMS_LIMIT - head.length - footerTail.length;
  const shortened = full.length > Math.max(0, room);
  const text = full.slice(0, Math.max(0, shortened ? room - notice.length : room));
  return `${head}${text}${shortened ? notice : ""}${footerTail}`;
}

export function notificationSendable(item, { transcripts = false, other = false } = {}) {
  if (!item || item.purpose === "booking-alert") return false;
  if (item.purpose === "transcript") return transcripts === true;
  return other === true;
}
