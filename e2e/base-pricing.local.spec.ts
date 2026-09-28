import {test,expect} from '@playwright/test';
for(const [name,width,height,touch] of [['desktop',1440,1000,false],['ipad',768,1024,true]] as const){
 test.describe(name,()=>{test.use({viewport:{width,height},hasTouch:touch,isMobile:touch});
 test('all bases price, blanks persist, reload does not reprice, and incomplete motors block',async({page})=>{
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto('/e2e/fixtures/base-pricing.html');await page.getByLabel('QA width').fill('36');await page.getByLabel('QA height').fill('60');
  await expect(page.getByTestId('status')).toHaveText('Priced');
  for(const id of ['roller','roman','honeycomb','perfectsheer','citylights_aluminum','smartprivacy_faux','faux_wood','wood_blinds','synchrony_vertical','smartdrape','norman_shutters','onyx_shutters']){
   await page.getByLabel('QA product').selectOption(id);await expect(page.getByTestId('status')).toHaveText('Priced');await expect(page.getByTestId('price')).not.toHaveText('0.00');
   const state=JSON.parse(await page.getByTestId('state').textContent()||'{}');expect(state.fabric).toBeNull();expect(state.mount_type).toBeNull();expect(state.options_json.fabric_color_code).toBeUndefined();
   const document=page.getByRole('region',{name:'Prepared customer document'});await expect(document.locator('[data-quote-line-card]')).toHaveCount(1);await expect(document).not.toContainText(/assum|base_configuration|Fabric:|Color:/i);
   await expect(page.getByText('Pricing details needed',{exact:true})).toHaveCount(0);
  }
  await page.getByLabel('QA product').selectOption('perfectsheer');await expect(page.getByTestId('status')).toHaveText('Priced');await expect(page.getByRole('article',{name:'Customer configuration'})).toContainText('Continuous Cord Loop');
  await page.getByLabel('QA product').selectOption('roller');await expect(page.getByTestId('status')).toHaveText('Priced');const base=await page.getByTestId('price').textContent();
  await page.getByRole('button',{name:'Save fixture'}).click();await page.reload();await expect(page.getByTestId('price')).toHaveText(base!);await expect(page.getByTestId('writes')).toHaveText('0');
  await page.screenshot({path:`reports/quote-base-pricing/${name}-base.png`,fullPage:true});
  await page.getByRole('region',{name:'Prepared customer document'}).screenshot({path:`reports/quote-base-pricing/${name}-customer-document.png`});
  await page.getByLabel('Fabric search',{exact:true}).fill('F1484');await page.getByRole('button',{name:/F1484/}).click();
  await expect(page.getByTestId('status')).toHaveText('Priced');await expect(page.getByTestId('price')).not.toHaveText(base!);
  expect(JSON.parse(await page.getByTestId('state').textContent()||'{}').options_json.price_group).toBe('group2');
  await page.getByRole('button',{name:'Fabric Amelia: F1484 - Mist Gray',exact:true}).click();
  await expect(page.getByTestId('status')).toHaveText('Priced');await expect(page.getByTestId('price')).toHaveText(base!);
  await page.locator('button[title="Control Type: Cordless"]').click();await page.getByRole('button',{name:'Motorized',exact:true}).click();await expect(page.getByTestId('price')).toHaveText('0.00');await expect(page.getByTestId('status')).not.toHaveText('Priced');
  await page.screenshot({path:`reports/quote-base-pricing/${name}-motor.png`,fullPage:true});
 });});
}
