export const TRANSCRIPT_SMS_CAMPAIGN_SID = "BU542a67b844388f5192a84c79d6a86cb9";
export const TRANSCRIPT_SMS_CAMPAIGN_STATUS = "draft";
export const DEDICATED_805_MESSAGING_SERVICE_SID = "MG60d4038bf54bffa0690cce85a6e49147";
export const DEDICATED_805_SMS_FROM = "+18055908050";

// Draft campaign status keeps this false. A live secret cannot turn sending on.
export function transcriptSmsSendingEnabled() {
  return TRANSCRIPT_SMS_CAMPAIGN_STATUS === "approved";
}

export function notificationSendable(item, { transcripts = false, other = false } = {}) {
  if (!item || item.purpose === "booking-alert") return false;
  if (item.purpose === "transcript") return transcripts === true;
  return other === true;
}
