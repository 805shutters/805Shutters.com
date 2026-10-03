import {test,expect} from '@playwright/test';
for(const width of [390,820,1440])test.describe(`${width}px sender payment terms`,()=>{
 test.use({viewport:{width,height:1000}});
 test('previews terms in Send and saves them before the synthetic delivery',async({page})=>{
  const posts:{url:string;body:Record<string,unknown>}[]=[];
  await page.route('**/api/crm/sales-quotes/synthetic-sender/v2/delivery',r=>r.fulfill({json:{enabled:true,native:true,canSend:true,supportsQuoteSelection:true}}));
  await page.route('**/api/crm/sales-quotes/synthetic-sender/payment-schedule/',async r=>{posts.push({url:r.request().url(),body:r.request().postDataJSON()});await r.fulfill({json:{quoteId:'synthetic-sender',revision:2}});});
  await page.route('**/api/crm/sales-quotes/synthetic-sender/send',async r=>{posts.push({url:r.request().url(),body:r.request().postDataJSON()});await r.fulfill({json:{email:{sent:true},sms:{sent:true}}});});
  await page.goto('/e2e/fixtures/send-payment-schedule.html');
  const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'In-house 3-month payments',exact:true}).click();
  await expect(dialog.getByText('$951.71',{exact:true})).toHaveCount(2);await expect(dialog.getByText('$951.72',{exact:true})).toBeVisible();
  const headings=await dialog.locator('h3').allTextContents();expect(headings.slice(0,3)).toEqual(['Quotes to send','Payment terms','Delivery']);
  await expect(dialog.getByRole('button',{name:'Save payment terms'})).toHaveCount(0);
  expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await expect(dialog.getByRole('button',{name:'In-house 3-month payments',exact:true})).toHaveCSS('background-color','rgb(0, 0, 0)');
  await dialog.getByText('Payment terms',{exact:true}).scrollIntoViewIfNeeded();
  await page.screenshot({path:`output/in-house-payments/sender-${width}.png`});
  await dialog.getByRole('button',{name:'Standard payments',exact:true}).click();await expect(dialog.getByText('$951.72',{exact:true})).toHaveCount(0);
  await dialog.getByRole('button',{name:'In-house 3-month payments',exact:true}).click();await dialog.getByRole('button',{name:'Send Email + Text',exact:true}).click();
  await expect(dialog).toHaveCount(0);expect(posts).toHaveLength(2);expect(posts[0].body).toMatchObject({schedule:'in_house_three_month_v1',revision:1});expect(posts[1].body).toMatchObject({expectedRevision:2,selectedQuoteRevisions:{'synthetic-sender':2}});
 });
 test('cancel leaves saved terms and delivery untouched',async({page})=>{
  let writes=0;await page.route('**/api/**',r=>{if(r.request().method()==='POST')writes++;return r.fulfill({json:{enabled:true,native:true,canSend:true,supportsQuoteSelection:true}});});
  await page.goto('/e2e/fixtures/send-payment-schedule.html');await page.getByRole('button',{name:'In-house 3-month payments',exact:true}).click();await page.getByRole('button',{name:'Cancel',exact:true}).click();expect(writes).toBe(0);
 });
});
