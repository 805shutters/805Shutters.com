import { expect, test } from "@playwright/test";

test.setTimeout(90_000);

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
      name: string;
      manufacturer?: string | null;
      system?: string | null;
      productType: string;
      priceBasis?: string;
      programs: Array<{
        id: string;
        name: string;
        priceBasis?: string | null;
      }>;
    }>;
  };
}

async function restoreQuoteLabState(
  page: import("@playwright/test").Page,
  state: Record<string, unknown>,
) {
  // Stop the mounted builder before restoring so a delayed autosave cannot race
  // the test cleanup on a higher-latency preview deployment.
  await page.goto("about:blank");
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const currentResponse = await page.request.get("/api/quote-lab/state");
    expect(currentResponse.ok()).toBe(true);
    const current = (await currentResponse.json()) as { revision: number };
    const restoreResponse = await page.request.put("/api/quote-lab/state", {
      data: { state, expectedRevision: current.revision },
    });
    if (restoreResponse.ok()) return;
    if (restoreResponse.status() !== 409) {
      throw new Error(
        `Quote Lab cleanup failed (${restoreResponse.status()}): ${await restoreResponse.text()}`,
      );
    }
    await page.waitForTimeout(100 * (attempt + 1));
  }
  throw new Error("Quote Lab cleanup could not obtain a stable revision.");
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
    await restoreQuoteLabState(page, original.state);
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

test("a Roller line chooses Polar and Lotus from the manufacturer stamp and persists exact catalog IDs", async ({
  page,
}) => {
  test.setTimeout(90_000);
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
  const norman = catalog.products.find((product) => product.id === "roller");
  const polar = catalog.products.find(
    (product) => product.id === "polar_interior_roller",
  );
  const lotus = catalog.products.find(
    (product) => product.id === "lotus_roller_shades",
  );
  const normanProgram = norman?.programs.find(
    (program) => program.priceBasis !== "unavailable",
  );
  const polarProgram = polar?.programs.find(
    (program) => program.priceBasis !== "unavailable",
  );
  const lotusProgram = lotus?.programs.find(
    (program) => program.priceBasis !== "unavailable",
  );
  if (
    !norman ||
    !polar ||
    !lotus ||
    !normanProgram ||
    !polarProgram ||
    !lotusProgram
  ) {
    throw new Error("The alternate Roller manufacturer fixture is incomplete.");
  }

  const fixture = structuredClone(original.state);
  const firstLine = fixture.lineItems[0];
  firstLine.product_type = "Roller Shades";
  const firstDesign =
    fixture.designs.find(
      (design) =>
        design.line_item_id === firstLine.id && design.variant === "A",
    ) ??
    fixture.designs.find((design) => design.line_item_id === firstLine.id);
  if (!firstDesign) {
    throw new Error("The alternate Roller manufacturer fixture has no design.");
  }
  fixture.selectedVariantByLine[firstLine.id] = firstDesign.variant;
  Object.assign(firstDesign, {
    product_type: "Roller Shades",
    supplier: "Norman",
    material: normanProgram.name,
    louver_size: null,
    tilt_type: null,
    hinge_color: null,
    panel_config: null,
    mount_type: null,
    shade_type: null,
    lift_system: null,
    valance: null,
    fabric: null,
    motor_type: null,
    remote_type: null,
    unit_price: 0,
    options_json: {
      quote_v2_backend: true,
      quote_v2_catalog_version:
        firstDesign.options_json?.quote_v2_catalog_version,
      quote_v2_catalog_as_of:
        firstDesign.options_json?.quote_v2_catalog_as_of,
      catalog_product_id: norman.id,
      quote_lab_product_id: norman.id,
      catalog_program_id: normanProgram.id,
      quote_lab_program_id: normanProgram.id,
      catalog_manufacturer: "Norman",
      surcharges: [],
      motorization_selections: [],
    },
  });

  const fixtureResponse = await page.request.put("/api/quote-lab/state", {
    data: { state: fixture, expectedRevision: original.revision },
  });
  expect(fixtureResponse.ok()).toBe(true);

  const persistedIdentity = async () => {
    const response = await page.request.get("/api/quote-lab/state");
    const payload = (await response.json()) as typeof original;
    const design = payload.state.designs.find(
      (candidate) =>
        candidate.line_item_id === firstLine.id &&
        candidate.variant === firstDesign.variant,
    );
    return {
      productId: design?.options_json?.catalog_product_id ?? null,
      programId: design?.options_json?.catalog_program_id ?? null,
      quoteLabProductId: design?.options_json?.quote_lab_product_id ?? null,
      quoteLabProgramId: design?.options_json?.quote_lab_program_id ?? null,
      supplier: design?.supplier ?? null,
      fabric: design?.fabric ?? null,
      motorType: design?.motor_type ?? null,
    };
  };

  try {
    await page.reload();
    const card = page.locator(`[data-quote-line-id="${firstLine.id}"]`);
    const productChooser = card.locator(
      '[data-testid="manufacturer-stamp"][data-catalog-chooser="product"]',
    );
    await expect(productChooser).toBeVisible({ timeout: 30_000 });

    await productChooser.click();
    await page
      .locator(`[data-manufacturer-product-id="${polar.id}"]`)
      .click();
    await expect(
      card.locator(
        '[data-testid="manufacturer-stamp"][data-manufacturer="Polar"]',
      ),
    ).toBeVisible();
    const programChooser = card.getByTestId("manufacturer-program-chooser");
    await expect(programChooser).toBeVisible();
    await expect(programChooser).toHaveAttribute("aria-invalid", "true");
    await expect(
      card.getByText("Authoritative pricing blocked", { exact: true }),
    ).toBeVisible();
    await expect(card).toContainText(
      "An exact catalog price program is required",
    );
    await expect.poll(persistedIdentity, { timeout: 30_000 }).toMatchObject({
      productId: polar.id,
      programId: null,
      quoteLabProductId: polar.id,
      quoteLabProgramId: null,
      supplier: "Polar",
      fabric: null,
      motorType: null,
    });

    await programChooser.click();
    await page
      .locator(`[data-manufacturer-program-id="${polarProgram.id}"]`)
      .click();
    await expect.poll(persistedIdentity, { timeout: 30_000 }).toMatchObject({
      productId: polar.id,
      programId: polarProgram.id,
      quoteLabProductId: polar.id,
      quoteLabProgramId: polarProgram.id,
      supplier: "Polar",
    });

    await productChooser.click();
    await page
      .locator(`[data-manufacturer-product-id="${lotus.id}"]`)
      .click();
    await expect(
      card.locator(
        '[data-testid="manufacturer-stamp"][data-manufacturer="Lotus"]',
      ),
    ).toBeVisible();
    await expect.poll(persistedIdentity, { timeout: 30_000 }).toMatchObject({
      productId: lotus.id,
      programId: null,
      quoteLabProductId: lotus.id,
      quoteLabProgramId: null,
      supplier: "Lotus",
    });

    await programChooser.click();
    await page
      .locator(`[data-manufacturer-program-id="${lotusProgram.id}"]`)
      .click();
    await expect.poll(persistedIdentity, { timeout: 30_000 }).toMatchObject({
      productId: lotus.id,
      programId: lotusProgram.id,
      quoteLabProductId: lotus.id,
      quoteLabProgramId: lotusProgram.id,
      supplier: "Lotus",
    });

    await page.reload();
    await expect(
      card.locator(
        '[data-testid="manufacturer-stamp"][data-manufacturer="Lotus"]',
      ),
    ).toBeVisible();
    await expect(card.getByTestId("manufacturer-program-chooser")).toBeVisible();
  } finally {
    await restoreQuoteLabState(page, original.state);
  }
});

test("Roller Cordless to Motorized reprices, persists, explains cost, and clears cleanly", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await unlockQuoteLab(page);
  const originalResponse = await page.request.get("/api/quote-lab/state");
  expect(originalResponse.ok()).toBe(true);
  const original = (await originalResponse.json()) as {
    revision: number;
    state: {
      lineItems: Array<{ id: string }>;
      designs: Array<Record<string, any>>;
      selectedVariantByLine: Record<string, string>;
    };
  };
  const fixture = structuredClone(original.state);
  const firstLine = fixture.lineItems[0];
  const firstDesign = fixture.designs.find(
    (design) => design.line_item_id === firstLine.id && design.variant === "A",
  );
  if (!firstDesign) throw new Error("The Roller motorization fixture has no design A.");
  fixture.selectedVariantByLine[firstLine.id] = "A";
  firstDesign.lift_system = "Cordless";
  firstDesign.motor_type = null;
  firstDesign.remote_type = null;
  firstDesign.options_json = {
    ...firstDesign.options_json,
    roller_application: "Single Shade",
    tube_class: "All Tubes",
    power_configuration: null,
    motorization_selections: [],
    hub_required: null,
  };

  const fixtureResponse = await page.request.put("/api/quote-lab/state", {
    data: { state: fixture, expectedRevision: original.revision },
  });
  expect(fixtureResponse.ok()).toBe(true);

  try {
    await page.reload();
    const card = page.locator(`[data-quote-line-id="${firstLine.id}"]`);
    await expect(card).toBeVisible();
    await expect(card.getByLabel("Authoritative price")).toHaveValue("246");

    await card.locator(".quote-confirmed-option-chip").filter({ hasText: "Lift SystemCordless" }).click();
    await card.getByRole("button", { name: "Motorized", exact: true }).click();
    await expect(card.getByTestId("roller-motorization-required")).toContainText(
      "Select Tube, then Motor / Power System",
    );

    await card.getByRole("combobox", { name: "Tube" }).click();
    await page.getByRole("option", { name: '2" (52mm) Tube', exact: true }).click();
    await expect(card.getByTestId("roller-motorization-required")).toContainText(
      "Select Motor / Power System",
    );
    await card.getByRole("combobox", { name: "Motor / Power System" }).click();
    await page.getByRole("option", { name: "AutoWand", exact: true }).click();

    await expect(card.getByTestId("roller-motorization-complete")).toContainText(/AutoWand/i);
    await expect(card.getByLabel("Authoritative price")).toHaveValue("370.5", {
      timeout: 30_000,
    });
    await card.getByText("Why this price?", { exact: false }).click();
    await expect(card).toContainText("Base $223.50");
    await expect(card).toContainText("Fabric $22.50");
    await expect(card).toContainText("Accessories $0");
    await expect(card).toContainText("Operating $124.50");
    await expect(card).toContainText("Actual selected grid");
    await expect(card).toContainText("$328");
    await expect(card).toContainText("AutoWand charging-kit allocation");
    await expect(card).toContainText("Manufacturer suggested retail x 0.30");
    const wholesalePanel = card.locator('[aria-label="Wholesale cost"]');
    const highlightedWholesaleCosts = wholesalePanel.locator(
      '[data-wholesale-cost-value="true"]',
    );
    await expect(highlightedWholesaleCosts.first()).toBeVisible();
    expect(await highlightedWholesaleCosts.count()).toBeGreaterThan(6);
    expect(
      await highlightedWholesaleCosts.evaluateAll((elements) =>
        elements.every(
          (element) => getComputedStyle(element).color === "rgb(185, 28, 28)",
        ),
      ),
    ).toBe(true);
    await expect(
      card.locator('[aria-label="Retail pricing"] [data-wholesale-cost-value="true"]'),
    ).toHaveCount(0);
    await expect(
      highlightedWholesaleCosts.filter({ hasText: "$124.50" }),
    ).toHaveCount(0);
    await expect(card).not.toContainText("Stored price mismatch");
    await expect(card).not.toContainText("Surcharge mismatch");
    await expect(page.getByText("Quote saved", { exact: true })).toBeVisible();

    let stateResponse = await page.request.get("/api/quote-lab/state");
    let persisted = (await stateResponse.json()) as typeof original;
    let persistedDesign = persisted.state.designs.find(
      (design) => design.line_item_id === firstLine.id && design.variant === "A",
    );
    expect(persistedDesign).toMatchObject({
      lift_system: "Motorized",
      motor_type: "Autowand",
      unit_price: 370.5,
      options_json: {
        tube_class: '2" (52mm) Tube',
        power_configuration: "AutoWand",
        motorization_selections: [{
          groupId: "autowand",
          optionId: "autowand",
          role: "base_motor",
          units: 1,
        }],
      },
    });

    await page.reload();
    await expect(card.getByLabel("Authoritative price")).toHaveValue("370.5");
    await expect(card.getByTestId("roller-motorization-complete")).toBeVisible();
    await card.locator(".quote-confirmed-option-chip").filter({ hasText: "Lift SystemMotorized" }).click();
    await card.getByRole("button", { name: "Cordless", exact: true }).click();
    await expect(card.getByLabel("Authoritative price")).toHaveValue("246", {
      timeout: 30_000,
    });
    await expect(card.getByTestId("roller-motorization-required")).toHaveCount(0);
    await expect(card.getByTestId("roller-motorization-complete")).toHaveCount(0);

    stateResponse = await page.request.get("/api/quote-lab/state");
    persisted = (await stateResponse.json()) as typeof original;
    persistedDesign = persisted.state.designs.find(
      (design) => design.line_item_id === firstLine.id && design.variant === "A",
    );
    expect(persistedDesign?.motor_type).toBeNull();
    expect(persistedDesign?.remote_type).toBeNull();
    expect(persistedDesign?.options_json).toMatchObject({
      power_configuration: null,
      motorization_selections: [],
      hub_required: null,
    });
  } finally {
    await restoreQuoteLabState(page, original.state);
  }
});

test("V2 existing-interface visual regression", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1536, height: 960 });
  await unlockQuoteLab(page);
  const originalResponse = await page.request.get("/api/quote-lab/state");
  expect(originalResponse.ok()).toBe(true);
  const original = (await originalResponse.json()) as {
    revision: number;
    state: {
      designs: Array<Record<string, any>>;
      [key: string]: unknown;
    };
  };
  const fixture = structuredClone(original.state);
  fixture.designs = fixture.designs.map((design) => ({
    ...design,
    lift_system: "Cordless",
    motor_type: null,
    remote_type: null,
    options_json: {
      ...design.options_json,
      tube_class: "All Tubes",
      power_configuration: null,
      motorization_selections: [],
      hub_required: null,
    },
  }));
  const saveResponse = await page.request.put("/api/quote-lab/state", {
    data: { state: fixture, expectedRevision: original.revision },
  });
  expect(saveResponse.ok()).toBe(true);

  try {
    await page.reload();
    await expect(page.locator(".quote-line-card-header")).toHaveCount(40);
    await expect(page.locator('[data-line-number="1"] [aria-label="Authoritative price"]')).toHaveValue("246");
    await expect(page).toHaveScreenshot("quote-lab-v2-existing-interface.png", {
      animations: "disabled",
      caret: "hide",
      fullPage: false,
      maxDiffPixelRatio: 0.01,
    });
  } finally {
    await restoreQuoteLabState(page, original.state);
  }
});
