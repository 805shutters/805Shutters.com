import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "@/lib/crm/auth";
import { projectV2CustomerRetailPrice } from "@/lib/crm/sales-quote-v2-send";
import {
  assertSalesQuoteV2WholesaleLedgerAccess,
  buildSalesQuoteV2WholesaleSnapshotBinding,
  lookupPublishedSalesQuoteV2WholesaleCost,
  parseSalesQuoteV2WholesaleLookupBody,
  type SalesQuoteV2WholesaleLookupAuthoritative,
  type SalesQuoteV2WholesaleLookupInput,
} from "./sales-quote-v2-wholesale-ledger";

const VERSION_ID = "11111111-1111-4111-8111-111111111111";
const PROGRAM_ID = "22222222-2222-4222-8222-222222222222";
const SOURCE_ID = "33333333-3333-4333-8333-333333333333";
const HASH = "a".repeat(64);
const FINGERPRINT = "b".repeat(64);

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    manufacturerCode: "Norman",
    productKey: "faux_wood_blinds",
    programKey: "smartprivacy_2in",
    styleKey: "smartprivacy",
    colorKey: "pure_white",
    dimensions: { width: 36, height: 60 },
    options: {
      mount_type: "inside",
      slat_size: "2",
      child_safety: true,
    },
    asOf: "2026-07-26",
    ...overrides,
  };
}

function validInput(
  overrides: Partial<SalesQuoteV2WholesaleLookupInput> = {},
): SalesQuoteV2WholesaleLookupInput {
  return {
    manufacturerCode: "norman",
    productKey: "faux_wood_blinds",
    programKey: "smartprivacy_2in",
    styleKey: "smartprivacy",
    colorKey: "pure_white",
    width: 36,
    height: 60,
    options: {
      child_safety: true,
      mount_type: "inside",
      slat_size: "2",
    },
    asOf: "2026-07-26",
    ...overrides,
  };
}

function authoritativeResult(): SalesQuoteV2WholesaleLookupAuthoritative {
  return {
    status: "authoritative",
    wholesaleVersionId: VERSION_ID,
    wholesaleVersionKey: "norman-2026-07-account-805",
    scopeKey: "faux_wood_blinds",
    effectiveFrom: "2026-07-01",
    effectiveUntil: null,
    accountKey: "805",
    accountScope: "805-shutters",
    programId: PROGRAM_ID,
    manufacturerCode: "norman",
    productKey: "faux_wood_blinds",
    programKey: "smartprivacy_2in",
    styleKey: "smartprivacy",
    colorKey: "pure_white",
    requestedWidth: 36,
    requestedHeight: 60,
    matchedWidth: 36,
    matchedHeight: 60,
    baseCostCents: 15_000,
    optionCostCents: 2_500,
    perUnitOptionCostCents: 2_500,
    perLineOnceCostCents: 0,
    perOrderOnceCostCents: 0,
    wholesaleUnitCostCents: 17_500,
    currency: "USD",
    components: [
      {
        componentKey: "decorative_valance",
        label: "Decorative valance",
        calculation: "fixed",
        costCents: 2_500,
        billingScope: "per_unit",
        sourceId: SOURCE_ID,
        sourceLocator: { page: 12 },
      },
    ],
    orderCostRules: [
      {
        ruleKey: "standard_freight",
        label: "Standard freight",
        kind: "freight",
        calculation: "first_plus_additional",
        firstUnitCostCents: 2_500,
        additionalUnitCostCents: 1_100,
        flatCostCents: null,
        rateBasisPoints: null,
        thresholdCents: null,
        thresholdOperator: null,
        status: "authoritative",
        sourceId: SOURCE_ID,
        sourceLocator: { page: 44 },
      },
    ],
    sources: [
      {
        sourceKey: "norman-2026-07-price-guide",
        sourceType: "price_book",
        fileName: "2026Jul Retail Price Guide.pdf",
        revision: "2026-07",
        effectiveFrom: "2026-07-01",
        effectiveUntil: null,
        receivedOn: "2026-07-20",
        sha256: HASH,
        accountScope: "805-shutters",
        authorityScope: ["base_cost", "options", "freight"],
      },
    ],
    lookupFingerprint: FINGERPRINT,
  };
}

function fakeSupabase(data: unknown, error: unknown = null) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return { data, error };
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

describe("Quote V2 wholesale ledger adapter", () => {
  it("restricts internal cost access to Mike and Jessica's write accounts", () => {
    expect(() =>
      assertSalesQuoteV2WholesaleLedgerAccess("805shutters@gmail.com"),
    ).not.toThrow();
    expect(() =>
      assertSalesQuoteV2WholesaleLedgerAccess(" JESSICA@805SHUTTERS.COM "),
    ).not.toThrow();

    for (const email of [
      "khill31@msn.com",
      "customer@example.com",
      null,
      undefined,
    ]) {
      expect(() =>
        assertSalesQuoteV2WholesaleLedgerAccess(email),
      ).toThrowError(CrmAuthError);
      try {
        assertSalesQuoteV2WholesaleLedgerAccess(email);
      } catch (error) {
        expect(error).toMatchObject({ status: 403 });
      }
    }
  });

  it("normalizes only selection inputs and defaults as-of to the LA business date", () => {
    const parsed = parseSalesQuoteV2WholesaleLookupBody(
      {
        ...validBody(),
        styleKey: "",
        colorKey: "",
        asOf: undefined,
        dimensions: { width: 36.00001, height: 60.125 },
        options: {
          slat_size: "2",
          nested_configuration: { control_side: "left" },
        },
      },
      new Date("2026-07-27T06:30:00.000Z"),
    );
    expect(parsed).toEqual({
      manufacturerCode: "norman",
      productKey: "faux_wood_blinds",
      programKey: "smartprivacy_2in",
      styleKey: "",
      colorKey: "",
      width: 36,
      height: 60.125,
      options: {
        nested_configuration: { control_side: "left" },
        slat_size: "2",
      },
      asOf: "2026-07-26",
    });
  });

  it("strictly rejects client cost, provenance, source, and version fields", () => {
    for (const protectedField of [
      "costCents",
      "wholesaleUnitCostCents",
      "wholesaleVersionId",
      "accountKey",
      "provenance",
      "sourceId",
      "margin",
      "profit",
    ]) {
      expect(() =>
        parseSalesQuoteV2WholesaleLookupBody({
          ...validBody(),
          [protectedField]: protectedField,
        }),
      ).toThrow(protectedField);
    }

    for (const protectedOptions of [
      { manufacturer_cost: 1 },
      { wholesale_cost_cents: 1 },
      { source_id: SOURCE_ID },
      { nested_configuration: { provenance: { page: 1 } } },
    ]) {
      expect(() =>
        parseSalesQuoteV2WholesaleLookupBody({
          ...validBody(),
          options: protectedOptions,
        }),
      ).toThrow(/protected server-owned pricing metadata/i);
    }
  });

  it("rejects malformed dimensions, dates, and non-JSON options", () => {
    for (const dimensions of [
      { width: 0, height: 60 },
      { width: 36, height: -1 },
      { width: "36", height: 60 },
      { width: 36, height: Number.POSITIVE_INFINITY },
      { width: 36, height: 60, cost: 1 },
    ]) {
      expect(() =>
        parseSalesQuoteV2WholesaleLookupBody({
          ...validBody(),
          dimensions,
        }),
      ).toThrowError(CrmAuthError);
    }
    expect(() =>
      parseSalesQuoteV2WholesaleLookupBody({
        ...validBody(),
        asOf: "2026-02-30",
      }),
    ).toThrow(/valid calendar date/i);
    expect(() =>
      parseSalesQuoteV2WholesaleLookupBody({
        ...validBody(),
        options: ["inside"],
      }),
    ).toThrow(/options must be a JSON object/i);
  });

  it("calls only the published service-role RPC with normalized selection data", async () => {
    const { client, calls } = fakeSupabase(authoritativeResult());
    const result = await lookupPublishedSalesQuoteV2WholesaleCost(
      client,
      validInput(),
    );

    expect(calls).toEqual([
      {
        name: "lookup_quote_v2_wholesale_cost",
        args: {
          p_manufacturer_code: "norman",
          p_account_key: "805",
          p_product_key: "faux_wood_blinds",
          p_program_key: "smartprivacy_2in",
          p_style_key: "smartprivacy",
          p_color_key: "pure_white",
          p_width: 36,
          p_height: 60,
          p_options: {
            child_safety: true,
            mount_type: "inside",
            slat_size: "2",
          },
          p_as_of: "2026-07-26",
        },
      },
    ]);
    expect(result).toEqual(authoritativeResult());
  });

  it("builds the protected snapshot binding consumed by the existing price-save RPCs", () => {
    const input = validInput();
    const binding = buildSalesQuoteV2WholesaleSnapshotBinding(
      input,
      authoritativeResult(),
    );
    expect(binding).toEqual({
      authority: "wholesale_ledger",
      wholesaleVersionId: VERSION_ID,
      wholesaleVersionKey: "norman-2026-07-account-805",
      lookupFingerprint: FINGERPRINT,
      wholesaleLookupInput: {
        manufacturerCode: "norman",
        accountKey: "805",
        productKey: "faux_wood_blinds",
        programKey: "smartprivacy_2in",
        styleKey: "smartprivacy",
        colorKey: "pure_white",
        width: 36,
        height: 60,
        options: input.options,
        asOf: "2026-07-26",
      },
      wholesaleBaseCostCents: 15_000,
      wholesalePerUnitOptionCostCents: 2_500,
      wholesalePerLineOnceCostCents: 0,
      wholesalePerOrderOnceCostCents: 0,
      wholesaleUnitCostCents: 17_500,
    });
    expect(() =>
      buildSalesQuoteV2WholesaleSnapshotBinding(
        { ...input, width: 37 },
        authoritativeResult(),
      ),
    ).toThrow(/does not match its normalized lookup input/i);
  });

  it("fails closed on malformed, mismatched, unreconciled, or errored results", async () => {
    const malformedResults = [
      null,
      { ...authoritativeResult(), status: "ok" },
      { ...authoritativeResult(), wholesaleUnitCostCents: 17_499 },
      { ...authoritativeResult(), productKey: "different_product" },
      { ...authoritativeResult(), matchedWidth: 35 },
      { ...authoritativeResult(), lookupFingerprint: "not-a-hash" },
      { ...authoritativeResult(), sources: [] },
      { ...authoritativeResult(), currency: "EUR" },
    ];
    for (const result of malformedResults) {
      const { client } = fakeSupabase(result);
      await expect(
        lookupPublishedSalesQuoteV2WholesaleCost(client, validInput()),
      ).rejects.toMatchObject({ status: 502 });
    }

    const { client } = fakeSupabase(null, { message: "database detail" });
    await expect(
      lookupPublishedSalesQuoteV2WholesaleCost(client, validInput()),
    ).rejects.toMatchObject({
      status: 502,
      message: "The authoritative wholesale lookup failed.",
    });
  });

  it.each([
    {
      name: "Quote A Lotus standard 2-inch faux wood",
      manufacturerCode: "lotus",
      productKey: "faux_wood_blinds",
      programKey: "standard_2in",
      styleKey: "standard",
      colorKey: "white",
    },
    {
      name: "Quote B Norman SmartPrivacy 2-inch Pure White",
      manufacturerCode: "norman",
      productKey: "faux_wood_blinds",
      programKey: "smartprivacy_2in",
      styleKey: "smartprivacy",
      colorKey: "pure_white",
    },
    {
      name: "Quote C Norman Premium 2-inch Pure White",
      manufacturerCode: "norman",
      productKey: "faux_wood_blinds",
      programKey: "premium_2in",
      styleKey: "ultimate",
      colorKey: "pure_white",
    },
  ])("fails closed for $name when no wholesale version is published", async ({
    name: _name,
    ...selection
  }) => {
    const input = validInput(selection);
    const { client } = fakeSupabase({
      status: "blocked",
      code: "WHOLESALE_VERSION_NOT_PUBLISHED",
      manufacturerCode: selection.manufacturerCode,
      asOf: input.asOf,
    });
    const result = await lookupPublishedSalesQuoteV2WholesaleCost(client, input);
    expect(result).toEqual({
      status: "blocked",
      code: "WHOLESALE_VERSION_NOT_PUBLISHED",
      manufacturerCode: input.manufacturerCode,
      productKey: input.productKey,
      programKey: input.programKey,
      styleKey: input.styleKey,
      colorKey: input.colorKey,
      requestedWidth: 36,
      requestedHeight: 60,
      asOf: "2026-07-26",
    });
    expect(JSON.stringify(result)).not.toMatch(
      /cost|price|margin|profit|wholesaleVersion/i,
    );
  });

  it("keeps wholesale ledger fields out of the customer retail projection", () => {
    const projected = projectV2CustomerRetailPrice({
      ok: true,
      productId: "roller",
      programId: "roller_cordless",
      programName: "Cordless",
      matchedWidth: 36,
      matchedHeight: 60,
      base: 300,
      surchargeLines: [],
      unitPrice: 300,
      discountPercent: 0,
      discountAmount: 0,
      quantity: 1,
      onceTotal: 0,
      total: 300,
      wholesaleVersionId: VERSION_ID,
      wholesaleUnitCostCents: 17_500,
      baseCostCents: 15_000,
      optionCostCents: 2_500,
      lookupFingerprint: FINGERPRINT,
      sources: authoritativeResult().sources,
      margin: 125,
    });
    const serialized = JSON.stringify(projected);
    expect(serialized).not.toMatch(
      /wholesale|cost|margin|profit|lookupFingerprint|source/i,
    );
    expect(serialized).not.toContain("17500");
  });
});
