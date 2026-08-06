import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  LINKEDIN_PROFILE_ARCHIVE_LABEL,
  LINKEDIN_PROFILE_GMAIL_QUERY,
  classifyLinkedInProfileEmail,
  fileLinkedInProfileEmails,
} from "@/lib/crm/linkedin-profile-filing";
import type {
  MtsCompletedReportGmailClient,
  MtsCompletedReportGmailMessage,
} from "@/lib/crm/mts-completed-report-filing";

function profileEmail(overrides: Partial<MtsCompletedReportGmailMessage> = {}): MtsCompletedReportGmailMessage {
  return {
    id: "linkedin-profile-1",
    labelIds: ["INBOX"],
    from: "LinkedIn <messages-noreply@linkedin.com>",
    to: "Kenneth Hill <805shutters@gmail.com>",
    subject: "Add Jesse Acosta III - Business Owner",
    body: [
      "email_pymk_02",
      "Do you know Jesse?",
      "https://www.linkedin.com/comm/in/jesseacostahvac",
      "Business Owner at Acosta Heating and Air Conditioning",
      "Get the new LinkedIn desktop app",
      "This email was intended for Kenneth Hill (Owner at 805 Shutters)",
      "You are receiving People You May Know notification emails.",
    ].join("\n"),
    attachments: [],
    ...overrides,
  };
}

describe("classifyLinkedInProfileEmail", () => {
  it("archives a recognized profile recommendation without shutters in its content", () => {
    expect(classifyLinkedInProfileEmail(profileEmail())).toBe("archive");
  });

  it("retains a recognized profile recommendation with shutters in the subject", () => {
    expect(classifyLinkedInProfileEmail(profileEmail({
      subject: "Add Jamie - Owner at Coastal Shutters",
    }))).toBe("retain");
  });

  it("retains a recognized profile recommendation with mixed-case shutters in recommendation content", () => {
    expect(classifyLinkedInProfileEmail(profileEmail({
      body: profileEmail().body.replace("Business Owner at Acosta Heating and Air Conditioning", "Owner at Ventura SHUTTERS"),
    }))).toBe("retain");
  });

  it("does not count the standard 805 Shutters account footer as recommendation relevance", () => {
    expect(classifyLinkedInProfileEmail(profileEmail())).toBe("archive");
  });

  it("requires shutters as a whole word", () => {
    expect(classifyLinkedInProfileEmail(profileEmail({ subject: "A Shutterstock profile" }))).toBe("archive");
  });

  it.each([
    ["wrong sender", { from: "LinkedIn <updates-noreply@linkedin.com>" }],
    ["wrong recipient", { to: "office@example.com" }],
    ["missing template marker", { body: profileEmail().body.replace("email_pymk_02", "email_digest") }],
    ["missing profile link", { body: profileEmail().body.replace("https://www.linkedin.com/comm/in/jesseacostahvac", "https://www.linkedin.com/comm/feed/") }],
    ["missing profile subscription footer", { body: profileEmail().body.replace("You are receiving People You May Know notification emails.", "LinkedIn updates") }],
    ["unreadable body", { body: "" }],
  ])("fails safe for %s", (_name, overrides) => {
    expect(classifyLinkedInProfileEmail(profileEmail(overrides))).toBeNull();
  });
});

function fakeGmail(initialMessages: MtsCompletedReportGmailMessage[]) {
  const messages = new Map(initialMessages.map((message) => [message.id, structuredClone(message)]));
  const operations: string[] = [];
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
      return "Label_805_LinkedIn_Profiles_Archived";
    },
    async addLabel(messageId, labelId) {
      operations.push(`label:${messageId}:${labelId}`);
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
    setFailArchive(value: boolean) {
      failArchive = value;
    },
  };
}

describe("fileLinkedInProfileEmails", () => {
  it("labels, verifies, archives, and verifies an irrelevant profile email", async () => {
    const gmail = fakeGmail([profileEmail()]);

    const result = await fileLinkedInProfileEmails(gmail.client);

    expect(result).toEqual({ scanned: 1, recognized: 1, retained: 0, filed: 1, skipped: 0 });
    expect(gmail.operations).toEqual([
      "list",
      "get:linkedin-profile-1",
      `ensure:${LINKEDIN_PROFILE_ARCHIVE_LABEL}`,
      "label:linkedin-profile-1:Label_805_LinkedIn_Profiles_Archived",
      "get:linkedin-profile-1",
      "archive:linkedin-profile-1",
      "get:linkedin-profile-1",
    ]);
    expect(gmail.messages.get("linkedin-profile-1")?.labelIds).toEqual(["Label_805_LinkedIn_Profiles_Archived"]);
  });

  it("leaves shutter-related and unrecognized messages untouched", async () => {
    const gmail = fakeGmail([
      profileEmail({ id: "linkedin-relevant", subject: "Owner at Valley Shutters" }),
      profileEmail({ id: "linkedin-update", from: "updates-noreply@linkedin.com" }),
    ]);

    const result = await fileLinkedInProfileEmails(gmail.client);

    expect(result).toEqual({ scanned: 2, recognized: 1, retained: 1, filed: 0, skipped: 1 });
    expect(gmail.operations.filter((operation) => operation.startsWith("label:") || operation.startsWith("archive:"))).toEqual([]);
  });

  it("retries a labeled inbox message after an archive failure", async () => {
    const gmail = fakeGmail([profileEmail()]);
    gmail.setFailArchive(true);

    await expect(fileLinkedInProfileEmails(gmail.client)).rejects.toThrow("archive failed");
    expect(gmail.messages.get("linkedin-profile-1")?.labelIds).toEqual([
      "INBOX",
      "Label_805_LinkedIn_Profiles_Archived",
    ]);

    gmail.setFailArchive(false);
    await expect(fileLinkedInProfileEmails(gmail.client)).resolves.toMatchObject({ filed: 1 });
  });

  it("never archives when label verification fails", async () => {
    const gmail = fakeGmail([profileEmail()]);
    gmail.client.addLabel = async (messageId, labelId) => {
      gmail.operations.push(`label:${messageId}:${labelId}`);
    };

    await expect(fileLinkedInProfileEmails(gmail.client)).rejects.toThrow("filing label was not verified");
    expect(gmail.operations.some((operation) => operation.startsWith("archive:"))).toBe(false);
  });

  it("fails when the final archive state cannot be verified", async () => {
    const gmail = fakeGmail([profileEmail()]);
    gmail.client.removeInbox = async (messageId) => {
      gmail.operations.push(`archive:${messageId}`);
    };

    await expect(fileLinkedInProfileEmails(gmail.client)).rejects.toThrow("archive state was not verified");
  });
});

describe("LinkedIn profile production schedule", () => {
  it("uses a distinct protected ten-minute job", () => {
    const workflow = readFileSync(resolve(process.cwd(), ".github/workflows/linkedin-profile-filing.yml"), "utf8");

    expect(LINKEDIN_PROFILE_GMAIL_QUERY).toContain("in:inbox");
    expect(LINKEDIN_PROFILE_GMAIL_QUERY).toContain("to:805shutters@gmail.com");
    expect(LINKEDIN_PROFILE_GMAIL_QUERY).toContain("from:messages-noreply@linkedin.com");
    expect(workflow).toContain('cron: "*/10 * * * *"');
    expect(workflow).toContain("group: linkedin-profile-filing");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("LINKEDIN_PROFILE_CRON_SECRET");
    expect(workflow).toContain("https://www.805shutters.com/api/cron/linkedin-profile-filing/");
  });
});
