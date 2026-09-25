import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("@/components/crm/quotes/QuoteBuilderStandalone", () => ({ QuoteBuilderStandalone: () => null }));
import QuoteBuilderPage from "./page";

beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());

it("opens a mobile sales quote in the canonical builder with its original ID", async () => {
  const result = await QuoteBuilderPage({
    params: Promise.resolve({ id: "mobile-sales-quote-id" }),
    searchParams: Promise.resolve({ source: "sales" }),
  });
  expect(result.props).toMatchObject({ quoteId: "mobile-sales-quote-id", salesQuote: true });
});

it("preserves legacy CRM quote routing when no sales source is supplied", async () => {
  const result = await QuoteBuilderPage({
    params: Promise.resolve({ id: "legacy-crm-quote-id" }), searchParams: Promise.resolve({}),
  });
  expect(result.props).toMatchObject({ quoteId: "legacy-crm-quote-id", salesQuote: false });
});
