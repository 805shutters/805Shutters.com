import { NextResponse } from "next/server";
import { META_DATASET_ID } from "@/lib/tracking-config";
import { isBookingDeliveryEnabled } from "@/lib/booking/delivery-config";

export const dynamic = "force-dynamic";

/** Presence-only deployment verification; never exposes credentials or customer data. */
export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") {
    return new NextResponse(null, { status: 404 });
  }
  let isolatedDatabase = false;
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
    isolatedDatabase = url.protocol === "https:"
      && url.hostname.endsWith(".supabase.co")
      && url.hostname !== "evuxqsaucmvgyuvjpqlo.supabase.co";
  } catch { /* Missing or invalid configuration is not ready. */ }
  return NextResponse.json({
    dataset: META_DATASET_ID,
    capiTokenPresent: Boolean(process.env.META_CAPI_ACCESS_TOKEN?.trim()),
    testEventCodePresent: Boolean(process.env.META_CAPI_TEST_EVENT_CODE?.trim()),
    isolatedDatabase,
    databaseKeysPresent: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
      && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
    customerNotificationsEnabled: isBookingDeliveryEnabled(),
  }, { headers: { "Cache-Control": "no-store" } });
}
