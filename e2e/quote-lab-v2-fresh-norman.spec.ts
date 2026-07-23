import { expect, test } from "@playwright/test";
import { openFreshQuoteLab } from "./helpers/fresh-quote-lab";

const accessCode = process.env.QUOTE_LAB_ACCESS_CODE;

function addControls(page: import("@playwright/test").Page) {
  return page.locator('[aria-label="Add quote line item"]');
}

test("a blank quote builds the exact Norman Smart Release portal recipe through the visible interface", async ({
  page,
}) => {
  test.setTimeout(120_000);
  test.skip(
    !accessCode,
    "Requires QUOTE_LAB_ACCESS_CODE for the isolated preview.",
  );

  const fresh = await openFreshQuoteLab(page, accessCode as string);
  const add = addControls(page);
  await add
    .locator("button.quote-product-option")
    .filter({ hasText: "Roller Shades" })
    .click();
  await add
    .locator("button.quote-room-option")
    .filter({ hasText: /^Living Room$/ })
    .click();

  const card = page.locator(".quote-line-card");
  await expect(card).toHaveCount(1);
  await card.getByRole("button", { name: "Add Size", exact: true }).click();
  await page.getByLabel("Width in inches").fill("24");
  await page.getByLabel("Height in inches").fill("36");
  await page.getByRole("button", { name: "Use measurements", exact: true }).click();

  const productChooser = card.locator(
    '[data-testid="manufacturer-stamp"][data-catalog-chooser="product"]',
  );
  await expect(productChooser).toBeVisible({ timeout: 30_000 });
  await productChooser.click();
  await page.locator('[data-manufacturer-product-id="roller"]').click();

  const programChooser = card.getByTestId("manufacturer-program-chooser");
  await expect(programChooser).toBeVisible();
  await programChooser.click();
  await page
    .locator(
      '[data-manufacturer-program-id="roller_cordless_fabric_price_group_1_pg1"]',
    )
    .click();
  await expect(
    card.locator('[data-testid="manufacturer-stamp"][data-manufacturer="Norman"]'),
  ).toBeVisible();

  await card.getByRole("button", { name: "Inside Mount", exact: true }).click();
  await card.getByRole("combobox", { name: "Application" }).click();
  await page.getByRole("option", { name: "Single Shade", exact: true }).click();

  const fabricSearch = card.getByPlaceholder(
    "Search collection, color, or code...",
  );
  await fabricSearch.fill("F1120");
  await page
    .getByRole("button")
    .filter({ hasText: /F1120.*Pewter.*Brook/i })
    .first()
    .click();

  await card.getByRole("combobox", { name: "Top Treatment Class" }).click();
  await page
    .getByRole("option", { name: "No Top Treatment", exact: true })
    .click();

  await card
    .getByRole("button")
    .filter({ hasText: /^Lift System/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Smart Release", exact: true }).click();

  await expect(
    card.getByRole("button", { name: /Tube 1 3\/4" \(43mm\) Tube/ }),
  ).toBeVisible();
  await card.getByRole("button", { name: "Yes", exact: true }).last().click();

  await expect(card.getByLabel("Authoritative price")).toHaveValue("350", {
    timeout: 30_000,
  });
  await card.getByText("Why this price?", { exact: false }).click();
  await expect(card).toContainText("Base $254");
  await expect(card).toContainText("Fabric $0");
  await expect(card).toContainText("Accessories $7");
  await expect(card).toContainText("Operating $89");
  await expect(card).toContainText("Our cost per window");
  await expect(card).toContainText("$115.50");
  await expect(card).toContainText("Landed line cost");
  await expect(card).toContainText("$143.31");

  const wholesaleValues = card.locator('[data-wholesale-cost-value="true"]');
  expect(await wholesaleValues.count()).toBeGreaterThan(6);
  expect(
    await wholesaleValues.evaluateAll((elements) =>
      elements.every(
        (element) => getComputedStyle(element).color === "rgb(185, 28, 28)",
      ),
    ),
  ).toBe(true);
  await expect(page.getByText("Quote saved", { exact: true })).toBeVisible();

  const stateResponse = await page.request.get("/api/quote-lab/state");
  expect(stateResponse.ok()).toBe(true);
  const persisted = (await stateResponse.json()) as {
    state: {
      quotes: Array<{ quote_number: string }>;
      lineItems: Array<{ id: string }>;
      designs: Array<{
        line_item_id: string;
        supplier: string | null;
        unit_price: number;
        options_json: Record<string, unknown>;
      }>;
    };
  };
  expect(persisted.state.quotes[0].quote_number).toBe(fresh.quoteNumber);
  const lineId = persisted.state.lineItems[0].id;
  expect(persisted.state.designs).toContainEqual(
    expect.objectContaining({
      line_item_id: lineId,
      supplier: "Norman",
      unit_price: 350,
      options_json: expect.objectContaining({
        catalog_product_id: "roller",
        catalog_program_id: "roller_cordless_fabric_price_group_1_pg1",
        fabric_color_code: "F1120",
        top_treatment_class: "No Top Treatment",
        tube_class: '1 3/4" (43mm) Tube',
        shim: "Yes",
      }),
    }),
  );

  await page.reload();
  await expect(card.getByLabel("Authoritative price")).toHaveValue("350");
  await expect(
    card.locator('[data-testid="manufacturer-stamp"][data-manufacturer="Norman"]'),
  ).toBeVisible();
  await expect(card).not.toContainText("Authoritative pricing blocked");
});
