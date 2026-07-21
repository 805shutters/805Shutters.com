import { expect, test } from "@playwright/test";

const accessCode = process.env.QUOTE_LAB_ACCESS_CODE;
const productCategories = [
  "Shutters",
  "Roller Shades",
  "Roman Shades",
  "Honeycomb Shades",
  "Sheer Shades",
  "Mini Blinds",
  "Faux Wood Blinds",
  "Wood Blinds",
  "Vertical Blinds",
  "Smart Drapes",
  "Drapery Tracks",
  "Tension Shades",
  "Retractable Screens",
  "Awnings",
  "Vinyl Blinds",
] as const;
const roomPresets = [
  "Living Room",
  "Family Room",
  "Dining Room",
  "Kitchen",
  "Breakfast Nook",
  "Hall",
  "Foyer",
  "Primary Bedroom",
  "Primary Bathroom",
  "Bedroom 1",
  "Bedroom 2",
  "Bedroom 3",
  "Guest Room",
  "Nursery",
  "Stair",
  "Loft",
  "Office",
  "Gym",
  "Garage",
  "Closet",
] as const;

async function unlockQuoteLab(page: import("@playwright/test").Page) {
  test.skip(
    !accessCode,
    "Requires QUOTE_LAB_ACCESS_CODE for the isolated preview.",
  );
  const response = await page.request.post("/api/quote-lab/access", {
    data: { code: accessCode },
  });
  expect(response.ok()).toBe(true);
  await page.goto("/quote-lab");
  await expect(
    page.locator('[data-quote-lab-interface="exact-existing-builder"]'),
  ).toBeVisible({ timeout: 60_000 });
}

async function loadProtectedCatalog(page: import("@playwright/test").Page) {
  const response = await page.request.get("/api/quote-lab/catalog");
  expect(response.ok()).toBe(true);
  return (await response.json()) as {
    products: Array<{
      id: string;
      manufacturer?: string | null;
      productType: string;
      priceBasis?: string;
      programs: Array<{ id: string }>;
    }>;
  };
}

function productCategoryButton(
  page: import("@playwright/test").Page,
  addControls: import("@playwright/test").Locator,
  category: string,
) {
  return addControls.locator("button.quote-product-option").filter({
    has: page.getByText(category, { exact: true }),
  });
}

test("V2 preserves the existing workspace, real room presets, and 40-line capacity", async ({
  page,
}) => {
  await unlockQuoteLab(page);

  const addControls = page.locator('[aria-label="Add quote line item"]');
  const productButtons = addControls.locator("button.quote-product-option");
  await expect(productButtons).toHaveCount(productCategories.length);
  expect(
    await productButtons.locator(":scope > span:first-child").allTextContents(),
  ).toEqual([...productCategories]);
  const roomButtons = addControls.locator("button.quote-room-option");
  await expect(roomButtons).toHaveCount(roomPresets.length + 1);
  expect(
    await roomButtons.locator(":scope > span:first-child").allTextContents(),
  ).toEqual([...roomPresets]);
  await expect(roomButtons.filter({ hasText: /^Room \d+/ })).toHaveCount(0);
  await expect(roomButtons.filter({ hasText: "Custom" })).toHaveCount(1);

  await expect(page.locator(".quote-line-card-header")).toHaveCount(40);
  await expect(
    page.locator(".quote-line-card-size + .quote-line-manufacturer-stamp"),
  ).toHaveCount(40);
  await expect(
    page.locator(
      '[data-testid="manufacturer-stamp"][data-manufacturer="Norman"]',
    ),
  ).toHaveCount(40);
  await page.getByRole("button", { name: "Stack" }).first().click();
  await expect(
    page.locator(
      '[data-testid="stacked-manufacturer-stamp"][data-manufacturer="Norman"]',
    ),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: /^Unstack line #1, Living Room$/ })
    .click();
  await expect(page.locator(".quote-line-card-header")).toHaveCount(40);
  expect(
    await roomButtons.evaluateAll((buttons) =>
      buttons.every((button) => button.hasAttribute("disabled")),
    ),
  ).toBe(true);
  await expect(page.getByTestId("quote-lab-catalog-controls")).toHaveCount(0);
  await expect(page.getByTestId("manufacturer-comparison-panel")).toHaveCount(
    0,
  );
  await expect(
    page.getByText("Ephemeral Test Quote", { exact: true }),
  ).toHaveCount(0);

  const stateResponse = await page.request.get("/api/quote-lab/state");
  expect(stateResponse.ok()).toBe(true);
  const persisted = (await stateResponse.json()) as {
    state: { lineItems: Array<{ id: string; quantity: number }> };
    revision: number;
  };
  expect(persisted.state.lineItems).toHaveLength(40);

  const rejected = await page.request.put("/api/quote-lab/state", {
    data: {
      expectedRevision: persisted.revision,
      state: {
        ...persisted.state,
        lineItems: [
          ...persisted.state.lineItems,
          {
            ...persisted.state.lineItems[0],
            id: "quote-lab-rejected-line-41",
            quantity: 1,
          },
        ],
      },
    },
  });
  expect(rejected.status()).toBe(400);
  await expect(rejected.json()).resolves.toMatchObject({
    error: expect.stringContaining("40 line items"),
  });
});

test("manufacturer stamp follows the persisted selected design after reload and stacking", async ({
  page,
}) => {
  await unlockQuoteLab(page);
  const originalResponse = await page.request.get("/api/quote-lab/state");
  expect(originalResponse.ok()).toBe(true);
  const original = (await originalResponse.json()) as {
    revision: number;
    state: {
      lineItems: Array<{ id: string; product_type: string }>;
      designs: Array<Record<string, any>>;
      selectedVariantByLine: Record<string, string>;
    };
  };
  const catalog = await loadProtectedCatalog(page);
  const norman = catalog.products.find(
    (product) => product.id === "norman_shutters",
  );
  const onyx = catalog.products.find(
    (product) => product.id === "onyx_shutters",
  );
  expect(norman?.programs[0]?.id).toBeTruthy();
  expect(onyx?.programs[0]?.id).toBeTruthy();

  const changed = structuredClone(original.state);
  const firstLine = changed.lineItems[0];
  const originalDesign = changed.designs.find(
    (design) => design.line_item_id === firstLine.id,
  );
  if (!originalDesign || !norman?.programs[0] || !onyx?.programs[0]) {
    throw new Error("The selected-manufacturer fixture could not be prepared.");
  }
  firstLine.product_type = "Shutters";
  const normanDesign = {
    ...originalDesign,
    id: "quote-lab-selected-norman-a",
    variant: "A",
    product_type: "Shutters",
    supplier: "Norman",
    material: norman.programs[0].id,
    options_json: {
      ...originalDesign.options_json,
      quote_lab_product_id: "norman_shutters",
      quote_lab_program_id: norman.programs[0].id,
      catalog_program_id: norman.programs[0].id,
      catalog_manufacturer: "Norman",
    },
  };
  const onyxDesign = {
    ...normanDesign,
    id: "quote-lab-selected-onyx-c",
    variant: "C",
    supplier: "Onyx",
    material: onyx.programs[0].id,
    options_json: {
      ...normanDesign.options_json,
      quote_lab_product_id: "onyx_shutters",
      quote_lab_program_id: onyx.programs[0].id,
      catalog_program_id: onyx.programs[0].id,
      catalog_manufacturer: "Onyx",
    },
  };
  changed.designs = [
    ...changed.designs.filter(
      (design) => design.line_item_id !== firstLine.id,
    ),
    normanDesign,
    onyxDesign,
  ];
  changed.selectedVariantByLine[firstLine.id] = "C";

  const saveResponse = await page.request.put("/api/quote-lab/state", {
    data: { state: changed, expectedRevision: original.revision },
  });
  expect(saveResponse.ok()).toBe(true);

  try {
    await page.reload();
    await expect(
      page.locator(
        '[data-testid="manufacturer-stamp"][data-manufacturer="Onyx"]',
      ).first(),
    ).toBeVisible();
    await page.getByRole("button", { name: "Stack" }).first().click();
    await expect(
      page.locator(
        '[data-testid="stacked-manufacturer-stamp"][data-manufacturer="Onyx"]',
      ),
    ).toHaveCount(1);
    await expect(page.getByText("Quote saved", { exact: true })).toBeVisible();
  } finally {
    const currentResponse = await page.request.get("/api/quote-lab/state");
    const current = (await currentResponse.json()) as { revision: number };
    const restoreResponse = await page.request.put("/api/quote-lab/state", {
      data: { state: original.state, expectedRevision: current.revision },
    });
    expect(restoreResponse.ok()).toBe(true);
  }
});

test("V2 mobile builder has no document overflow and keeps every product category visible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await unlockQuoteLab(page);

  const workspace = page.locator(
    '[data-quote-lab-interface="exact-existing-builder"]',
  );
  const addControls = workspace.locator('[aria-label="Add quote line item"]');
  for (const category of productCategories) {
    await expect(
      productCategoryButton(page, addControls, category),
    ).toBeVisible();
  }

  await productCategoryButton(
    page,
    addControls,
    "Vinyl Blinds",
  ).scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  ).toBe(0);
});

test("V2 customer quote projection excludes every internal cost and margin field", async ({
  page,
}) => {
  await unlockQuoteLab(page);

  const stateResponse = await page.request.get("/api/quote-lab/state");
  expect(stateResponse.ok()).toBe(true);
  const persisted = (await stateResponse.json()) as {
    state: {
      lineItems: unknown[];
      designs: unknown[];
      selectedVariantByLine: Record<string, string>;
    };
  };

  const repricedResponse = await page.request.post(
    "/api/quote-lab/reprice-exact",
    {
      data: {
        lines: persisted.state.lineItems,
        designs: persisted.state.designs,
        selectedVariantByLine: persisted.state.selectedVariantByLine,
      },
    },
  );
  expect(repricedResponse.ok()).toBe(true);
  const repriced = (await repricedResponse.json()) as {
    quote: {
      backend: string;
      total: number;
      customerQuote: {
        total: number;
        sendable: boolean;
        lines: unknown[];
      };
    };
  };

  expect(repriced.quote.backend).toBe("v2");
  expect(repriced.quote.customerQuote.total).toBe(repriced.quote.total);
  expect(repriced.quote.customerQuote.lines).toHaveLength(40);
  expect(JSON.stringify(repriced.quote.customerQuote)).not.toMatch(
    /wholesale|internalCost|costSummary|costStatus|landed|freight|oversize|dealer|multiplier|margin/i,
  );
});

test("Polar and Lotus stay available through familiar categories and the protected catalog", async ({
  page,
}) => {
  await unlockQuoteLab(page);

  const addControls = page.locator('[aria-label="Add quote line item"]');
  const polarCategory = productCategoryButton(
    page,
    addControls,
    "Drapery Tracks",
  );
  const lotusCategory = productCategoryButton(
    page,
    addControls,
    "Vinyl Blinds",
  );

  // These selections use the unchanged add-line workflow and do not write a
  // line because the isolated acceptance fixture is already at its 40-line cap.
  await polarCategory.click();
  await expect(polarCategory).toHaveClass(/quote-product-option--selected/);
  await lotusCategory.click();
  await expect(lotusCategory).toHaveClass(/quote-product-option--selected/);
  await expect(polarCategory).not.toHaveClass(/quote-product-option--selected/);

  const catalog = await loadProtectedCatalog(page);
  const products = new Map(
    catalog.products.map((product) => [product.id, product]),
  );
  const expectedProducts = [
    ["polar_interior_roller", "Polar", "Roller Shades", "suggested_retail", 1],
    ["polar_drapery_track", "Polar", "Drapery Tracks", "suggested_retail", 1],
    ["polar_tension_shade", "Polar", "Tension Shades", "manual_required", 0],
    [
      "polar_all_seasons_screen",
      "Polar",
      "Retractable Screens",
      "dealer_net",
      1,
    ],
    ["polar_awning_premium_pro", "Polar", "Awnings", "suggested_retail", 1],
    ["lotus_vinyl_blinds", "Lotus", "Vinyl Blinds", "dealer_net", 1],
    ["lotus_mini_blinds", "Lotus", "Mini Blinds", "dealer_net", 1],
    ["lotus_faux_wood_blinds", "Lotus", "Faux Wood Blinds", "dealer_net", 1],
    ["lotus_roller_shades", "Lotus", "Roller Shades", "dealer_net", 1],
    ["lotus_vertical_blinds", "Lotus", "Vertical Blinds", "dealer_net", 1],
  ] as const;

  for (const [
    id,
    manufacturer,
    productType,
    priceBasis,
    minimumPrograms,
  ] of expectedProducts) {
    expect(products.get(id), id).toMatchObject({
      id,
      manufacturer,
      productType,
      priceBasis,
      programs: expect.any(Array),
    });
    expect(
      products.get(id)?.programs.length,
      `${id} programs`,
    ).toBeGreaterThanOrEqual(minimumPrograms);
  }

  expect(products.get("polar_tension_shade")?.programs).toHaveLength(0);

  // The protected catalog proves availability without bringing the retired
  // manufacturer-comparison controls back into the familiar builder.
  await expect(page.getByTestId("manufacturer-comparison-panel")).toHaveCount(
    0,
  );
  await expect(page.getByTestId("quote-lab-catalog-controls")).toHaveCount(0);
});

test("V2 existing-interface visual regression", async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 960 });
  await unlockQuoteLab(page);
  await expect(page.locator(".quote-line-card-header")).toHaveCount(40);
  await expect(page).toHaveScreenshot("quote-lab-v2-existing-interface.png", {
    animations: "disabled",
    caret: "hide",
    fullPage: false,
    maxDiffPixelRatio: 0.01,
  });
});
