import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "./auth";
import { ACCOUNT_IDS } from "@mts/lib/accounts";
import { nextQuoteLetter } from "@mts/lib/quoteGroupLabels";
import {
  quoteV2DesignPatch,
  quoteV2LinePatch,
} from "@mts/lib/quoteV2ServerClient";
import type {
  SalesQuote,
  SalesQuoteDesign,
  SalesQuoteLineItem,
} from "@mts/types/quote";
import {
  createSalesQuoteV2Draft,
  mutateSalesQuoteV2Structure,
  parseCreateSalesQuoteV2DraftBody,
  parseSalesQuoteV2StructureBody,
  type QuoteV2StructureOperation,
} from "./sales-quote-v2-structure";

export function parseQuoteAlternativeBody(value: unknown) {
  const body = value as Record<string, unknown> | null;
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some(
      (key) => !["mode", "idempotencyKey", "expectedRevision"].includes(key),
    ) ||
    !["blank", "copy"].includes(String(body.mode)) ||
    typeof body.idempotencyKey !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,100}$/.test(body.idempotencyKey) ||
    !Number.isSafeInteger(body.expectedRevision) ||
    Number(body.expectedRevision) < 1
  ) {
    throw new CrmAuthError(
      400,
      "A quote alternative mode, request key, and current revision are required.",
    );
  }
  return {
    mode: body.mode as "blank" | "copy",
    idempotencyKey: body.idempotencyKey,
    expectedRevision: Number(body.expectedRevision),
  };
}

function copyId(key: string, id: string) {
  const hex = createHash("sha256").update(`${key}:${id}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function quoteAlternativeCopyOperations(
  lines: SalesQuoteLineItem[],
  designs: SalesQuoteDesign[],
  key: string,
): QuoteV2StructureOperation[] {
  return lines.flatMap((line) => {
    const lineItemId = copyId(key, line.id);
    const lineDesigns = designs.filter(
      (design) => design.line_item_id === line.id,
    );
    if (!lineDesigns.some((design) => design.id === line.selected_design_id)) {
      throw new CrmAuthError(
        409,
        `Select a design for ${line.room_name} before copying this quote.`,
      );
    }
    return [
      {
        type: "line.create" as const,
        lineItemId,
        patch: quoteV2LinePatch(line),
      },
      ...lineDesigns.map((design) => ({
        type: "design.upsert" as const,
        lineItemId,
        designId: copyId(key, design.id),
        variant: design.variant,
        selectDesign: design.id === line.selected_design_id,
        patch: quoteV2DesignPatch(design),
      })),
    ];
  });
}

function checked<T>({
  data,
  error,
}: {
  data: T;
  error: { message: string } | null;
}): T {
  if (error) throw new CrmAuthError(502, error.message);
  return data;
}

/** All writes stay behind CRM authentication. Structural copies use the existing
 * atomic V2 RPC; stable request/child IDs make retries resume the same draft. */
export async function createSalesQuoteAlternative(
  db: SupabaseClient,
  actorId: string,
  sourceId: string,
  input: ReturnType<typeof parseQuoteAlternativeBody>,
) {
  if (!/^[0-9a-f-]{36}$/i.test(sourceId))
    throw new CrmAuthError(400, "A valid source quote is required.");
  const source = checked(
    await db
      .from("sales_quotes")
      .select("*")
      .eq("id", sourceId)
      .eq("account_id", ACCOUNT_IDS.SHUTTERS_805)
      .single(),
  ) as SalesQuote;
  if (source?.deleted_at) throw new CrmAuthError(404, "Quote was not found.");
  if (!source?.quote_v2_backend)
    throw new CrmAuthError(
      409,
      "This action requires an authoritative V2 quote.",
    );
  const key = `alternative:${sourceId}:${input.mode}:${input.idempotencyKey}`;
  const groupId = source.quote_group_id || source.id;
  const previous = checked(
    await db
      .from("sales_quote_v2_draft_requests")
      .select("actor_id,result")
      .eq("idempotency_key", key)
      .maybeSingle(),
  );
  if (previous && previous.actor_id !== actorId)
    throw new CrmAuthError(
      409,
      "This quote request belongs to another CRM user.",
    );
  const previousId = previous?.result?.quoteId as string | undefined;
  // A completed retry must not reread or recopy a source that has since changed.
  const completed =
    previousId && input.mode === "copy"
      ? checked(
          await db
            .from("sales_quote_v2_events")
            .select("id")
            .eq("quote_id", previousId)
            .eq("idempotency_key", `${key}:copy`)
            .maybeSingle(),
        )
      : null;
  let operations: QuoteV2StructureOperation[] = [];
  if (!previousId || (input.mode === "copy" && !completed)) {
    if (source.quote_v2_revision !== input.expectedRevision)
      throw new CrmAuthError(
        409,
        "This quote changed. Refresh it before adding an alternative.",
      );
    if (input.mode === "copy") {
      const lines = checked(
        await db
          .from("sales_quote_line_items")
          .select("*")
          .eq("quote_id", sourceId)
          .order("sort_order"),
      ) as SalesQuoteLineItem[];
      const designs = lines.length
        ? (checked(
            await db
              .from("sales_quote_designs")
              .select("*")
              .in(
                "line_item_id",
                lines.map((line) => line.id),
              ),
          ) as SalesQuoteDesign[])
        : [];
      operations = quoteAlternativeCopyOperations(lines, designs, key);
      // Validate the whole copy before any draft is created.
      if (operations.length)
        parseSalesQuoteV2StructureBody({
          expectedRevision: 1,
          idempotencyKey: `${key}:copy`,
          operations,
        });
    }
  }
  if (!source.quote_group_id) {
    // Grouping metadata must not invalidate the source's prices or signed state.
    checked(
      await db
        .from("sales_quotes")
        .update({
          quote_group_id: groupId,
          quote_letter: source.quote_letter || "A",
        })
        .eq("id", sourceId)
        .is("quote_group_id", null),
    );
  }
  let quoteId = previousId;
  if (!quoteId) {
    const siblings = checked(
      await db
        .from("sales_quotes")
        .select("quote_letter")
        .eq("quote_group_id", groupId),
    );
    const created = await createSalesQuoteV2Draft(
      db,
      actorId,
      parseCreateSalesQuoteV2DraftBody({
        idempotencyKey: key,
        customerName: source.customer_name,
        customerEmail: source.customer_email ?? null,
        customerPhone: source.customer_phone ?? null,
        customerAddress: source.customer_address ?? null,
        appointmentDate: source.appointment_date ?? null,
        installerNotes:
          input.mode === "copy" ? (source.installer_notes ?? null) : null,
        quoteGroupId: groupId,
        quoteLetter: nextQuoteLetter(
          (siblings || []).map((row) => row.quote_letter),
        ),
      }),
    );
    quoteId = created.quoteId;
  }
  if (operations.length && !completed) {
    await mutateSalesQuoteV2Structure(
      db,
      quoteId,
      actorId,
      parseSalesQuoteV2StructureBody({
        expectedRevision: 1,
        idempotencyKey: `${key}:copy`,
        operations,
      }),
    );
  }
  const quote = checked(
    await db
      .from("sales_quotes")
      .update({
        sales_owner: source.sales_owner,
        sales_owner_auth_user_id: source.sales_owner_auth_user_id,
        sales_owner_set_at: source.sales_owner_set_at,
        created_job_id: source.created_job_id,
      })
      .eq("id", quoteId)
      .select("*")
      .single(),
  ) as SalesQuote;
  return { quote };
}
