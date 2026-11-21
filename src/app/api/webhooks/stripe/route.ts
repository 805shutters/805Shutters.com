import { after, NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import {
  stripeConfig,
  stripeRecord,
  verifyStripeSignature,
} from "@/lib/finance/stripe";
import {
  syncStripeFinance,
  supportedStripeEvent,
} from "@/lib/crm/stripe-finance";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (
    !verifyStripeSignature(
      raw,
      request.headers.get("stripe-signature") || "",
      process.env.STRIPE_WEBHOOK_SECRET || "",
    )
  )
    return new NextResponse("Invalid signature", { status: 401 });
  const db = getSupabaseServiceClient();
  if (!db) return new NextResponse("Unavailable", { status: 503 });
  let event: Record<string, unknown>;
  try {
    event = stripeRecord(JSON.parse(raw));
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }
  const config = stripeConfig(),
    obj = stripeRecord(stripeRecord(event.data).object);
  if (
    typeof event.id !== "string" ||
    typeof event.type !== "string" ||
    typeof obj.id !== "string" ||
    event.livemode !== config.livemode ||
    (event.account && event.account !== config.account)
  )
    return new NextResponse("Wrong event identity", { status: 400 });
  if (!supportedStripeEvent(event.type))
    return NextResponse.json({ received: true, ignored: true });
  const saved = await db
    .from("crm_stripe_events")
    .upsert(
      {
        account_id: config.account,
        livemode: config.livemode,
        id: event.id,
        event_type: event.type,
        object_id: obj.id,
      },
      { onConflict: "account_id,livemode,id", ignoreDuplicates: true },
    );
  if (saved.error) return new NextResponse("Retry required", { status: 503 });
  after(async () => {
    try {
      await syncStripeFinance(db);
    } catch {
      console.error("Stripe recovery requires attention.");
    }
  });
  return NextResponse.json({ received: true });
}
