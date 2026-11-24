import { NextResponse } from "next/server";
export const runtime = "nodejs";
/** Old wallet tokens are never forwarded or charged after the Stripe cutover. */
export async function POST(..._args: unknown[]) {
  return NextResponse.json(
    { message: "This wallet checkout is retired. Refresh your contract and use Pay with card for secure Stripe checkout." },
    { status: 410 },
  );
}
