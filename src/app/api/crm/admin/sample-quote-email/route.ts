import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createCrmJob, createCrmQuote } from "@/lib/crm/backend";
import {
  createLineItem,
  loadQuoteBuilder,
  selectDesign,
  updateQuoteAdjustments,
  upsertDesign,
} from "@/lib/crm/quote-builder";
import { sendQuoteToCustomer } from "@/lib/crm/public-quote";
import { MIKE_PAYMENT_ADMIN_EMAIL } from "@/lib/crm/allowed-users";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const actor = { email: "sample-quote-email@805shutters.com" };

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export async function POST(request: NextRequest) {
  const routeSecret = process.env.CRM_SAMPLE_QUOTE_SECRET;
  if (!routeSecret || request.headers.get("x-sample-quote-secret") !== routeSecret) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert(supabaseUrl && serviceKey, "Supabase service credentials are not configured.");

  const body = (await request.json().catch(() => ({}))) as { to?: string };
  const to = (body.to || MIKE_PAYMENT_ADMIN_EMAIL).trim().toLowerCase();
  assert(to === MIKE_PAYMENT_ADMIN_EMAIL, "Sample quote recipient is not allowed.");

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const marker = `__SAMPLE_QUOTE_EMAIL_${Date.now()}__`;
  const displayName = `Mike Shepard ${marker}`;
  const address = "2162 Brookhill Drive, Camarillo, CA 93010";

  const job = await createCrmJob(
    supabase,
    {
      customer_name: displayName,
      phone: "805-298-5555",
      email: to,
      address,
      city: "Camarillo",
      product_interest: "Sample mixed quote email",
      sales_owner: "Mike",
      source: "sample_quote_email",
      notes: marker,
      meta: { marker, purpose: "sample_quote_email" },
    },
    actor,
  );

  const quote = await createCrmQuote(
    supabase,
    {
      job_id: job.id,
      customer_name: displayName,
      customer_email: to,
      customer_phone: "805-298-5555",
      customer_address: address,
      quote_number: `SAMPLE-${Date.now()}`,
      status: "draft",
      notes: marker,
      meta: { marker, purpose: "sample_quote_email" },
    },
    actor,
  );

  let built = await createLineItem(
    supabase,
    { quote_id: quote.id, room: "Living Room", width_in: 36, height_in: 60, quantity: 1, seed_product_id: "norman_shutters" },
    actor,
  );
  const shutter = built.lineItems.find((line) => line.room === "Living Room");
  const shutterB = shutter?.designs.find((design) => design.label === "B");
  assert(shutter && shutterB, "Shutter sample line could not be prepared.");
  built = await selectDesign(supabase, shutter.id, shutterB.id, actor);

  built = await createLineItem(
    supabase,
    { quote_id: quote.id, room: "Primary Bedroom", width_in: 30, height_in: 54, quantity: 2 },
    actor,
  );
  const roller = built.lineItems.find((line) => line.room === "Primary Bedroom");
  assert(roller, "Roller sample line could not be prepared.");
  built = await upsertDesign(
    supabase,
    {
      line_item_id: roller.id,
      label: "A",
      product_id: "roller",
      fabric: "Callie",
      details: { mount_type: "inside", control_side: "right", lift_system: "motorized" },
      motorization: [{ groupId: "smart_motorization", optionId: "motor" }],
    },
    actor,
  );

  built = await createLineItem(
    supabase,
    { quote_id: quote.id, room: "Kitchen", width_in: 24, height_in: 36, quantity: 1 },
    actor,
  );
  const honeycomb = built.lineItems.find((line) => line.room === "Kitchen");
  assert(honeycomb, "Honeycomb sample line could not be prepared.");
  built = await upsertDesign(
    supabase,
    {
      line_item_id: honeycomb.id,
      label: "A",
      product_id: "honeycomb",
      program_id: "honeycomb_9_16in_cordless_single_cell",
      fabric: "Breeze",
      details: { mount_type: "inside", light_control: "room_darkening", lift_system: "cordless" },
      surcharges: [{ id: "room_darkening" }],
    },
    actor,
  );

  built = await updateQuoteAdjustments(
    supabase,
    quote.id,
    { taxPercent: 8.25, depositPercent: 50, fees: [{ name: "Sample installation", amount: 175 }] },
    actor,
  );
  assert(Number(built.quote_total) > 0, "Sample quote total was not positive.");

  const sent = await sendQuoteToCustomer(supabase, quote.id, actor, { email: true, sms: false });
  const refreshed = await loadQuoteBuilder(supabase, quote.id);

  return NextResponse.json({
    ok: sent.email.sent === true,
    marker,
    recipient: to,
    jobId: job.id,
    quoteId: quote.id,
    quoteNumber: refreshed.quote_number,
    total: refreshed.quote_total,
    url: sent.url,
    email: sent.email,
    sms: sent.sms,
    status: sent.status,
  }, { status: sent.email.sent ? 200 : 500 });
}
