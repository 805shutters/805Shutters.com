import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { runMtsCompletedReportsCron, type MtsCompletedReportsCronDependencies } from "./route";
import type { MtsCompletedReportGmailClient } from "@/lib/crm/mts-completed-report-filing";

function request(secret?: string) {
  return new NextRequest("https://www.805shutters.com/api/cron/mts-completed-reports", {
    method: "POST",
    headers: secret ? { Authorization: `Bearer ${secret}` } : undefined,
  });
}

function dependencies(secret: string | null = "cron-secret") {
  const gmail = {} as MtsCompletedReportGmailClient;
  const getAccessToken = vi.fn(async () => "gmail-access-token");
  const verifyModifyAccess = vi.fn(async () => undefined);
  const createClient = vi.fn(() => gmail);
  const fileReports = vi.fn(async () => ({
    scanned: 5,
    qualified: 4,
    filed: 4,
    skipped: 1,
    filedByType: { completed: 1, scheduled: 2, incomplete: 1 },
  }));
  const deps: MtsCompletedReportsCronDependencies = {
    env: { MTS_COMPLETED_REPORT_CRON_SECRET: secret || undefined },
    getAccessToken,
    verifyModifyAccess,
    createClient,
    fileReports,
  };
  return { deps, getAccessToken, verifyModifyAccess, createClient, fileReports, gmail };
}

describe("MTS completed-reports cron route", () => {
  it("fails closed when no cron secret is configured", async () => {
    const setup = dependencies(null);

    const response = await runMtsCompletedReportsCron(request(), setup.deps);

    expect(response.status).toBe(503);
    expect(setup.getAccessToken).not.toHaveBeenCalled();
    expect(setup.verifyModifyAccess).not.toHaveBeenCalled();
  });

  it("rejects a request with the wrong bearer secret", async () => {
    const setup = dependencies();

    const response = await runMtsCompletedReportsCron(request("wrong-secret"), setup.deps);

    expect(response.status).toBe(401);
    expect(setup.getAccessToken).not.toHaveBeenCalled();
    expect(setup.verifyModifyAccess).not.toHaveBeenCalled();
  });

  it("files reports and returns the verified summary for an authorized request", async () => {
    const setup = dependencies();

    const response = await runMtsCompletedReportsCron(request("cron-secret"), setup.deps);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      mailbox: "805shutters@gmail.com",
      labels: {
        completed: "805/MTS Completed Reports",
        scheduled: "805/MTS Scheduled Reports",
        incomplete: "805/MTS Incomplete Reports",
      },
      scanned: 5,
      qualified: 4,
      filed: 4,
      skipped: 1,
      filedByType: { completed: 1, scheduled: 2, incomplete: 1 },
    });
    expect(setup.verifyModifyAccess).toHaveBeenCalledWith("gmail-access-token");
    expect(setup.createClient).toHaveBeenCalledWith("gmail-access-token");
    expect(setup.fileReports).toHaveBeenCalledWith(setup.gmail);
  });
});
