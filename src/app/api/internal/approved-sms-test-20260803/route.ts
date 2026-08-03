import { NextResponse } from "next/server";

import { soldQuoteSmsRecipients } from "@/lib/crm/sold-quote-notifications";
import { sendSms } from "@/lib/notify/twilio";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const AUTHORIZATION = "805-approved-sms-test-20260803-4d9f7b18";
const BODY = "805 CRM TEST — signed-contract internal alert path only. No customer quote, contract, payment, order, or vendor workflow was created. No action required.";

export async function POST(request: Request) {
  if (request.headers.get("x-805-test-authorization") !== AUTHORIZATION) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const recipients = soldQuoteSmsRecipients().filter((recipient) => recipient.e164);
  if (recipients.length !== 3 || new Set(recipients.map((recipient) => recipient.e164)).size !== 3) {
    return NextResponse.json({ error: "recipient configuration is not exactly three unique valid numbers" }, { status: 409 });
  }
  const labels = ["Mike", "Ken", "Jessica"];
  const results = [];
  for (let index = 0; index < recipients.length; index += 1) {
    const result = await sendSms({ to: recipients[index].e164, body: BODY });
    results.push({
      recipient: labels[index],
      accepted: result.sent,
      status: result.providerStatus || (result.sent ? "accepted" : "failed"),
      messageRef: result.sid?.slice(-6) || null,
      error: result.error || result.skipped || null,
    });
  }
  return NextResponse.json({ sent: results.length, results });
}

export async function GET(request: Request) {
  if (request.headers.get("x-805-test-authorization") !== AUTHORIZATION) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !token) return NextResponse.json({ error: "provider not configured" }, { status: 503 });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json?PageSize=20`, {
    headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${token}`).toString("base64")}` },
    cache: "no-store",
  });
  const data = await response.json() as { messages?: Array<{ body?: string; status?: string; error_code?: number | null; sid?: string }> };
  const messages = (data.messages || []).filter((message) => message.body === BODY).slice(0, 3);
  return NextResponse.json({ results: messages.map((message) => ({ status: message.status, errorCode: message.error_code || null, messageRef: message.sid?.slice(-6) || null })) });
}
