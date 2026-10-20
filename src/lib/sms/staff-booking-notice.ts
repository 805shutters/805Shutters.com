/** Public copy for the staff-only consultation alert program. Not a consent record. */
export const SMS_OPT_IN_NO_SHARING_STATEMENT =
  "We do not sell or share your SMS opt-in data or personal information with third parties for marketing purposes";

export const STAFF_BOOKING_SMS_PATH = "/staff-booking-sms/";

/** Exact ending of every agent staff booking text. Campaign samples must use this string. */
export const AGENT_STAFF_SMS_FOOTER = "Reply STOP to unsubscribe; HELP for help.";

export const staffBookingSmsNotice = {
  legalName: "SNS Interiors dba 805 Shutters",
  program: "staff-only confirmed consultation alerts",
  frequency: "Message frequency varies.",
  rates: "Message and data rates may apply.",
  email: "805@805shutters.com",
  phoneDisplay: "805-590-8050",
  phoneHref: "tel:+18055908050",
  carrierNotice: "Carriers are not liable for delayed or undelivered messages.",
  enrollment: "Enrollment in these staff alerts requires consent from the staff recipient.",
} as const;
