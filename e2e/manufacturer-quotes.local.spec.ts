import { test, expect, type Page } from "@playwright/test";

test.use({ launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } });
const read = async (page: Page) => JSON.parse(await page.getByTestId("saved-state").innerText());
const base = {
  id: "fixture-design", line_item_id: "fixture-line", variant: "A", unit_price: 0,
  material: null, louver_size: null, tilt_type: null, hinge_color: null, panel_config: null,
  mount_type: "Inside Mount", shade_type: "Single Shade", lift_system: "Cordless", valance: "No Valance",
  fabric: null, motor_type: null, remote_type: null, hard_surface_install: false,
  ladder_over_15ft: false, requires_takedown: false, notes: "Manufacturer fixture", created_at: "",
};
const line = { id: "fixture-line", quote_id: "fixture-quote", room_name: "Office", width_whole: 30,
  width_fraction: "0", height_whole: 48, height_fraction: "0", quantity: 1, sort_order: 0, created_at: "" };
for (const engine of ["current", "v1"] as const) {
  test(`${engine}: existing alternatives persist selection while locked viewing performs no write`, async ({page}, info) => {
    await localOnly(page);
    const designs = [
      {...base,id:"shutter-a",variant:"A",supplier:"Norman",product_type:"Shutters",unit_price:100,options_json:{manual_price_override:true}},
      {...base,id:"shutter-b",variant:"B",supplier:"Norman",product_type:"Shutters",unit_price:200,options_json:{manual_price_override:true}},
    ];
    await page.addInitScript(({engine,designs,item}) => {
      const key = `norman-fall-fixture-${engine}`;
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({designs,line:item,locked:false}));
    }, {engine,designs,item:{...line,product_type:"Shutters",quantity:2,selected_design_id:"shutter-a"}});
    await page.goto(`${info.project.use.baseURL}/e2e/fixtures/norman-fall.html?engine=${engine}`);
    await expect(page.getByTestId("line-total")).toHaveText("200.00");
    await page.getByRole("tab", {name:"Composite Shutters",exact:true}).click();
    await expect(page.getByTestId("selected-design")).toHaveText("shutter-b");
    await expect(page.getByTestId("line-total")).toHaveText("400.00");
    await expect(page.getByTestId("update-count")).toHaveText("1");
    await page.getByRole("button", {name:"Save fixture",exact:true}).click();
    await page.reload();
    await expect(page.getByRole("tab", {name:"Composite Shutters",exact:true})).toHaveAttribute("data-state","active");
    await expect(page.getByTestId("line-total")).toHaveText("400.00");
    await expect(page.getByTestId("update-count")).toHaveText("0");
    await page.getByLabel("Lock saved price").check();
    await page.getByRole("tab", {name:"Wood Shutters",exact:true}).click();
    await expect(page.getByRole("tab", {name:"Wood Shutters",exact:true})).toHaveAttribute("data-state","active");
    await expect(page.getByTestId("selected-design")).toHaveText("shutter-b");
    await expect(page.getByTestId("line-total")).toHaveText("400.00");
    await expect(page.getByTestId("update-count")).toHaveText("0");
  });

  test(`${engine}: opening a historical saved price performs no pricing write or new fee`, async ({page}, info) => {
    await localOnly(page);
    await seed(page, engine, {...base,supplier:"Norman",product_type:"Roller Shades",fabric:"Garden",unit_price:321.09,
      options_json:{fabric_color_collection:"Garden",fabric_color_code:"F1515",fabric_color_name:"Ecru",fabric_program_id:"roller_cordless_fabric_price_group_3_pg3"}}, {...line,product_type:"Roller Shades"});
    await page.goto(`${info.project.use.baseURL}/e2e/fixtures/norman-fall.html?engine=${engine}`);
    await expect(page.locator('button[title^="Fabric:"]')).toBeVisible();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect((await read(page)).unit_price).toBe(321.09);
    expect((await read(page)).options_json.customer_charges).toBeUndefined();
    await expect(page.getByTestId("update-count")).toHaveText("0");
    await page.reload();
    await expect(page.locator('button[title^="Fabric:"]')).toBeVisible();
    expect((await read(page)).unit_price).toBe(321.09);
    await expect(page.getByTestId("update-count")).toHaveText("0");
  });

  test(`${engine}: Lotus exact grid, split component fees, invalid height and recovery`, async ({ page }, info) => {
    await localOnly(page);
    await seed(page, engine, {
      ...base, supplier: "Lotus", product_type: "Faux Wood Blinds",
      options_json: { catalog_product_id: "lotus_faux_wood_blinds", catalog_program_id: "lotus_ftx_2in_snow_white_custom",
        product_line: "FTX", lotus_blind_count: 3, lotus_blind_1_width_inches: 31.5, lotus_blind_2_width_inches: 31.5,
        lotus_blind_3_width_inches: 31.5, slat_size: '2"', discount_percent: 10 },
    }, { ...line, product_type: "Faux Wood Blinds", width_whole: 94, width_fraction: "1/2", height_whole: 34, height_fraction: "1/4", quantity: 2 });
    await page.goto(`${info.project.use.baseURL}/e2e/fixtures/norman-fall.html?engine=${engine}`);
    await expect.poll(async () => (await read(page)).options_json.pricing_grid_width).toBe(35);
    await expect.poll(async () => (await read(page)).options_json.pricing_grid_height).toBe(36);
    await expect.poll(async () => (await read(page)).options_json.customer_charges?.eligibleUnitCount).toBe(6);
    await expect.poll(async () => (await read(page)).unit_price).toBe(299.11); // $202.35 merchandise less 10%, plus 3 x $39.
    await expect(page.getByTestId("line-total")).toHaveText("598.22");
    await expect(page.getByRole("region", { name: "Contract details" })).not.toContainText(/Pricing (Input|Source|Calculation|Dimension)|Catalog Product Id|Quote Lab/);
    await expect(page.getByRole("region", { name: "Contract details" })).toContainText("Installation: $150.00 (6 × $25)");
    await expect(page.getByRole("region", { name: "Contract details" })).toContainText("Shipping: $84.00 (6 × $14)");
    await page.getByLabel("Test height").fill("150");
    await expect.poll(async () => (await read(page)).unit_price).toBe(0);
    await expect(page.getByRole("alert").filter({hasText: /Pric|size|maximum/i}).first()).toBeVisible();
    await page.getByLabel("Test height").fill("34");
    await expect.poll(async () => (await read(page)).unit_price).toBe(299.11);
    await page.getByRole("button", {name:"Save fixture", exact:true}).click();
    await page.reload();
    await expect(page.getByTestId("update-count")).toHaveText("0");
    await expect.poll(async () => (await read(page)).unit_price).toBe(299.11);
  });

  test(`${engine}: Lotus mini blinds keep Lotus identity and their own size limits after editing`, async ({page}, info) => {
    await localOnly(page);
    await seed(page, engine, {...base, supplier:"Lotus", product_type:"Mini Blinds",
      options_json:{catalog_product_id:"lotus_mini_blinds",catalog_program_id:"lotus_amx_1in_aluminum_custom",slat_size:'1"'}},
      {...line,product_type:"Mini Blinds",width_whole:90,height_whole:72});
    await page.goto(`${info.project.use.baseURL}/e2e/fixtures/norman-fall.html?engine=${engine}`);
    await expect.poll(async () => (await read(page)).unit_price).toBeGreaterThan(39);
    const priced = (await read(page)).unit_price;
    await page.getByLabel("Lotus mount", {exact:true}).selectOption("Outside Mount");
    await expect.poll(async () => (await read(page)).mount_type).toBe("Outside Mount");
    expect((await read(page)).supplier).toBe("Lotus");
    expect((await read(page)).unit_price).toBe(priced);
    expect((await read(page)).options_json.customer_charges?.total).toBe(39);
    await page.getByLabel("Test height").fill("102");
    await expect.poll(async () => (await read(page)).unit_price).toBe(0);
    const reason = (await read(page)).options_json.pricing_block_reason;
    expect(reason).not.toBe("incomplete_pricing_configuration");
    await expect(page.getByRole("alert")).toContainText(reason);
    await page.getByLabel("Test height").fill("72");
    await expect.poll(async () => (await read(page)).unit_price).toBe(priced);
    await page.getByRole("button", {name:"Save fixture",exact:true}).click();
    await page.reload();
    await expect(page.getByTestId("update-count")).toHaveText("0");
    expect((await read(page)).supplier).toBe("Lotus");
  });

  test(`${engine}: Sundance identity is retained and unavailable pricing cannot use Norman`, async ({page}, info) => {
    await localOnly(page);
    await seed(page, engine, {...base, supplier:"Sundance",product_type:"Faux Wood Blinds", options_json:{catalog_product_id:"sundance_advantage_ii_2_5",catalog_program_id:"sundance_advantage_ii_2_5_p4_t1"}}, {...line,product_type:"Faux Wood Blinds"});
    await page.goto(`${info.project.use.baseURL}/e2e/fixtures/norman-fall.html?engine=${engine}`);
    await expect(page.getByTestId("manual-quoting-only")).toContainText("Sundance automation stopped");
    await expect.poll(async () => (await read(page)).unit_price).toBe(0);
    expect((await read(page)).supplier).toBe("Sundance");
    await expect(page.getByTestId("manual-quoting-only")).toContainText("Current account factors, retail/net exceptions");
    await expect(page.getByTestId("manual-quoting-only")).not.toContainText("Polar");
    await page.getByLabel("Test width", {exact:true}).fill("48");
    await expect.poll(async () => (await read(page)).unit_price).toBe(0);
    expect((await read(page)).options_json.catalog_program_id).toBe("sundance_advantage_ii_2_5_p4_t1");
  });

  test(`${engine}: Polar source-only family retains identity and blocks invented prices`, async ({page}, info) => {
    await localOnly(page);
    await seed(page, engine, {...base,supplier:"Polar",product_type:"Tension Shades",options_json:{catalog_product_id:"polar_tension_shade"}}, {...line,product_type:"Tension Shades"});
    await page.goto(`${info.project.use.baseURL}/e2e/fixtures/norman-fall.html?engine=${engine}`);
    await expect(page.getByTestId("manual-quoting-only")).toContainText("Polar automation stopped");
    await expect.poll(async () => (await read(page)).unit_price).toBe(0);
    expect((await read(page)).supplier).toBe("Polar");
  });

  test(`${engine}: Onyx incomplete frame configuration blocks a customer price`, async ({page}, info) => {
    await localOnly(page);
    await seed(page, engine, {...base,supplier:"Onyx",product_type:"Shutters",material:"Onyx U.S. Made Vinyl",options_json:{catalog_product_id:"onyx_shutters",catalog_program_id:"onyx_us_made_vinyl",size_type:"Window Size",onyx_mount:"Outside Mount"}}, {...line,product_type:"Shutters"});
    await page.goto(`${info.project.use.baseURL}/e2e/fixtures/norman-fall.html?engine=${engine}`);
    await page.getByLabel("Test width", {exact:true}).fill("31");
    await expect(page.getByRole("alert").filter({hasText:/frame|pricing|source/i}).first()).toBeVisible();
    await expect.poll(async () => (await read(page)).unit_price).toBe(0);
    expect((await read(page)).supplier).toBe("Onyx");
    expect((await read(page)).options_json.customer_charges).toBeFalsy();
  });
}
async function localOnly(page: Page) {
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    return url.hostname === "127.0.0.1" && !url.pathname.startsWith("/api/") ? route.continue() : route.abort();
  });
}
async function seed(page: Page, engine: string, design: object, item: object) {
  await page.addInitScript(({engine,design,item}) => {
    const key = `norman-fall-fixture-${engine}`;
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({design,line:item,locked:false}));
  }, {engine,design,item});
}
