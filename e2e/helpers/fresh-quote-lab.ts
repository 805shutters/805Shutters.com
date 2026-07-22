import { expect, type Page } from "@playwright/test";

export type FreshQuoteLabRun = {
  runId: string;
  quoteNumber: string;
  createdAt: string;
  revision: number;
};

export async function openFreshQuoteLab(
  page: Page,
  accessCode: string,
): Promise<FreshQuoteLabRun> {
  const unlock = await page.request.post("/api/quote-lab/access", {
    data: { code: accessCode },
  });
  expect(unlock.ok()).toBe(true);

  const initialResponse = await page.request.get("/api/quote-lab/state");
  expect(initialResponse.ok()).toBe(true);
  const initial = (await initialResponse.json()) as {
    state: unknown;
    revision: number;
  };
  expect(initial).toMatchObject({ state: null, revision: 0 });

  const resetResponse = await page.request.post("/api/quote-lab/state", {
    data: { expectedRevision: 0 },
  });
  expect(resetResponse.ok()).toBe(true);
  const reset = (await resetResponse.json()) as FreshQuoteLabRun & {
    state: {
      quotes: Array<{ quote_number: string; installer_notes: string }>;
      lineItems: unknown[];
      designs: unknown[];
      selectedVariantByLine: Record<string, string>;
    };
  };
  expect(reset.runId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  expect(reset.quoteNumber).toBe(`V2-${reset.runId}`);
  expect(reset.state).toMatchObject({
    lineItems: [],
    designs: [],
    selectedVariantByLine: {},
  });
  expect(reset.state.quotes).toHaveLength(1);
  expect(reset.state.quotes[0].quote_number).toBe(reset.quoteNumber);
  expect(JSON.parse(reset.state.quotes[0].installer_notes)).toMatchObject({
    __quoteLabRunId: reset.runId,
  });

  await page.goto("/quote-lab");
  await expect(
    page.locator('[data-quote-lab-interface="exact-existing-builder"]'),
  ).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".quote-line-card-header")).toHaveCount(0);
  await expect(
    page.getByText("Select a product type and room to add line items.", {
      exact: true,
    }),
  ).toBeVisible();

  return {
    runId: reset.runId,
    quoteNumber: reset.quoteNumber,
    createdAt: reset.createdAt,
    revision: reset.revision,
  };
}
