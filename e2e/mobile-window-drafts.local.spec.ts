import { test, expect, type BrowserContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';

test.use({ launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } });
const fixture = '/e2e/fixtures/mobile-window-drafts.html';
type Row = Record<string, any>;

// Shared server-side state survives closing one browser and opening an independent device context.
function backend() {
  const tables: Record<string, Row[]> = { sales_quotes: [], sales_quote_line_items: [], sales_quote_designs: [] };
  const photos: Row[] = [];
  const images = new Map<string, Buffer>();
  const requests = new Map<string, unknown>();
  const counts = { creates: 0, structures: 0, uploads: 0 };
  let failUpload = true;
  const snake = (patch: Row) => Object.fromEntries(Object.entries(patch).map(([key,value]) => [key.replace(/[A-Z]/g,c=>'_'+c.toLowerCase()),value]));
  async function connect(context: BrowserContext) {
    await context.route('**/*', async route => {
      const req = route.request();
      const url = new URL(req.url());
      if (url.hostname !== '127.0.0.1') throw new Error(`Unexpected external request: ${url.origin}`);
      const path = url.pathname.replace(/\/$/, '');
      const reply = (json: unknown,status=200) => route.fulfill({status,json});
      if (path === '/__window_drafts__/query') {
        const { table,filters,one } = req.postDataJSON();
        const rows = (tables[table] || []).filter(row => filters.every((f:Row) => f.operator === 'in' ? f.value.includes(row[f.key]) : f.operator === 'is' ? (row[f.key] ?? null) === f.value : row[f.key] === f.value));
        return reply({data:one ? rows[0] ?? null : rows,error:null});
      }
      if (path.startsWith('/__window_drafts__/photo/')) return route.fulfill({contentType:'image/jpeg',body:images.get(path)!});
      if (!path.startsWith('/api/')) return route.continue();
      if (path.includes('catalog')) return reply({products:[]});
      if ((path.includes('calendar') || path.endsWith('/appointments'))) return reply({appointments:[]});
      if ((path.includes('delivery-capability') || path.endsWith('/v2/delivery'))) return reply({schemaVersion:1,enabled:true,native:true,canSend:false,reason:'Selections incomplete'});
      if (path.endsWith('quote-photos')) {
        if (req.method() === 'GET') return reply({photos});
        counts.uploads++;
        if (failUpload) { failUpload=false; return reply({message:'Test upload interrupted'},503); }
        const form = await new Request(req.url(),{method:'POST',headers:req.headers(),body:new Uint8Array(req.postDataBuffer()!)}).formData();
        const photoId = String(form.get('photoId'));
        if (!photos.some(photo=>photo.photoId === photoId)) {
          const url = `/__window_drafts__/photo/${photoId}`;
          const file = form.get('file') as File;
          images.set(url,Buffer.from(await file.arrayBuffer()));
          photos.push({photoId,quoteId:form.get('quoteId'),lineItemId:form.get('lineItemId'),url,mimeType:file.type,size:file.size});
        }
        return reply({photo:photos.find(photo=>photo.photoId===photoId)});
      }
      const body = req.postDataJSON() as Row;
      if (path === '/api/crm/sales-quotes/v2' && req.method() === 'POST') {
        if (requests.has(body.idempotencyKey)) return reply(requests.get(body.idempotencyKey));
        counts.creates++;
        const quoteId = randomUUID();
        tables.sales_quotes.push({id:quoteId,quote_number:'LOCAL-DRAFT',customer_name:body.customerName,status:'draft',quote_v2_backend:true,quote_v2_revision:1,quote_v2_status:'draft',total_amount:0,quote_letter:'A',quote_group_id:quoteId,account_id:'fixture'});
        const response = {backend:'authoritative_v2',quoteId,quoteNumber:'LOCAL-DRAFT',revision:1,status:'draft',quoteV2Status:'draft',lineCount:0};
        requests.set(body.idempotencyKey,response); return reply(response);
      }
      if (path.endsWith('/v2/structure')) {
        if (requests.has(body.idempotencyKey)) return reply(requests.get(body.idempotencyKey));
        const quote = tables.sales_quotes[0];
        if (quote.quote_v2_revision !== body.expectedRevision) return reply({message:'Revision conflict'},409);
        counts.structures++;
        for (const op of body.operations) {
          if (op.type === 'line.create') tables.sales_quote_line_items.push({id:op.lineItemId,quote_id:quote.id,selected_design_id:null,...snake(op.patch)});
          else if (op.type === 'line.update') Object.assign(tables.sales_quote_line_items.find(line=>line.id===op.lineItemId)!,snake(op.patch));
          else if (op.type === 'design.upsert') {
            const design = {id:op.designId || randomUUID(),line_item_id:op.lineItemId,variant:op.variant,unit_price:0,...snake(op.patch)};
            tables.sales_quote_designs.push(design);
            if (op.selectDesign) tables.sales_quote_line_items.find(line=>line.id===op.lineItemId)!.selected_design_id=design.id;
          } else throw new Error(`Unexpected operation ${op.type}`);
        }
        quote.quote_v2_revision++; quote.quote_v2_status='stale';
        const response = {backend:'authoritative_v2',quoteId:quote.id,revision:quote.quote_v2_revision,status:'draft',quoteV2Status:'stale',lineCount:tables.sales_quote_line_items.length,selectedDesigns:Object.fromEntries(tables.sales_quote_line_items.map(line=>[line.id,line.selected_design_id])),operations:body.operations};
        requests.set(body.idempotencyKey,response);return reply(response);
      }
      if (path.endsWith('/v2/price')) return reply({message:'Complete product selections before pricing.'},422);
      throw new Error(`Unhandled local API ${req.method()} ${path}`);
    });
  }
  return {connect,tables,photos,counts};
}

test('dimensions and photos survive interrupted save, app closure, independent device reopen and later product assignment', async ({page,context,browser}) => {
  test.setTimeout(120_000);
  const server=backend(); await server.connect(context);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:390,height:844});
  await page.goto(fixture);
  await page.getByRole('button',{name:'Add Quote',exact:true}).click();
  await page.getByRole('button',{name:'Enter a new contact'}).click();
  await page.getByLabel('Name',{exact:true}).fill('Local unfinished windows');
  await page.getByRole('button',{name:'Start measuring'}).click();
  // Generate a distinct photo for each window, passed through the real compression and IndexedDB code.
  for (const [index,width,height,fraction] of [[1,36,60,'1/16'],[2,48,72,'15/16']] as const) {
    await page.getByLabel('width whole inches',{exact:true}).fill(String(width));
    await page.getByRole('group',{name:'width fractions',exact:true}).getByRole('button',{name:fraction,exact:true}).click();
    await page.getByRole('button',{name:/^height /i}).click();
    await page.getByLabel('height whole inches',{exact:true}).fill(String(height));
    const png=await page.evaluate((n)=>{ const c=document.createElement('canvas'); c.width=320;c.height=240;const x=c.getContext('2d')!;x.fillStyle=n===1?'#8ca6bd':'#c8b499';x.fillRect(0,0,320,240);x.fillStyle='#fff';x.fillRect(70,20,180,200);x.fillStyle='#486475';x.fillRect(80,30,160,180);x.fillStyle='#fff';x.fillRect(155,30,10,180);x.fillRect(80,115,160,10);return c.toDataURL().split(',')[1];},index);
    await page.locator('input[type=file]').last().setInputFiles({name:`window-${index}.png`,mimeType:'image/png',buffer:Buffer.from(png,'base64')});
    await expect(page.getByRole('button',{name:'Save window & next',exact:true})).toBeEnabled();
    await page.getByRole('button',{name:'Save window & next',exact:true}).click();
  }
  await page.getByRole('button',{name:'Review all',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Window 1',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Window 2',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Window 3',exact:true})).toHaveCount(0);
  await expect(page.getByRole('img',{name:'window-1.jpg',exact:true})).toBeVisible();
  await expect.poll(()=>page.getByRole('img',{name:'window-1.jpg',exact:true}).evaluate(img=>(img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.screenshot({path:'test-results/window-draft-phone-review.png',fullPage:true});
  await context.setOffline(true);
  await expect(page.getByText('Reconnect to submit. Your draft remains available offline.')).toBeVisible();
  await expect(page.getByRole('button',{name:'Save draft quote',exact:true})).toBeDisabled();
  await context.setOffline(false);
  await expect(page.getByRole('button',{name:'Save draft quote',exact:true})).toBeEnabled();
  // A duplicate click event cannot launch a second submission while the first is in flight.
  await page.getByRole('button',{name:'Save draft quote',exact:true}).evaluate(button=>{(button as HTMLButtonElement).click();(button as HTMLButtonElement).click();});
  await expect(page.getByRole('alert')).toContainText('Quote save is pending');
  expect(server.counts).toEqual({creates:1,structures:1,uploads:1});
  expect(server.photos).toHaveLength(0);
  await page.reload();
  await page.getByRole('button',{name:/Local unfinished windows/}).click();
  await page.getByRole('button',{name:/Retry/}).click();
  await expect(page.getByRole('heading',{name:'Quote saved',exact:true})).toBeVisible();
  expect(server.counts).toEqual({creates:1,structures:1,uploads:3});
  expect(server.tables.sales_quote_designs).toHaveLength(0);
  const lines=structuredClone(server.tables.sales_quote_line_items);
  expect(lines.map(line=>[line.room_name,line.width_whole,line.width_fraction,line.height_whole,line.product_type])).toEqual([['Window 1',36,'1/16',60,''],['Window 2',48,'15/16',72,'']]);
  expect(server.photos.map(photo=>photo.lineItemId)).toEqual(lines.map(line=>line.id));
  expect(errors).toEqual([]);
  await page.close();
  const device=await browser.newContext({viewport:{width:820,height:1180}});await server.connect(device);
  const reopened=await device.newPage();reopened.on('pageerror',e=>errors.push(e.message));
  await reopened.goto(`${fixture}?quote=${server.tables.sales_quotes[0].id}`);
  await expect(reopened.getByRole('button',{name:'Choose product',exact:true})).toHaveCount(2);
  await expect(reopened.getByRole('img',{name:'Window reference 1'})).toHaveCount(2);
  await expect.poll(()=>reopened.getByRole('img',{name:'Window reference 1'}).evaluateAll(images=>images.every(img=>(img as HTMLImageElement).naturalWidth>0))).toBe(true);
  await expect(reopened.getByRole('button',{name:'36 1/16" × 60"',exact:true})).toBeVisible();
  await reopened.screenshot({path:'test-results/window-draft-ipad-builder.png',fullPage:true});
  await reopened.getByRole('button',{name:'Test contract view',exact:true}).click();
  const contract=reopened.getByRole('region',{name:'Unfinished contract draft'});
  await expect(contract).toBeVisible();
  await expect(contract.getByText('Not priced',{exact:true})).toHaveCount(2);
  await expect(contract.getByRole('img')).toHaveCount(2);
  await expect(reopened.getByRole('button',{name:/Send|Sign/})).toHaveCount(0);
  await reopened.setViewportSize({width:1440,height:1000});
  await reopened.screenshot({path:'test-results/window-draft-desktop-contract.png',fullPage:true});
  await reopened.getByRole('button',{name:'Return to quote builder'}).click();
  await reopened.getByRole('button',{name:'Choose product',exact:true}).first().click();
  await reopened.getByLabel('Select line item product type').getByRole('button',{name:'Shutters',exact:true}).click();
  await expect.poll(()=>server.tables.sales_quote_line_items[0].product_type).toBe('Shutters');
  expect(server.tables.sales_quote_line_items.map(line=>line.id)).toEqual(lines.map(line=>line.id));
  expect(server.tables.sales_quote_line_items[0]).toMatchObject({width_whole:36,width_fraction:'1/16',height_whole:60});
  expect(server.tables.sales_quote_designs).toHaveLength(1);
  expect(server.photos.map(photo=>photo.lineItemId)).toEqual(lines.map(line=>line.id));
  await expect(reopened.getByRole('img',{name:'Window reference 1'})).toHaveCount(2);
  // Mixed draft: retain the selected alternative and once-per-line charges on the finished line.
  const completed = server.tables.sales_quote_line_items[0];
  const selectedId = randomUUID();
  server.tables.sales_quote_designs[0].unit_price = 999;
  server.tables.sales_quote_designs.push({id:selectedId,line_item_id:completed.id,variant:'B',unit_price:100,options_json:{manual_price_override:true,authoritative_once_total:25}});
  completed.selected_design_id = selectedId; completed.quantity = 2;
  await reopened.reload();
  await reopened.getByRole('button',{name:'Test contract view',exact:true}).click();
  const mixed = reopened.getByRole('region',{name:'Unfinished contract draft'});
  await expect(mixed.getByText('$225.00',{exact:true})).toBeVisible();
  await expect(mixed.getByText('Not priced',{exact:true})).toHaveCount(1);
  await expect(mixed.getByRole('img')).toHaveCount(2);
  expect(errors).toEqual([]);
  await device.close();
});
