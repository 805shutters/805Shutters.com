import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  MTS_COMPLETED_REPORT_LABEL,
  MTS_COMPLETED_REPORT_GMAIL_QUERY,
  fileCompletedMtsReports,
  gmailScopeAllowsModify,
  gmailMessageToCompletedReport,
  isCompletedMtsReport,
  type MtsCompletedReportGmailClient,
  type MtsCompletedReportGmailMessage,
} from "@/lib/crm/mts-completed-report-filing";

type MtsReportMessage = Parameters<typeof isCompletedMtsReport>[0];

function completedReport(overrides: Partial<MtsReportMessage> = {}): MtsReportMessage {
  return {
    from: "MTS Installations & Repairs <noreply@mtsinstallationsandrepairs.com>",
    to: "805 Shutters <805shutters@gmail.com>",
    subject: "Victoria Norman - Complete Report",
    body: "The installation is finished. Job complete.",
    attachments: [{ filename: "Victoria_Norman_complete_service_report.pdf", mimeType: "application/pdf" }],
    ...overrides,
  };
}

describe("isCompletedMtsReport", () => {
  it("accepts the current customer complete-report format", () => {
    expect(isCompletedMtsReport(completedReport())).toBe(true);
  });

  it("accepts the known legacy completed-service-report format", () => {
    expect(isCompletedMtsReport(completedReport({
      from: "noreply@mtsinstallationsandrepairs.com",
      to: "805shutters@gmail.com",
      subject: "MTS Installations & Repairs Service Report - COMPLETE",
      body: "Service Report\nCOMPLETE\nWork reported complete",
      attachments: [{ filename: "service-report-4623-5900.pdf", mimeType: "application/pdf" }],
    }))).toBe(true);
  });

  it("rejects a scheduled report", () => {
    expect(isCompletedMtsReport(completedReport({
      subject: "Victoria Norman - Scheduled Report",
      body: "Job scheduled for August 12, 2026.",
    }))).toBe(false);
  });

  it("rejects an incomplete report", () => {
    expect(isCompletedMtsReport(completedReport({
      subject: "Victoria Norman - Incomplete Report",
      body: "Incomplete: return visit required before the job is complete.",
    }))).toBe(false);
  });

  it("rejects a report from the wrong sender", () => {
    expect(isCompletedMtsReport(completedReport({
      from: "MTS Installations & Repairs <dispatch@example.com>",
    }))).toBe(false);
  });

  it("rejects a report sent to the wrong recipient", () => {
    expect(isCompletedMtsReport(completedReport({
      to: "office@example.com",
    }))).toBe(false);
  });

  it("rejects a complete-report subject without a completion signal", () => {
    expect(isCompletedMtsReport(completedReport({
      body: "Service report attached for review.",
    }))).toBe(false);
  });

  it("rejects a completed report without a completed-service-report PDF", () => {
    expect(isCompletedMtsReport(completedReport({
      attachments: [
        { filename: "completed-service-report.txt", mimeType: "text/plain" },
        { filename: "site-photo.jpg", mimeType: "image/jpeg" },
      ],
    }))).toBe(false);
  });

  it("rejects negated completion text", () => {
    expect(isCompletedMtsReport(completedReport({
      body: "Job not complete. A return visit is required.",
    }))).toBe(false);
  });

  it("rejects an incomplete-service-report attachment", () => {
    expect(isCompletedMtsReport(completedReport({
      attachments: [{ filename: "Victoria_Norman_incomplete_service_report.pdf", mimeType: "application/pdf" }],
    }))).toBe(false);
  });

  it("requires the completed service report attachment to be a PDF MIME part", () => {
    expect(isCompletedMtsReport(completedReport({
      attachments: [{ filename: "Victoria_Norman_complete_service_report.pdf", mimeType: "text/plain" }],
    }))).toBe(false);
  });
});

function gmailMessage(overrides: Partial<MtsCompletedReportGmailMessage> = {}): MtsCompletedReportGmailMessage {
  return {
    id: "gmail-complete-1",
    labelIds: ["INBOX"],
    ...completedReport(),
    ...overrides,
  };
}

function fakeGmail(initialMessages: MtsCompletedReportGmailMessage[]) {
  const messages = new Map(initialMessages.map((message) => [message.id, structuredClone(message)]));
  const operations: string[] = [];
  let failLabel = false;
  let failArchive = false;

  const client: MtsCompletedReportGmailClient = {
    async listInboxCandidateIds() {
      operations.push("list");
      return [...messages.values()].filter((message) => message.labelIds.includes("INBOX")).map((message) => message.id);
    },
    async getMessage(messageId) {
      operations.push(`get:${messageId}`);
      const message = messages.get(messageId);
      if (!message) throw new Error("missing message");
      return structuredClone(message);
    },
    async ensureLabel(labelName) {
      operations.push(`ensure:${labelName}`);
      return "Label_805_MTS_Completed";
    },
    async addLabel(messageId, labelId) {
      operations.push(`label:${messageId}:${labelId}`);
      if (failLabel) throw new Error("label failed");
      const message = messages.get(messageId);
      if (message && !message.labelIds.includes(labelId)) message.labelIds.push(labelId);
    },
    async removeInbox(messageId) {
      operations.push(`archive:${messageId}`);
      if (failArchive) throw new Error("archive failed");
      const message = messages.get(messageId);
      if (message) message.labelIds = message.labelIds.filter((labelId) => labelId !== "INBOX");
    },
  };

  return {
    client,
    messages,
    operations,
    setFailLabel(value: boolean) {
      failLabel = value;
    },
    setFailArchive(value: boolean) {
      failArchive = value;
    },
  };
}

describe("fileCompletedMtsReports", () => {
  it("verifies the filing label before archive and verifies the final Gmail state", async () => {
    const gmail = fakeGmail([gmailMessage()]);

    const result = await fileCompletedMtsReports(gmail.client);

    expect(result).toEqual({ scanned: 1, qualified: 1, filed: 1, skipped: 0 });
    expect(gmail.operations).toEqual([
      "list",
      "get:gmail-complete-1",
      `ensure:${MTS_COMPLETED_REPORT_LABEL}`,
      "label:gmail-complete-1:Label_805_MTS_Completed",
      "get:gmail-complete-1",
      "archive:gmail-complete-1",
      "get:gmail-complete-1",
    ]);
    expect(gmail.messages.get("gmail-complete-1")?.labelIds).toEqual(["Label_805_MTS_Completed"]);
  });

  it("does not mutate a shortlisted message that fails closed", async () => {
    const gmail = fakeGmail([gmailMessage({ subject: "Victoria Norman - Incomplete Report" })]);

    const result = await fileCompletedMtsReports(gmail.client);

    expect(result).toEqual({ scanned: 1, qualified: 0, filed: 0, skipped: 1 });
    expect(gmail.operations).toEqual(["list", "get:gmail-complete-1"]);
  });

  it("never archives when applying the filing label fails", async () => {
    const gmail = fakeGmail([gmailMessage()]);
    gmail.setFailLabel(true);

    await expect(fileCompletedMtsReports(gmail.client)).rejects.toThrow("label failed");

    expect(gmail.operations).not.toContain("archive:gmail-complete-1");
    expect(gmail.messages.get("gmail-complete-1")?.labelIds).toContain("INBOX");
  });

  it("leaves a labeled inbox message retryable when archive fails", async () => {
    const gmail = fakeGmail([gmailMessage()]);
    gmail.setFailArchive(true);

    await expect(fileCompletedMtsReports(gmail.client)).rejects.toThrow("archive failed");
    expect(gmail.messages.get("gmail-complete-1")?.labelIds).toEqual(["INBOX", "Label_805_MTS_Completed"]);

    gmail.setFailArchive(false);
    const retry = await fileCompletedMtsReports(gmail.client);

    expect(retry.filed).toBe(1);
    expect(gmail.messages.get("gmail-complete-1")?.labelIds).toEqual(["Label_805_MTS_Completed"]);
  });

  it("does not archive when label verification fails", async () => {
    const gmail = fakeGmail([gmailMessage()]);
    gmail.client.addLabel = async (messageId, labelId) => {
      gmail.operations.push(`label:${messageId}:${labelId}`);
    };

    await expect(fileCompletedMtsReports(gmail.client)).rejects.toThrow("filing label was not verified");

    expect(gmail.operations).not.toContain("archive:gmail-complete-1");
  });

  it("fails the run when the final archived state cannot be verified", async () => {
    const gmail = fakeGmail([gmailMessage()]);
    gmail.client.removeInbox = async (messageId) => {
      gmail.operations.push(`archive:${messageId}`);
    };

    await expect(fileCompletedMtsReports(gmail.client)).rejects.toThrow("archive state was not verified");
  });
});

describe("Gmail completed-report adapter", () => {
  it("shortlists only inbox mail from the exact MTS sender to the exact 805 mailbox", () => {
    expect(MTS_COMPLETED_REPORT_GMAIL_QUERY).toContain("in:inbox");
    expect(MTS_COMPLETED_REPORT_GMAIL_QUERY).toContain("to:805shutters@gmail.com");
    expect(MTS_COMPLETED_REPORT_GMAIL_QUERY).toContain("from:noreply@mtsinstallationsandrepairs.com");
    expect(MTS_COMPLETED_REPORT_GMAIL_QUERY).toContain("has:attachment");
    expect(MTS_COMPLETED_REPORT_GMAIL_QUERY).toContain('subject:"Complete Report"');
  });

  it("maps Gmail headers, nested text, labels, and attachment names into the fail-closed matcher", () => {
    const message = gmailMessageToCompletedReport({
      id: "gmail-live-1",
      labelIds: ["INBOX", "CATEGORY_UPDATES"],
      snippet: "Job complete: Michelle Saucedo.",
      payload: {
        headers: [
          { name: "From", value: "MTS Installations <noreply@mtsinstallationsandrepairs.com>" },
          { name: "To", value: "805shutters@gmail.com" },
          { name: "Subject", value: "Michelle Saucedo - Complete Report" },
        ],
        parts: [
          { mimeType: "text/plain", body: { data: "V29yayByZXBvcnRlZCBjb21wbGV0ZQ" } },
          { filename: "Michelle_Saucedo_complete_service_report.pdf", mimeType: "application/pdf", body: {} },
        ],
      },
    });

    expect(message).toMatchObject({
      id: "gmail-live-1",
      from: "MTS Installations <noreply@mtsinstallationsandrepairs.com>",
      to: "805shutters@gmail.com",
      subject: "Michelle Saucedo - Complete Report",
      labelIds: ["INBOX", "CATEGORY_UPDATES"],
      attachments: [{ filename: "Michelle_Saucedo_complete_service_report.pdf", mimeType: "application/pdf" }],
    });
    expect(message.body).toContain("Work reported complete");
    expect(isCompletedMtsReport(message)).toBe(true);
  });

  it("distinguishes Gmail modify scope from read-only access", () => {
    expect(gmailScopeAllowsModify("openid https://www.googleapis.com/auth/gmail.modify email")).toBe(true);
    expect(gmailScopeAllowsModify("https://mail.google.com/")).toBe(true);
    expect(gmailScopeAllowsModify("https://www.googleapis.com/auth/gmail.readonly")).toBe(false);
  });
});

describe("MTS completed-report production schedule", () => {
  it("runs as a distinct protected job every ten minutes against the canonical 805 site", () => {
    const workflow = readFileSync(
      resolve(process.cwd(), ".github/workflows/mts-completed-report-filing.yml"),
      "utf8"
    );

    expect(workflow).toContain('cron: "*/10 * * * *"');
    expect(workflow).toContain("group: mts-completed-report-filing");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("timeout-minutes: 5");
    expect(workflow).toContain("secrets.CRON_SECRET");
    expect(workflow).toContain("--connect-timeout 15");
    expect(workflow).toContain("--max-time 120");
    expect(workflow).toContain("MTS_COMPLETED_REPORT_CRON_SECRET");
    expect(workflow).toContain("https://www.805shutters.com/api/cron/mts-completed-reports/");
  });
});
