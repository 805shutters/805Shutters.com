import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createCrmJob, createCrmQuote } from "@/lib/crm/backend";
import {
  createLineItem,
  loadQuoteBuilder,
  selectDesign,
  updateLineItem,
  updateQuoteAdjustments,
  upsertDesign,
} from "@/lib/crm/quote-builder";
import { acceptPublicQuote, ensureShareToken, loadPublicQuoteByToken, sendQuoteToCustomer, type PublicQuote } from "@/lib/crm/public-quote";
import { createQuoteVersion } from "@/lib/crm/quote-groups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const actor = { email: "five-quote-e2e@805shutters.com" };
const customer = {
  name: "Mike Shepard",
  phone: "805-298-5555",
  address: "2162 Brookhill Drive",
  city: "Camarillo",
  zip: "93010",
};

type DesignSpec = {
  label: string;
  product_id: string;
  program_id?: string;
  fabric?: string;
  details?: Record<string, unknown>;
  surcharges?: Array<{ id: string; units?: number }>;
  motorization?: Array<{ groupId: string; optionId: string; units?: number }>;
  notes?: string;
};

type LineSpec = {
  room: string;
  width: number;
  height: number;
  quantity: number;
  seedProductId?: string;
  discountPercent?: number;
  designs?: DesignSpec[];
  selectLabel?: string;
  notes?: string;
};

type Scenario = {
  label: string;
  productInterest: string;
  lines: LineSpec[];
  adjustments?: Record<string, unknown>;
  versionAndSignClone?: boolean;
  purchaseRooms?: string[];
};

const scenarios: Scenario[] = [
  {
    label: "mixed-shutter-roller-honeycomb",
    productInterest: "Norman shutters, roller shades, honeycomb shades",
    adjustments: { depositPercent: 50, taxPercent: 7.25, fees: [{ name: "Install package", amount: 250 }] },
    versionAndSignClone: true,
    lines: [
      { room: "Living Room", width: 36, height: 60, quantity: 2, seedProductId: "norman_shutters", selectLabel: "B" },
      {
        room: "Kitchen",
        width: 42,
        height: 72,
        quantity: 1,
        discountPercent: 10,
        designs: [
          {
            label: "A",
            product_id: "roller",
            fabric: "Callie",
            details: { mount_type: "inside", control_side: "right", lift_system: "motorized" },
            motorization: [{ groupId: "smart_motorization", optionId: "motor" }],
          },
        ],
      },
      {
        room: "Primary Bath",
        width: 30,
        height: 48,
        quantity: 1,
        designs: [
          {
            label: "A",
            product_id: "honeycomb",
            fabric: "Breeze",
            details: { mount_type: "inside", light_control: "room_darkening", lift_system: "cordless" },
            surcharges: [{ id: "room_darkening" }],
          },
        ],
      },
    ],
  },
  {
    label: "mixed-roman-faux-citylights",
    productInterest: "Roman shades, faux wood blinds, aluminum blinds",
    adjustments: { depositPercent: 40, discountFlat: 75 },
    lines: [
      {
        room: "Dining Room",
        width: 48,
        height: 72,
        quantity: 1,
        designs: [
          {
            label: "A",
            product_id: "roman",
            fabric: "Scarlett",
            details: { mount_type: "outside", control_side: "left", lift_system: "cordless" },
            surcharges: [{ id: "blackout_lining" }],
          },
        ],
      },
      {
        room: "Guest Bedroom",
        width: 34,
        height: 54,
        quantity: 2,
        designs: [
          {
            label: "A",
            product_id: "faux_wood",
            program_id: "faux_wood_2in_and_2_1_2in_slats_cordless",
            details: { mount_type: "inside", slat_size: "2_1_2", color: "printed", lift_system: "cordless" },
            surcharges: [{ id: "valance_surcharge" }],
          },
        ],
      },
      {
        room: "Laundry",
        width: 28,
        height: 42,
        quantity: 1,
        designs: [
          {
            label: "A",
            product_id: "citylights_aluminum",
            program_id: "citylights_aluminum_1in_slats_cordless_pgusa",
            details: { mount_type: "inside", slat_size: "1", slat_finish: "metallic", lift_system: "cordless" },
            surcharges: [{ id: "privacy" }],
          },
        ],
      },
    ],
  },
  {
    label: "mixed-smartdrape-synchrony-vertical-honeycomb",
    productInterest: "SmartDrape, vertical blinds, vertical honeycomb",
    adjustments: { depositPercent: 30, taxPercent: 7.25 },
    lines: [
      {
        room: "Slider",
        width: 96,
        height: 84,
        quantity: 1,
        designs: [{ label: "A", product_id: "smartdrape", fabric: "Plain", details: { mount_type: "outside", stack_option: "split", vane_style: "standard", lift_system: "wand" } }],
      },
      {
        room: "Office Slider",
        width: 84,
        height: 84,
        quantity: 1,
        designs: [{ label: "A", product_id: "synchrony_vertical", fabric: "Linen", details: { mount_type: "outside", stack_option: "right", control_side: "right", lift_system: "wand" } }],
      },
      {
        room: "Loft Door",
        width: 72,
        height: 96,
        quantity: 1,
        designs: [
          {
            label: "A",
            product_id: "vertical_honeycomb",
            program_id: "vertical_honeycomb_3_4in_single_and_1_1_4in_single_vertical",
            details: { mount_type: "inside", stack_option: "left", light_control: "light_filtering" },
            motorization: [{ groupId: "autowand", optionId: "autowand" }],
          },
        ],
      },
    ],
  },
  {
    label: "mixed-perfectsheer-smartfold-wood",
    productInterest: "PerfectSheer, SmartFold, wood blinds",
    adjustments: { depositPercent: 50, fees: [{ name: "Tall ladder install", amount: 175 }] },
    lines: [
      {
        room: "Primary Bedroom",
        width: 60,
        height: 84,
        quantity: 2,
        designs: [
          {
            label: "A",
            product_id: "perfectsheer",
            program_id: "perfectsheer_perfectsheer_shades_light_filtering",
            details: { mount_type: "inside", control_side: "left", lift_system: "motorized", valance: "wood" },
            motorization: [{ groupId: "automate_home", optionId: "motor_rechargeable_battery_pack" }],
          },
        ],
      },
      {
        room: "Family Room",
        width: 72,
        height: 84,
        quantity: 1,
        designs: [
          {
            label: "A",
            product_id: "smartfold",
            program_id: "smartfold_smartfold_shades",
            details: { mount_type: "outside", control_side: "right", lift_system: "cordless", fabric_category: "room_darkening", valance: "yes" },
            surcharges: [{ id: "premium_hem_bar" }],
          },
        ],
      },
      {
        room: "Office",
        width: 36,
        height: 54,
        quantity: 2,
        designs: [
          {
            label: "A",
            product_id: "wood_blinds",
            program_id: "wood_blinds_2in_and_2_1_2in_slats",
            details: { mount_type: "inside", slat_size: "2_1_2", color: "designer", lift_system: "cordless" },
            surcharges: [{ id: "designer_color" }],
          },
        ],
      },
    ],
  },
  {
    label: "mixed-onyx-roller-roman-purchase-some",
    productInterest: "Onyx shutters, roller shades, roman shades",
    purchaseRooms: ["Front Bedroom", "Hall Window"],
    adjustments: { depositPercent: 35, taxPercent: 7.25, fees: [{ name: "Trip and measure credit", amount: 95 }] },
    lines: [
      { room: "Front Bedroom", width: 32, height: 60, quantity: 2, seedProductId: "onyx_shutters", selectLabel: "C" },
      {
        room: "Hall Window",
        width: 30,
        height: 60,
        quantity: 1,
        designs: [{ label: "A", product_id: "roller", fabric: "Elements", details: { mount_type: "inside", control_side: "left", lift_system: "cordless" }, surcharges: [{ id: "premium_hem_bar" }] }],
      },
      {
        room: "Nursery",
        width: 42,
        height: 60,
        quantity: 1,
        designs: [{ label: "A", product_id: "roman", fabric: "Alma", details: { mount_type: "outside", control_side: "right", lift_system: "cordless" } }],
      },
    ],
  },
];

type RunState = {
  marker: string;
  jobIds: string[];
  quoteIds: string[];
  results: Array<Record<string, unknown>>;
  cleanupErrors: string[];
  diagnostics: Record<string, unknown>;
};

function suppressExternalNotifications() {
  process.env.TWILIO_ACCOUNT_SID = "";
  process.env.TWILIO_AUTH_TOKEN = "";
  process.env.TWILIO_MESSAGING_SERVICE_SID = "";
  process.env.TWILIO_FROM_PHONE = "";
  process.env.RESEND_API_KEY = "";
  process.env.RESEND_FROM = "";
  process.env.CRM_SIGNED_QUOTE_EMAIL = "";
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertCustomerSafe(value: unknown) {
  const serialized = JSON.stringify(value).toLowerCase();
  assert(!serialized.includes("wholesale"), "Customer-facing payload leaked wholesale text.");
  assert(!serialized.includes("internalmargin"), "Customer-facing payload leaked internal margin text.");
  assert(!serialized.includes("profit"), "Customer-facing payload leaked profit text.");
}

function selectedPublicLines(pub: PublicQuote, rooms?: string[]) {
  if (!rooms?.length) return undefined;
  const wanted = new Set(rooms);
  return pub.lines.filter((line) => wanted.has(line.room)).map((line) => line.id);
}

async function cleanup(supabase: SupabaseClient, state: RunState) {
  for (const quoteId of state.quoteIds) {
    const ops = [
      supabase.from("crm_customer_contracts").delete().eq("quote_id", quoteId),
      supabase.from("crm_quote_bookkeeping_payments").delete().eq("quote_id", quoteId),
      supabase.from("crm_quote_bookkeeping_entries").delete().eq("quote_id", quoteId),
    ];
    for (const op of ops) {
      const { error } = await op;
      if (error) state.cleanupErrors.push(error.message);
    }
  }
  for (const jobId of state.jobIds) {
    const { error } = await supabase.from("crm_jobs").delete().eq("id", jobId);
    if (error) state.cleanupErrors.push(error.message);
  }
  const { error } = await supabase.from("crm_customers").delete().ilike("display_name", `%${state.marker}%`);
  if (error) state.cleanupErrors.push(error.message);
}

async function buildScenario(supabase: SupabaseClient, state: RunState, scenario: Scenario, index: number) {
  const displayName = `${customer.name} ${state.marker} ${index + 1}`;
  const address = `${customer.address}, ${customer.city}, CA ${customer.zip}`;
  const job = await createCrmJob(
    supabase,
    {
      customer_name: displayName,
      phone: customer.phone,
      address,
      city: customer.city,
      product_interest: scenario.productInterest,
      sales_owner: "Mike",
      source: "e2e",
      notes: `${state.marker} ${scenario.label}`,
      meta: { e2eMarker: state.marker, scenario: scenario.label },
    },
    actor,
  );
  state.jobIds.push(job.id);

  const quote = await createCrmQuote(
    supabase,
    {
      job_id: job.id,
      customer_name: displayName,
      customer_phone: customer.phone,
      customer_address: address,
      quote_number: `E2E-${index + 1}-${Date.now()}`,
      status: "draft",
      notes: `${state.marker} ${scenario.label}`,
      meta: { e2eMarker: state.marker, scenario: scenario.label },
    },
    actor,
  );
  state.quoteIds.push(quote.id);

  let built = await loadQuoteBuilder(supabase, quote.id);
  for (const line of scenario.lines) {
    try {
      built = await createLineItem(
        supabase,
        {
          quote_id: quote.id,
          room: line.room,
          width_in: line.width,
          height_in: line.height,
          quantity: line.quantity,
          seed_product_id: line.seedProductId,
          notes: line.notes,
        },
        actor,
      );
    } catch (error) {
      throw new Error(`${scenario.label}/${line.room} createLineItem failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    let lineItem = built.lineItems.find((item) => item.room === line.room);
    assert(lineItem, `Line item ${line.room} was not created.`);

    if (line.discountPercent != null) {
      built = await updateLineItem(supabase, lineItem.id, { discount_percent: line.discountPercent }, actor);
      lineItem = built.lineItems.find((item) => item.id === lineItem?.id);
      assert(lineItem, `Line item ${line.room} disappeared after discount.`);
    }

    for (let designIndex = 0; designIndex < (line.designs ?? []).length; designIndex += 1) {
      const designSpec = line.designs![designIndex];
      try {
        built = await upsertDesign(supabase, { line_item_id: lineItem.id, sort_order: designIndex, ...designSpec }, actor);
      } catch (error) {
        throw new Error(
          `${scenario.label}/${line.room}/${designSpec.product_id}:${designSpec.label} upsertDesign failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      lineItem = built.lineItems.find((item) => item.id === lineItem?.id);
      assert(lineItem, `Line item ${line.room} disappeared after design.`);
    }

    if (line.selectLabel) {
      lineItem = built.lineItems.find((item) => item.id === lineItem?.id);
      const selected = lineItem?.designs.find((design) => design.label === line.selectLabel);
      assert(lineItem && selected, `${line.room} missing selected design ${line.selectLabel}.`);
      built = await selectDesign(supabase, lineItem.id, selected.id, actor);
    }
  }

  if (scenario.adjustments) built = await updateQuoteAdjustments(supabase, quote.id, scenario.adjustments, actor);

  assert(built.lineItems.length === scenario.lines.length, `${scenario.label} line count mismatch.`);
  assert(Number(built.quote_total) > 0, `${scenario.label} total was not positive.`);
  for (const line of built.lineItems) {
    const selected = line.designs.find((design) => design.id === line.selected_design_id);
    assert(selected, `${scenario.label}/${line.room} has no selected design.`);
    assert(selected.price_status === "ok", `${scenario.label}/${line.room} pricing failed with ${selected.price_status}.`);
    assert(Number(selected.unit_price) > 0, `${scenario.label}/${line.room} unit price was not positive.`);
  }

  let quoteIdToSign = quote.id;
  let versionId: string | null = null;
  if (scenario.versionAndSignClone) {
    const version = await createQuoteVersion(supabase, quote.id, actor);
    versionId = version.quoteId;
    state.quoteIds.push(version.quoteId);
    const clone = await loadQuoteBuilder(supabase, version.quoteId);
    assert(clone.lineItems.length === built.lineItems.length, "Version clone did not copy all lines.");
    assert(Number(clone.quote_total) === Number(built.quote_total), "Version clone total mismatch.");
    quoteIdToSign = version.quoteId;
  }

  const sent = await sendQuoteToCustomer(supabase, quoteIdToSign, actor, { email: false, sms: false });
  assert(sent.url.includes("/quote/"), `${scenario.label} did not create public quote URL.`);
  assert(sent.status === "sent", `${scenario.label} did not transition to sent.`);

  const share = await ensureShareToken(supabase, quoteIdToSign, actor);
  const pub = await loadPublicQuoteByToken(supabase, share.token);
  assert(pub, `${scenario.label} public quote did not load.`);
  assert(pub.allPriced, `${scenario.label} public quote was not all priced.`);
  assert(pub.lines.length === scenario.lines.length, `${scenario.label} public line count mismatch.`);
  assert(Number(pub.total) > 0, `${scenario.label} public total was not positive.`);
  assertCustomerSafe(pub);

  const selectedLineIds = selectedPublicLines(pub, scenario.purchaseRooms);
  const accepted = await acceptPublicQuote(supabase, share.token, {
    printedName: customer.name,
    acknowledgedTotal: selectedLineIds ? undefined : pub.total,
    selectedLineIds,
  });
  assert(accepted.ok, `${scenario.label} did not accept.`);

  const signed = await loadQuoteBuilder(supabase, quoteIdToSign);
  assert(signed.status === "sold", `${scenario.label} did not transition to sold.`);
  assert(Boolean(signed.signed_at), `${scenario.label} missing signed_at.`);
  assert(Number(signed.quote_total) > 0, `${scenario.label} signed total was not positive.`);

  const { data: soldJob } = await supabase.from("crm_jobs").select("status").eq("id", job.id).maybeSingle();
  assert(soldJob?.status === "sold", `${scenario.label} job was not sold.`);

  const { data: entry } = await supabase
    .from("crm_quote_bookkeeping_entries")
    .select("quote_id, job_id, customer_name, sold_date, total_amount")
    .eq("quote_id", quoteIdToSign)
    .maybeSingle();
  assert(entry?.quote_id === quoteIdToSign, `${scenario.label} missing bookkeeping quote id.`);
  assert(entry?.job_id === job.id, `${scenario.label} missing bookkeeping job id.`);
  assert(entry?.customer_name === displayName, `${scenario.label} bookkeeping customer mismatch.`);
  assert(Boolean(entry?.sold_date), `${scenario.label} bookkeeping missing sold_date.`);
  assert(Number(entry?.total_amount) === Number(signed.quote_total), `${scenario.label} bookkeeping total mismatch.`);

  const { data: contract } = await supabase
    .from("crm_customer_contracts")
    .select("quote_id, job_id, status, signed_at, total_amount, meta")
    .eq("external_id", `contract:${quoteIdToSign}`)
    .maybeSingle();
  assert(contract?.quote_id === quoteIdToSign, `${scenario.label} contract quote mismatch.`);
  assert(contract?.job_id === job.id, `${scenario.label} contract job mismatch.`);
  assert(contract?.status === "sold", `${scenario.label} contract was not sold.`);
  assert(Boolean(contract?.signed_at), `${scenario.label} contract missing signed_at.`);
  assert(Number(contract?.total_amount) === Number(signed.quote_total), `${scenario.label} contract total mismatch.`);
  const snapshot = (contract?.meta as { contract_snapshot?: { lines?: unknown[]; totals?: { total?: number } } } | null)?.contract_snapshot;
  assert(snapshot?.lines?.length === (scenario.purchaseRooms?.length ?? scenario.lines.length), `${scenario.label} snapshot line count mismatch.`);
  assert(Number(snapshot?.totals?.total) === Number(signed.quote_total), `${scenario.label} snapshot total mismatch.`);
  assertCustomerSafe(snapshot);

  if (versionId) {
    const { data: sibling } = await supabase.from("crm_quotes").select("status, share_token").eq("id", quote.id).maybeSingle();
    assert(sibling?.status === "archived", "Signed version did not archive sibling quote.");
    assert(sibling?.share_token == null, "Signed version did not clear sibling share token.");
  }

  state.results.push({
    scenario: scenario.label,
    jobId: job.id,
    sourceQuoteId: quote.id,
    quoteId: quoteIdToSign,
    versionId,
    total: signed.quote_total,
    lineCount: signed.lineItems.length,
    purchasedLineCount: snapshot.lines?.length,
    url: sent.url,
  });
}

async function runFiveQuoteE2e() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert(supabaseUrl && serviceKey, "Supabase service credentials are not configured.");
  suppressExternalNotifications();
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const state: RunState = {
    marker: `__FIVE_QUOTE_E2E_${Date.now()}__`,
    jobIds: [],
    quoteIds: [],
    results: [],
    cleanupErrors: [],
    diagnostics: {},
  };
  try {
    const { data: designColumns } = await supabase
      .from("information_schema.columns")
      .select("column_name, data_type, is_nullable")
      .eq("table_schema", "public")
      .eq("table_name", "crm_quote_designs")
      .order("ordinal_position");
    state.diagnostics.designColumns = designColumns;
    for (let index = 0; index < scenarios.length; index += 1) {
      await buildScenario(supabase, state, scenarios[index], index);
    }
    assert(state.results.length === 5, "Did not finish all five scenarios.");
    return { ok: true, cleaned: true, ...state };
  } catch (error) {
    return {
      ok: false,
      cleaned: true,
      error: error instanceof Error ? error.message : String(error),
      ...state,
    };
  } finally {
    await cleanup(supabase, state);
  }
}

export async function POST(request: NextRequest) {
  const routeSecret = process.env.CRM_E2E_SECRET;
  if (!routeSecret || request.headers.get("x-five-quote-e2e-secret") !== routeSecret) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const result = await runFiveQuoteE2e();
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
