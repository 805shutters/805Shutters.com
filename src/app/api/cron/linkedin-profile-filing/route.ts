import { NextRequest, NextResponse } from "next/server";
import { CrmAuthError, crmAuthErrorResponse } from "@/lib/crm/auth";
import { get805GmailAccessToken } from "@/lib/crm/installation-invoices";
import {
  LINKEDIN_PROFILE_ARCHIVE_LABEL,
  LINKEDIN_PROFILE_GMAIL_QUERY,
  LINKEDIN_PROFILE_RECIPIENT,
  fileLinkedInProfileEmails,
  type LinkedInProfileFilingResult,
} from "@/lib/crm/linkedin-profile-filing";
import {
  createFilingGmailClient,
  verifyGmailModifyAccessToken,
  type MtsCompletedReportGmailClient,
} from "@/lib/crm/mts-completed-report-filing";

export const runtime = "nodejs";

type CronEnvironment = {
  LINKEDIN_PROFILE_CRON_SECRET?: string;
  MTS_COMPLETED_REPORT_CRON_SECRET?: string;
  INSTALLATION_INVOICE_CRON_SECRET?: string;
  CRON_SECRET?: string;
};

export type LinkedInProfileFilingCronDependencies = {
  env: CronEnvironment;
  getAccessToken(): Promise<string>;
  verifyModifyAccess(accessToken: string): Promise<void>;
  createClient(accessToken: string): MtsCompletedReportGmailClient;
  fileProfiles(client: MtsCompletedReportGmailClient): Promise<LinkedInProfileFilingResult>;
};

const productionDependencies: LinkedInProfileFilingCronDependencies = {
  env: {
    LINKEDIN_PROFILE_CRON_SECRET: process.env.LINKEDIN_PROFILE_CRON_SECRET,
    MTS_COMPLETED_REPORT_CRON_SECRET: process.env.MTS_COMPLETED_REPORT_CRON_SECRET,
    INSTALLATION_INVOICE_CRON_SECRET: process.env.INSTALLATION_INVOICE_CRON_SECRET,
    CRON_SECRET: process.env.CRON_SECRET,
  },
  getAccessToken: get805GmailAccessToken,
  verifyModifyAccess: verifyGmailModifyAccessToken,
  createClient: (accessToken) => createFilingGmailClient(accessToken, LINKEDIN_PROFILE_GMAIL_QUERY),
  fileProfiles: fileLinkedInProfileEmails,
};

function requireCronAccess(request: NextRequest, env: CronEnvironment) {
  const secret = env.LINKEDIN_PROFILE_CRON_SECRET ||
    env.MTS_COMPLETED_REPORT_CRON_SECRET ||
    env.INSTALLATION_INVOICE_CRON_SECRET ||
    env.CRON_SECRET;
  if (!secret) throw new CrmAuthError(503, "LinkedIn profile filing cron secret is not configured.");
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    throw new CrmAuthError(401, "LinkedIn profile filing cron is not authorized.");
  }
}

export async function runLinkedInProfileFilingCron(
  request: NextRequest,
  dependencies: LinkedInProfileFilingCronDependencies = productionDependencies
) {
  try {
    requireCronAccess(request, dependencies.env);
    const accessToken = await dependencies.getAccessToken();
    await dependencies.verifyModifyAccess(accessToken);
    const result = await dependencies.fileProfiles(dependencies.createClient(accessToken));
    return NextResponse.json({
      mailbox: LINKEDIN_PROFILE_RECIPIENT,
      label: LINKEDIN_PROFILE_ARCHIVE_LABEL,
      ...result,
    });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}

export async function GET(request: NextRequest) {
  return runLinkedInProfileFilingCron(request);
}

export async function POST(request: NextRequest) {
  return runLinkedInProfileFilingCron(request);
}
