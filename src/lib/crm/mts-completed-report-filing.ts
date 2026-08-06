export const MTS_COMPLETED_REPORT_RECIPIENT = "805shutters@gmail.com";
export const MTS_COMPLETED_REPORT_SENDER = "noreply@mtsinstallationsandrepairs.com";
export const MTS_COMPLETED_REPORT_LABEL = "805/MTS Completed Reports";
export const MTS_COMPLETED_REPORT_GMAIL_QUERY =
  `in:inbox to:${MTS_COMPLETED_REPORT_RECIPIENT} from:${MTS_COMPLETED_REPORT_SENDER} ` +
  'has:attachment (subject:"Complete Report" OR subject:"Service Report")';

export type MtsReportMessage = {
  from: string;
  to: string;
  subject: string;
  body: string;
  attachments: Array<{ filename: string; mimeType: string }>;
};

export type MtsCompletedReportGmailMessage = MtsReportMessage & {
  id: string;
  labelIds: string[];
};

export type MtsCompletedReportGmailClient = {
  listInboxCandidateIds(): Promise<string[]>;
  getMessage(messageId: string): Promise<MtsCompletedReportGmailMessage>;
  ensureLabel(labelName: string): Promise<string>;
  addLabel(messageId: string, labelId: string): Promise<void>;
  removeInbox(messageId: string): Promise<void>;
};

export type MtsCompletedReportFilingResult = {
  scanned: number;
  qualified: number;
  filed: number;
  skipped: number;
};

export type GmailCompletedReportPart = {
  filename?: string;
  mimeType?: string;
  headers?: Array<{ name?: string; value?: string }>;
  body?: { data?: string };
  parts?: GmailCompletedReportPart[];
};

export type GmailCompletedReportApiMessage = {
  id?: string;
  labelIds?: string[];
  snippet?: string;
  payload?: GmailCompletedReportPart;
};

const LEGACY_COMPLETED_REPORT_SUBJECT = /^MTS Installations(?:\s*&\s*Repairs)? Service Report\s+-\s+COMPLETE$/i;
const CURRENT_COMPLETED_REPORT_SUBJECT = /^.+\s+-\s+Complete Report$/i;
const COMPLETION_SIGNAL = /\bjob\s+complete\b|\bwork\s+reported\s+complete\b/i;
const REJECTED_SUBJECT_SIGNAL = /\b(?:incomplete|scheduled)\b/i;
const REJECTED_BODY_STATUS = /(?:^|\n)\s*(?:job\s+)?(?:incomplete|scheduled)\b/im;
const CURRENT_COMPLETED_REPORT_PDF = /(?:^|[\s_-])complete(?:d)?[\s_-]+service[\s_-]+report(?:[^/]*)\.pdf$/i;
const LEGACY_SERVICE_REPORT_PDF = /(?:^|[\s_-])service[\s_-]+report(?:[^/]*)\.pdf$/i;

function normalizedAddress(header: string): string | null {
  const value = header.trim();
  const displayAddress = value.match(/^[^<>\r\n]+<\s*([^<>\s]+)\s*>$/);
  const address = displayAddress?.[1] ?? (/^[^<>\s]+$/.test(value) ? value : null);

  return address?.toLowerCase() ?? null;
}

function gmailHeader(part: GmailCompletedReportPart | undefined, name: string) {
  return part?.headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value || "";
}

function gmailParts(part: GmailCompletedReportPart | undefined, output: GmailCompletedReportPart[] = []) {
  if (!part) return output;
  output.push(part);
  for (const child of part.parts || []) gmailParts(child, output);
  return output;
}

function decodeGmailBody(value?: string) {
  if (!value) return "";
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
}

export function gmailMessageToCompletedReport(message: GmailCompletedReportApiMessage): MtsCompletedReportGmailMessage {
  if (!message.id) throw new Error("Gmail completed-report response did not include a message id.");
  const parts = gmailParts(message.payload);
  const decodedBody = parts
    .filter((part) => part.mimeType?.startsWith("text/") && part.body?.data)
    .map((part) => decodeGmailBody(part.body?.data))
    .join("\n");

  return {
    id: message.id,
    labelIds: message.labelIds || [],
    from: gmailHeader(message.payload, "From"),
    to: gmailHeader(message.payload, "To"),
    subject: gmailHeader(message.payload, "Subject"),
    body: [message.snippet || "", decodedBody].filter(Boolean).join("\n"),
    attachments: parts
      .filter((part) => part.filename)
      .map((part) => ({ filename: part.filename || "", mimeType: part.mimeType || "" })),
  };
}

export function isCompletedMtsReport(message: MtsReportMessage): boolean {
  if (normalizedAddress(message.from) !== MTS_COMPLETED_REPORT_SENDER) return false;
  if (normalizedAddress(message.to) !== MTS_COMPLETED_REPORT_RECIPIENT) return false;

  const currentSubject = CURRENT_COMPLETED_REPORT_SUBJECT.test(message.subject);
  const legacySubject = LEGACY_COMPLETED_REPORT_SUBJECT.test(message.subject);
  if ((!currentSubject && !legacySubject) || REJECTED_SUBJECT_SIGNAL.test(message.subject)) return false;

  if (REJECTED_BODY_STATUS.test(message.body) || !COMPLETION_SIGNAL.test(message.body)) return false;

  return message.attachments.some(({ filename, mimeType }) => {
    if (mimeType.toLowerCase() !== "application/pdf" || REJECTED_SUBJECT_SIGNAL.test(filename)) return false;
    return currentSubject
      ? CURRENT_COMPLETED_REPORT_PDF.test(filename)
      : LEGACY_SERVICE_REPORT_PDF.test(filename);
  });
}

export async function fileCompletedMtsReports(
  gmail: MtsCompletedReportGmailClient
): Promise<MtsCompletedReportFilingResult> {
  const messageIds = await gmail.listInboxCandidateIds();
  const result: MtsCompletedReportFilingResult = {
    scanned: messageIds.length,
    qualified: 0,
    filed: 0,
    skipped: 0,
  };
  let labelId: string | null = null;

  for (const messageId of messageIds) {
    const message = await gmail.getMessage(messageId);
    if (!isCompletedMtsReport(message)) {
      result.skipped += 1;
      continue;
    }

    result.qualified += 1;
    labelId ||= await gmail.ensureLabel(MTS_COMPLETED_REPORT_LABEL);
    await gmail.addLabel(messageId, labelId);

    const labeled = await gmail.getMessage(messageId);
    if (!labeled.labelIds.includes(labelId)) {
      throw new Error(`MTS completed report ${messageId} filing label was not verified.`);
    }

    await gmail.removeInbox(messageId);

    const filed = await gmail.getMessage(messageId);
    if (!filed.labelIds.includes(labelId) || filed.labelIds.includes("INBOX")) {
      throw new Error(`MTS completed report ${messageId} archive state was not verified.`);
    }

    result.filed += 1;
  }

  return result;
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export function gmailScopeAllowsModify(scope: string) {
  const scopes = new Set(scope.split(/\s+/).filter(Boolean));
  return scopes.has("https://www.googleapis.com/auth/gmail.modify") || scopes.has("https://mail.google.com/");
}

export async function verifyGmailModifyAccessToken(accessToken: string, fetchImpl: FetchLike = fetch) {
  const params = new URLSearchParams({ access_token: accessToken });
  const response = await fetchImpl(`https://oauth2.googleapis.com/tokeninfo?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  const data = (await response.json().catch(() => null)) as { scope?: string; error_description?: string } | null;
  if (!response.ok) {
    throw new Error(data?.error_description || `805 Gmail scope verification failed with ${response.status}.`);
  }
  if (!gmailScopeAllowsModify(data?.scope || "")) {
    throw new Error("805 Gmail token does not include the gmail.modify scope required to label and archive reports.");
  }
}

async function gmailJson<T>(accessToken: string, path: string, fetchImpl: FetchLike, init?: RequestInit) {
  const response = await fetchImpl(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`Gmail completed-report request failed with ${response.status}: ${await response.text()}`);
  }
  return (await response.json().catch(() => ({}))) as T;
}

export function createMtsCompletedReportGmailClient(
  accessToken: string,
  fetchImpl: FetchLike = fetch
): MtsCompletedReportGmailClient {
  return {
    async listInboxCandidateIds() {
      const ids: string[] = [];
      let pageToken: string | undefined;
      do {
        const params = new URLSearchParams({ q: MTS_COMPLETED_REPORT_GMAIL_QUERY, maxResults: "100" });
        if (pageToken) params.set("pageToken", pageToken);
        const page = await gmailJson<{
          messages?: Array<{ id?: string }>;
          nextPageToken?: string;
        }>(accessToken, `messages?${params.toString()}`, fetchImpl);
        ids.push(...(page.messages || []).map((message) => message.id || "").filter(Boolean));
        pageToken = page.nextPageToken;
      } while (pageToken);
      return ids;
    },

    async getMessage(messageId) {
      const params = new URLSearchParams({ format: "full" });
      const message = await gmailJson<GmailCompletedReportApiMessage>(
        accessToken,
        `messages/${encodeURIComponent(messageId)}?${params.toString()}`,
        fetchImpl
      );
      return gmailMessageToCompletedReport(message);
    },

    async ensureLabel(labelName) {
      const list = await gmailJson<{ labels?: Array<{ id?: string; name?: string }> }>(
        accessToken,
        "labels",
        fetchImpl
      );
      const existing = list.labels?.find((label) => label.name === labelName);
      if (existing?.id) return existing.id;

      const created = await gmailJson<{ id?: string }>(accessToken, "labels", fetchImpl, {
        method: "POST",
        body: JSON.stringify({
          name: labelName,
          labelListVisibility: "labelShow",
          messageListVisibility: "show",
        }),
      });
      if (!created.id) throw new Error("Gmail did not return an id for the MTS completed-report label.");
      return created.id;
    },

    async addLabel(messageId, labelId) {
      await gmailJson<Record<string, unknown>>(
        accessToken,
        `messages/${encodeURIComponent(messageId)}/modify`,
        fetchImpl,
        { method: "POST", body: JSON.stringify({ addLabelIds: [labelId] }) }
      );
    },

    async removeInbox(messageId) {
      await gmailJson<Record<string, unknown>>(
        accessToken,
        `messages/${encodeURIComponent(messageId)}/modify`,
        fetchImpl,
        { method: "POST", body: JSON.stringify({ removeLabelIds: ["INBOX"] }) }
      );
    },
  };
}
