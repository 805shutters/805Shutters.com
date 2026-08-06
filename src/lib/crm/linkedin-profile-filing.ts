import type {
  MtsCompletedReportGmailClient,
  MtsCompletedReportGmailMessage,
} from "@/lib/crm/mts-completed-report-filing";

export const LINKEDIN_PROFILE_SENDER = "messages-noreply@linkedin.com";
export const LINKEDIN_PROFILE_RECIPIENT = "805shutters@gmail.com";
export const LINKEDIN_PROFILE_ARCHIVE_LABEL = "805/LinkedIn Profiles Archived";
export const LINKEDIN_PROFILE_GMAIL_QUERY =
  `in:inbox to:${LINKEDIN_PROFILE_RECIPIENT} from:${LINKEDIN_PROFILE_SENDER}`;

export type LinkedInProfileDecision = "retain" | "archive";

export type LinkedInProfileFilingResult = {
  scanned: number;
  recognized: number;
  retained: number;
  filed: number;
  skipped: number;
};

function normalizedAddress(header: string): string | null {
  const value = header.trim();
  const displayAddress = value.match(/^[^<>\r\n]+<\s*([^<>\s]+)\s*>$/);
  const address = displayAddress?.[1] ?? (/^[^<>\s]+$/.test(value) ? value : null);
  return address?.toLowerCase() ?? null;
}

function recommendationContent(body: string) {
  const footerMarkers = ["Get the new LinkedIn desktop app", "This email was intended for"];
  const lowerBody = body.toLowerCase();
  const footerIndex = footerMarkers
    .map((marker) => lowerBody.indexOf(marker.toLowerCase()))
    .filter((index) => index >= 0)
    .reduce((earliest, index) => Math.min(earliest, index), body.length);
  return body.slice(0, footerIndex);
}

export function classifyLinkedInProfileEmail(
  message: Pick<MtsCompletedReportGmailMessage, "from" | "to" | "subject" | "body">
): LinkedInProfileDecision | null {
  if (normalizedAddress(message.from) !== LINKEDIN_PROFILE_SENDER) return null;
  if (normalizedAddress(message.to) !== LINKEDIN_PROFILE_RECIPIENT) return null;
  if (!message.body.trim()) return null;
  if (!/email_pymk_02/i.test(message.body)) return null;
  if (!/https:\/\/www\.linkedin\.com\/comm\/in\//i.test(message.body)) return null;
  if (!/You are receiving People You May Know notification emails\./i.test(message.body)) return null;

  const relevanceText = `${message.subject}\n${recommendationContent(message.body)}`;
  return /\bshutters\b/i.test(relevanceText) ? "retain" : "archive";
}

export async function fileLinkedInProfileEmails(
  gmail: MtsCompletedReportGmailClient
): Promise<LinkedInProfileFilingResult> {
  const messageIds = await gmail.listInboxCandidateIds();
  const result: LinkedInProfileFilingResult = {
    scanned: messageIds.length,
    recognized: 0,
    retained: 0,
    filed: 0,
    skipped: 0,
  };
  let labelId: string | null = null;

  for (const messageId of messageIds) {
    const message = await gmail.getMessage(messageId);
    const decision = classifyLinkedInProfileEmail(message);
    if (!decision) {
      result.skipped += 1;
      continue;
    }

    result.recognized += 1;
    if (decision === "retain") {
      result.retained += 1;
      continue;
    }

    labelId ||= await gmail.ensureLabel(LINKEDIN_PROFILE_ARCHIVE_LABEL);
    await gmail.addLabel(messageId, labelId);

    const labeled = await gmail.getMessage(messageId);
    if (!labeled.labelIds.includes(labelId)) {
      throw new Error(`LinkedIn profile email ${messageId} filing label was not verified.`);
    }

    await gmail.removeInbox(messageId);

    const filed = await gmail.getMessage(messageId);
    if (!filed.labelIds.includes(labelId) || filed.labelIds.includes("INBOX")) {
      throw new Error(`LinkedIn profile email ${messageId} archive state was not verified.`);
    }

    result.filed += 1;
  }

  return result;
}
