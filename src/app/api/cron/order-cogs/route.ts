import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const disabledResponse = {
  disabled: true,
  message: "Order COGS email processing is disabled. Enter COGS directly in the 805 CRM."
};

async function run(request: NextRequest) {
  console.info("Order COGS cron skipped because email processing is disabled.", {
    method: request.method
  });
  return NextResponse.json(disabledResponse);
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
