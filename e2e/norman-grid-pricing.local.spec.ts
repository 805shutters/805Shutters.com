import {test,expect,type Page} from '@playwright/test';
test.use({launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}});
const saved=async(page:Page)=>JSON.parse(await page.getByTestId('persisted-state').innerText());
test('Norman grids automatically price saved selections and preserve manual price, reopen and deletion',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>{errors.push(error.message);console.error(error.message)});
 await page.route('**/*',route=>['localhost','127.0.0.1'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
 await page.goto('/e2e/fixtures/norman-grid-pricing.html?case=automatic&conflict=1');
 await expect(page.getByRole('button',{name:'Add Size',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Add Size',exact:true}).click();
 await page.getByLabel('width whole inches',{exact:true}).fill('36');
 await page.getByRole('button',{name:'1/2',exact:true}).click();
 await page.getByRole('button',{name:'Next: height',exact:true}).click();
 await page.getByLabel('height whole inches',{exact:true}).fill('60');
 await page.getByRole('button',{name:'1/4',exact:true}).click();
 await page.getByRole('button',{name:'Save size',exact:true}).click();
 await expect(page.getByRole('dialog')).not.toBeVisible();
 // Norman PG2 source grid: width42 x height72 = $467; $25 installation + $14 shipping.
 await expect.poll(async()=>(await saved(page)).sales_quote_designs[0].unit_price).toBe(506);
 await expect.poll(async()=>(await saved(page)).sales_quotes[0].total_amount).toBe(506);
 const count=await page.getByTestId('pricing-request-count').innerText();expect(Number(count)).toBeGreaterThanOrEqual(2);await page.waitForTimeout(1200);
 expect(await page.getByTestId('pricing-request-count').innerText()).toBe(count);
 await page.getByRole('button',{name:'Valance No Valance',exact:true}).click();
 await page.getByRole('combobox',{name:'Valance',exact:true}).click();
 await page.getByRole('option',{name:'Square Fascia*',exact:true}).click();
 // Width 42 fascia ladder adds $139 to the same $467 source grid.
 await expect.poll(async()=>(await saved(page)).sales_quote_designs[0].unit_price).toBe(645);
 await expect(page.getByTitle('Automatic Option Surcharges',{exact:true})).not.toBeVisible();
 await expect(page.getByText(/Base: \$0 \+ Add-ons:/)).not.toBeVisible();
 await expect(page.getByRole('button',{name:'Add Surcharge',exact:true})).toBeVisible();
 await page.getByLabel('Quantity for Kitchen').fill('3');await page.getByLabel('Quantity for Kitchen').press('Tab');
 await expect.poll(async()=>(await saved(page)).sales_quotes[0].total_amount).toBe(1935);
 await expect.poll(async()=>(await saved(page)).sales_quote_designs[0].options_json.authoritative_price_breakdown.quantity).toBe(3);
 await expect(page.getByText('Installation: $75.00 (3 × $25)',{exact:true})).toBeVisible();
 await expect(page.getByRole('complementary',{name:'Contract Total $1,935.00',exact:true})).toBeVisible();
 await expect(page.getByText('$1,935.00 line total · excl. tax',{exact:true})).toBeVisible();
 await page.screenshot({path:'test-results/norman-grid-auto-priced.png',fullPage:false});
 await page.getByRole('button',{name:'Edit price for Kitchen',exact:true}).click();
 await page.getByLabel('Custom merchandise price each for Kitchen',{exact:true}).fill('123.45');
 await page.getByRole('button',{name:'Save price for Kitchen',exact:true}).click();
 await expect.poll(async()=>(await saved(page)).sales_quote_designs[0].options_json.manual_price_override).toBe(true);
 await expect.poll(async()=>(await saved(page)).sales_quotes[0].total_amount).toBe(487.35);
 await page.reload();
 await expect(page.getByLabel('Custom merchandise price each for Kitchen',{exact:true})).toHaveValue('123.45');
 expect((await saved(page)).sales_quote_designs[0].unit_price).toBe(162.45);
 await page.waitForTimeout(750);expect(await page.getByTestId('pricing-request-count').innerText()).toBe('0');
 await page.screenshot({path:'test-results/norman-grid-manual-reopened.png',fullPage:false});
 await page.setViewportSize({width:390,height:844});
 await page.getByLabel('Custom merchandise price each for Kitchen',{exact:true}).scrollIntoViewIfNeeded();
 await page.screenshot({path:'test-results/norman-grid-manual-mobile.png',fullPage:false});
 await page.getByTitle('Delete line item',{exact:true}).click();
 await expect.poll(async()=>(await saved(page)).sales_quote_line_items[0].archived_at).toBeTruthy();
 await expect.poll(async()=>(await saved(page)).sales_quotes[0].total_amount).toBe(0);
 expect(errors).toEqual([]);
});


test('server-priced standalone Palladian shelf does not request paired-product pricing details',async({page})=>{
 await page.route('**/*',route=>['localhost','127.0.0.1'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
 await page.goto('/e2e/fixtures/norman-grid-pricing.html?case=palladian&product=palladian_shelf');
 await expect(page.getByRole('complementary',{name:'Contract Total $450.00',exact:true})).toBeVisible();
 await expect(page.getByText('Pricing details needed',{exact:true})).not.toBeVisible();
 await expect(page.getByText(/The paired-product price requires/)).not.toBeVisible();
 expect((await saved(page)).sales_quote_line_items[0].height_whole).toBe(0);
 await expect(page.getByRole('button',{name:'Edit price for Kitchen',exact:true})).toBeVisible();
});
