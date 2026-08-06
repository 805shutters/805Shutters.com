import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  runLinkedInProfileFilingCron,
  type LinkedInProfileFilingCronDependencies,
} from "./route";
import type { MtsCompletedReportGmailClient } from "@/lib/crm/mts-completed-report-filing";

function request(secret?: string) {
  return new NextRequest("https://www.805shutters.com/api/cron/linkedin-profile-filing", {
    method: "POST",
    headers: secret ? { Authorization: `Bearer ${secret}` } : undefined,
  });
}

function dependencies(secret: string | null = "cron-secret") {
  const gmail = {} as MtsCompletedReportGmailClient;
  const getAccessToken = vi.fn(async () => "gmail-access-token");
  const verifyModifyAccess = vi.fn(async () => undefined);
  const createClient = vi.fn(() => gmail);
  const fileProfiles = vi.fn(async () => ({ scanned: 3, recognized: 2, retained: 1, filed: 1, skipped: 1 }));
  const deps: LinkedInProfileFilingCronDependencies = {
    env: { LINKEDIN_PROFILE_CRON_SECRET: secret || undefined },
    getAccessToken,
    verifyModifyAccess,
    createClient,
    fileProfiles,
  };
  return { deps, getAccessToken, verifyModifyAccess, createClient, fileProfiles, gmail };
}

describe("LinkedIn profile filing cron route", () => {
  it("fails closed when no cron secret is configured", async () => {
    const setup = dependencies(null);

    const response = await runLinkedInProfileFilingCron(request(), setup.deps);

    expect(response.status).toBe(503);
    expect(setup.getAccessToken).not.toHaveBeenCalled();
  });

  it("rejects the wrong bearer secret", async () => {
    const setup = dependencies();

    const response = await runLinkedInProfileFilingCron(request("wrong"), setup.deps);

    expect(response.status).toBe(401);
    expect(setup.getAccessToken).not.toHaveBeenCalled();
  });

  it("returns the verified production summary", async () => {
    const setup = dependencies();

    const response = await runLinkedInProfileFilingCron(request("cron-secret"), setup.deps);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      mailbox: "805shutters@gmail.com",
      label: "805/LinkedIn Profiles Archived",
      scanned: 3,
      recognized: 2,
      retained: 1,
      filed: 1,
      skipped: 1,
    });
    expect(setup.verifyModifyAccess).toHaveBeenCalledWith("gmail-access-token");
    expect(setup.createClient).toHaveBeenCalledWith("gmail-access-token");
    expect(setup.fileProfiles).toHaveBeenCalledWith(setup.gmail);
  });
});
