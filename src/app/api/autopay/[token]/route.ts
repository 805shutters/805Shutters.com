import { NextResponse } from "next/server";
export const runtime = "nodejs";
export async function POST(..._args: unknown[]) {
  return NextResponse.json(
    { ok: false, error: "This saved-card setup is retired. Use a new Stripe payment link from 805 Shutters." },
    { status: 410 },
  );
}
