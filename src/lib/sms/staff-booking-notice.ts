/** Public copy for the staff-only consultation alert program. Not a consent record. */
export const SMS_OPT_IN_NO_SHARING_STATEMENT =
  "We do not sell or share your SMS opt-in data or personal information with third parties for marketing purposes";

export const STAFF_BOOKING_SMS_PATH = "/terms/";
export const TRANSCRIPT_SMS_CAMPAIGN_SID = "BU542a67b844388f5192a84c79d6a86cb9";
export const TRANSCRIPT_SMS_CAMPAIGN_STATUS = "draft";

/** Caller-message transcript texts stay queued until this campaign is approved outside the repo. */
export function transcriptSmsSendingEnabled() {
  return false;
}

/** Exact ending of every agent staff booking text. Campaign samples must use this string. */
export const AGENT_STAFF_SMS_FOOTER = "Reply STOP to unsubscribe; HELP for help.";

export const staffBookingSmsNotice = {
  legalName: "SNS Interiors dba 805 Shutters",
  program: "staff notices of caller message transcripts",
  frequency: "Message frequency varies.",
  rates: "Message and data rates may apply.",
  email: "805@805shutters.com",
  phoneDisplay: "805-590-8050",
  phoneHref: "tel:+18055908050",
  carrierNotice: "Carriers are not liable for delayed or undelivered messages.",
  enrollment: "These notices go only to 805 Shutters staff who have verbally agreed to receive them.",
} as const;
