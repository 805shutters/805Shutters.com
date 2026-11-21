import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { QUOTER_SERVICE_DENIED_MESSAGE } from "@/lib/crm/quoter-service-auth";

const FIXTURE = "test-quoter-token-not-a-live-secret";
const ORIGINAL_TOKEN = process.env.QUOTER_SERVICE_TOKEN;
const ID = "00000000-0000-4000-8000-000000000001";

const sent = vi.hoisted(() => ({
  email: vi.fn(async () => {
    throw new Error("Quoter test tried to send email");
  }),
  sms: vi.fn(async () => {
    throw new Error("Quoter test tried to send sms");
  }),
  square: vi.fn(async () => {
    throw new Error("Quoter test tried to call Square");
  }),
  squareEntry: vi.fn(async () => {
    throw new Error("Quoter test tried to call Square");
  }),
}));

vi.mock("@/lib/notify/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/notify/email")>()),
  sendEmail: sent.email,
}));

vi.mock("@/lib/notify/twilio", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/notify/twilio")>()),
  sendSms: sent.sms,
}));

vi.mock("@/lib/crm/square-payment-links", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/crm/square-payment-links")>()),
  sendSquareOrderPaymentLink: sent.square,
}));

vi.mock("@/lib/crm/square-entry-payment-links", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/crm/square-entry-payment-links")>()),
  sendSquareEntryPaymentLink: sent.squareEntry,
}));

import { POST as sendQuote } from "@/app/api/crm/quotes/[id]/send/route";
import { POST as sendSalesQuote } from "@/app/api/crm/sales-quotes/[id]/send/route";
import { POST as prepareV2CustomerSend } from "@/app/api/crm/sales-quotes/[id]/v2/customer-send/route";
import { POST as sendHub } from "@/app/api/crm/quote-hub/[source]/[id]/route";
import { POST as sendQuotePaymentLink } from "@/app/api/crm/quotes/[id]/payment-link/route";
import { POST as sendSalesPaymentLink } from "@/app/api/crm/sales-quotes/[id]/payment-link/route";
import { POST as sendQuoteSquareLink } from "@/app/api/crm/quotes/[id]/square-payment-link/route";
import { POST as sendBookkeepingSquareLink } from "@/app/api/crm/bookkeeping/[id]/square-payment-link/route";
import { POST as sendMobilePaymentLink } from "@/app/api/crm/mobile/customers/handler";
import { POST as sendVendorEmail } from "@/app/api/crm/vendor-order-tasks/[id]/email/route";
import { POST as sendMeasureEmail } from "@/app/api/crm/technical-measures/[id]/email/route";
import { POST as sendOfficeEmail } from "@/app/api/crm/technical-measures/[id]/office-email/route";
import { POST as sendOutreach } from "@/app/api/crm/commercial/outreach/route";
import { PATCH as resendPlan } from "@/app/api/crm/in-house-plans/route";
import { POST as sendYelpSms } from "@/app/api/crm/yelp-sms/route";
import { POST as sendConfirmationSample } from "@/app/api/crm/confirmation-sample/route";
import { POST as sendEta } from "@/app/api/crm/mobile/appointments/[id]/eta/route";
import { POST as sendReviewBacklog } from "@/app/api/crm/jobs/review-request-backlog/route";
import { GET as readJobs } from "@/app/api/crm/jobs/route";
import { GET as readSession } from "@/app/api/crm/session/route";
import { PATCH as patchSettings } from "@/app/api/crm/settings/route";
import { POST as postCalendar } from "@/app/api/crm/calendar/route";
import { DELETE as deleteCustomer } from "@/app/api/crm/customers/[id]/route";
import { POST as postQuotes } from "@/app/api/crm/quotes/route";
import { GET as readKenPayoff } from "@/app/api/crm/ken-payoff/route";
import { POST as postSquare } from "@/app/api/crm/square/route";
import { POST as postProcessEmails } from "@/app/api/crm/process-emails/route";
import { POST as shareQuote } from "@/app/api/crm/quotes/[id]/share/route";
import { GET as readHealth } from "@/app/api/crm/health/route";
import { GET as startGoogleOAuth } from "@/app/api/crm/oauth/google/route";
import { GET as googleContactsCallback } from "@/app/api/crm/google-contacts/callback/route";
import { POST as normanWorker } from "@/app/api/crm/norman-order-worker/route";
import { POST as normanLineEventWorker } from "@/app/api/crm/norman-line-event-worker/route";
import { POST as manufacturerWorker } from "@/app/api/crm/manufacturer-order-worker/route";

// Route handlers each declare their own params. The refusal test only invokes them.
type Handler = (request: NextRequest, context: { params: Promise<{ id: string; source: string; quoteId: string }> }) => Promise<Response>;

const sendPaths: Array<[string, string, string, Handler]> = [
  ["quote send", "POST", `/api/crm/quotes/${ID}/send`, sendQuote],
  ["sales quote send", "POST", `/api/crm/sales-quotes/${ID}/send`, sendSalesQuote],
  ["sales quote v2 customer send", "POST", `/api/crm/sales-quotes/${ID}/v2/customer-send`, prepareV2CustomerSend],
  ["quote hub send", "POST", `/api/crm/quote-hub/sales/${ID}`, sendHub],
  ["quote payment link", "POST", `/api/crm/quotes/${ID}/payment-link`, sendQuotePaymentLink],
  ["sales quote payment link", "POST", `/api/crm/sales-quotes/${ID}/payment-link`, sendSalesPaymentLink],
  ["quote square payment link", "POST", `/api/crm/quotes/${ID}/square-payment-link`, sendQuoteSquareLink],
  ["bookkeeping square payment link", "POST", `/api/crm/bookkeeping/${ID}/square-payment-link`, sendBookkeepingSquareLink],
  ["mobile customer payment link", "POST", "/api/crm/mobile/customers", sendMobilePaymentLink],
  ["vendor order email", "POST", `/api/crm/vendor-order-tasks/${ID}/email`, sendVendorEmail],
  ["technical measure email", "POST", `/api/crm/technical-measures/${ID}/email`, sendMeasureEmail],
  ["technical measure office email", "POST", `/api/crm/technical-measures/${ID}/office-email`, sendOfficeEmail],
  ["commercial outreach email", "POST", "/api/crm/commercial/outreach", sendOutreach],
  ["in-house plan resend", "PATCH", "/api/crm/in-house-plans", resendPlan],
  ["yelp sms", "POST", "/api/crm/yelp-sms", sendYelpSms],
  ["appointment confirmation sms", "POST", "/api/crm/confirmation-sample", sendConfirmationSample],
  ["appointment eta sms", "POST", `/api/crm/mobile/appointments/${ID}/eta`, sendEta],
  ["review request sms", "POST", "/api/crm/jobs/review-request-backlog", sendReviewBacklog],
];

const otherCrmRoutes: Array<[string, string, string, Handler]> = [
  ["jobs", "GET", "/api/crm/jobs", readJobs],
  ["session", "GET", "/api/crm/session", readSession],
  ["settings", "PATCH", "/api/crm/settings", patchSettings],
  ["calendar", "POST", "/api/crm/calendar", postCalendar],
  ["customer delete", "DELETE", `/api/crm/customers/${ID}`, deleteCustomer],
  ["quotes", "POST", "/api/crm/quotes", postQuotes],
  ["ken payoff", "GET", "/api/crm/ken-payoff", readKenPayoff],
  ["square", "POST", "/api/crm/square", postSquare],
  ["process emails", "POST", "/api/crm/process-emails", postProcessEmails],
  ["quote share", "POST", `/api/crm/quotes/${ID}/share`, shareQuote],
  ["health", "GET", "/api/crm/health", readHealth],
  ["google oauth", "GET", "/api/crm/oauth/google", startGoogleOAuth],
  ["google contacts callback", "GET", "/api/crm/google-contacts/callback", googleContactsCallback],
  ["norman order worker", "POST", "/api/crm/norman-order-worker", normanWorker],
  ["norman line event worker", "POST", "/api/crm/norman-line-event-worker", normanLineEventWorker],
  ["manufacturer order worker", "POST", "/api/crm/manufacturer-order-worker", manufacturerWorker],
];

afterAll(() => {
  if (ORIGINAL_TOKEN === undefined) delete process.env.QUOTER_SERVICE_TOKEN;
  else process.env.QUOTER_SERVICE_TOKEN = ORIGINAL_TOKEN;
});

beforeEach(() => {
  sent.email.mockClear();
  sent.sms.mockClear();
  sent.square.mockClear();
  sent.squareEntry.mockClear();
  process.env.QUOTER_SERVICE_TOKEN = FIXTURE;
});

function call(handler: Handler, method: string, pathname: string) {
  const headers = new Headers({ authorization: `Bearer ${FIXTURE}` });
  const init: { method: string; headers: Headers; body?: string } = { method, headers };
  if (method !== "GET" && method !== "HEAD") {
    headers.set("content-type", "application/json");
    init.body = JSON.stringify({ operation: "send", mode: "send", confirmSend: true });
  }
  return handler(new NextRequest(`http://localhost${pathname}`, init), {
    params: Promise.resolve({ id: ID, source: "sales", quoteId: ID }),
  });
}

async function expectDenied(handler: Handler, method: string, pathname: string) {
  const response = await call(handler, method, pathname);
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ message: QUOTER_SERVICE_DENIED_MESSAGE });
  expect(sent.email).not.toHaveBeenCalled();
  expect(sent.sms).not.toHaveBeenCalled();
  expect(sent.square).not.toHaveBeenCalled();
  expect(sent.squareEntry).not.toHaveBeenCalled();
}

describe("Quoter send paths", () => {
  it.each(sendPaths)("refuses %s", async (_label, method, pathname, handler) => {
    await expectDenied(handler, method, pathname);
  });
});

describe("Quoter non-front-door CRM routes", () => {
  it.each(otherCrmRoutes)("refuses %s", async (_label, method, pathname, handler) => {
    await expectDenied(handler, method, pathname);
  });
});
