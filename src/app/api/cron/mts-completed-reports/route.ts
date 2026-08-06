import { NextRequest, NextResponse } from "next/server";
import { CrmAuthError, crmAuthErrorResponse } from "@/lib/crm/auth";
import { get805GmailAccessToken } from "@/lib/crm/installation-invoices";
import {
  MTS_COMPLETED_REPORT_LABEL,
  MTS_COMPLETED_REPORT_RECIPIENT,
  createMtsCompletedReportGmailClient,
  fileCompletedMtsReports,
  verifyGmailModifyAccessToken,
  type MtsCompletedReportFilingResult,
  type MtsCompletedReportGmailClient,
} from "@/lib/crm/mts-completed-report-filing";

export const runtime = "nodejs";

type CronEnvironment = {
  MTS_COMPLETED_REPORT_CRON_SECRET?: string;
  INSTALLATION_INVOICE_CRON_SECRET?: string;
  CRON_SECRET?: string;
};

export type MtsCompletedReportsCronDependencies = {
  env: CronEnvironment;
  getAccessToken(): Promise<string>;
  verifyModifyAccess(accessToken: string): Promise<void>;
  createClient(accessToken: string): MtsCompletedReportGmailClient;
  fileReports(client: MtsCompletedReportGmailClient): Promise<MtsCompletedReportFilingResult>;
};

const productionDependencies: MtsCompletedReportsCronDependencies = {
  env: {
    MTS_COMPLETED_REPORT_CRON_SECRET: process.env.MTS_COMPLETED_REPORT_CRON_SECRET,
    INSTALLATION_INVOICE_CRON_SECRET: process.env.INSTALLATION_INVOICE_CRON_SECRET,
    CRON_SECRET: process.env.CRON_SECRET,
  },
  getAccessToken: get805GmailAccessToken,
  verifyModifyAccess: verifyGmailModifyAccessToken,
  createClient: createMtsCompletedReportGmailClient,
  fileReports: fileCompletedMtsReports,
};

function requireCronAccess(request: NextRequest, env: CronEnvironment) {
  const secret =
    env.MTS_COMPLETED_REPORT_CRON_SECRET || env.INSTALLATION_INVOICE_CRON_SECRET || env.CRON_SECRET;
  if (!secret) {
    throw new CrmAuthError(503, "MTS completed-report cron secret is not configured.");
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    throw new CrmAuthError(401, "MTS completed-report cron is not authorized.");
  }
}

export async function runMtsCompletedReportsCron(
  request: NextRequest,
  dependencies: MtsCompletedReportsCronDependencies = productionDependencies
) {
  try {
    requireCronAccess(request, dependencies.env);
    const accessToken = await dependencies.getAccessToken();
    await dependencies.verifyModifyAccess(accessToken);
    const result = await dependencies.fileReports(dependencies.createClient(accessToken));
    return NextResponse.json({
      mailbox: MTS_COMPLETED_REPORT_RECIPIENT,
      label: MTS_COMPLETED_REPORT_LABEL,
      ...result,
    });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}

export async function GET(request: NextRequest) {
  return runMtsCompletedReportsCron(request);
}

export async function POST(request: NextRequest) {
  return runMtsCompletedReportsCron(request);
}
