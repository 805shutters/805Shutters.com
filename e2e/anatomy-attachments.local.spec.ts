import { expect, test, type Page } from '@playwright/test';

async function assertAttachments(page: Page) {
  await expect.poll(async()=>page.locator('[data-leader-target]').count()).toBe(await page.locator('[data-shutter-callout-target]').count());
  await expect.poll(()=>page.locator('[data-contract-anatomy]').getAttribute('data-attachment-errors')).toBe('0');
  await expect.poll(()=>page.evaluate(()=> {
    const errors:string[]=[];
    for (const group of document.querySelectorAll<SVGGElement>('[data-leader-target]')) {
      const name = group.dataset.leaderTarget!;
      const target = document.querySelector(`[data-shutter-target="${name}"]`)!.getBoundingClientRect();
      const path = group.querySelector('path')!;
      const matrix = path.getScreenCTM()!;
      const end = path.getPointAtLength(path.getTotalLength()).matrixTransform(matrix);
      if (end.x < target.left-.5 || end.x > target.right+.5 || end.y < target.top-.5 || end.y > target.bottom+.5) errors.push(`${name}: misses component`);
      const start = path.getPointAtLength(0).matrixTransform(matrix);
      const cards = [...document.querySelectorAll('[data-shutter-callout-target]')].filter(c=>name.startsWith(c.getAttribute('data-shutter-callout-target')!));
      if (!cards.some(card=>{const r=card.getBoundingClientRect();return Math.min(Math.abs(start.x-r.left),Math.abs(start.x-r.right))<1 && start.y>=r.top && start.y<=r.bottom;})) errors.push(`${name}: disconnected from description`);
      for(const other of document.querySelectorAll('[data-shutter-callout-target]')) {
        const r=other.getBoundingClientRect();
        for(let d=6;d<path.getTotalLength()-6;d+=6){
          const p=path.getPointAtLength(d).matrixTransform(matrix);
          if(p.x>r.left+1&&p.x<r.right-1&&p.y>r.top+1&&p.y<r.bottom-1){errors.push(`${name}: crosses a description`);break;}
        }
      }
    }
    return errors;
  })).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
}

test('reported shutter: every leader touches its named part through responsive and print changes',async({page})=>{
  await page.goto('/quote/anatomy-preview/attachments/');
  await expect(page.locator('[data-shutter-reference]')).toBeVisible();
  await expect(page.locator('[data-leader-target]')).toHaveCount(6);
  const louver=page.locator('[data-shutter-callout-target="louver"]');
  await expect(louver).toContainText('3 1/2');
  await expect(page.locator('[data-shutter-callout-target="hinge"]')).not.toContainText('Poly Composite');
  await expect(page.locator('[data-leader-target="panel-right"]')).toHaveCount(1);
  for(const width of [1440,1024,768,621,620,390,320,1440]){
    await page.setViewportSize({width,height:1000});
    await assertAttachments(page);
  }
  await page.getByLabel('Opening width').fill('72');
  await assertAttachments(page);
  await page.emulateMedia({media:'print'});
  await assertAttachments(page);
  await page.screenshot({path:'artifacts/anatomy-attachments/print.png',fullPage:true});
  await page.emulateMedia({media:'screen'});
  await assertAttachments(page);
  await page.screenshot({path:'artifacts/anatomy-attachments/desktop.png',fullPage:true});
});

test('configuration changes keep targets attached, within a single configured drawing',async({page})=>{
  await page.goto('/quote/anatomy-preview/attachments/');
  for(const choice of ['5','1','2','3','0']){
    await page.getByLabel('Attachment example').selectOption(choice);
    await expect(page.locator('[data-shutter-reference]')).toBeVisible();
    for(const width of [1440,390]){
      await page.setViewportSize({width,height:1000});
      await assertAttachments(page);
      await page.screenshot({path:`artifacts/anatomy-attachments/example-${choice}-${width}.png`,fullPage:true});
    }
  }
  await page.getByLabel('Attachment example').selectOption('4');
  await expect(page.locator('[data-contract-anatomy="roller"]')).toBeVisible();
  await page.setViewportSize({width:1440,height:1000});
  await expect(page.locator('[data-leader-part="control"]')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('delayed image loading and missing targets cannot produce a guessed container endpoint',async({page})=>{
  let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/c-v1/shutter-hidden-plain.webp',async route=>{await gate;await route.continue();});
  await page.goto('/quote/anatomy-preview/attachments/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('[data-shutter-reference]')).toBeVisible();
  release();
  await expect(page.locator('[data-shutter-panel]')).toHaveAttribute('href', /shutter-hidden-plain.webp/);
  await assertAttachments(page);
  await page.locator('[data-shutter-target="louver-right"]').evaluate(el=>el.remove());
  await page.setViewportSize({width:900,height:1000});
  await expect.poll(()=>page.locator('[data-contract-anatomy]').getAttribute('data-attachment-errors')).toBe('1');
  await expect(page.locator('[data-leader-target="louver-right"]')).toHaveCount(0);
});


test('Laundry shows one left panel with its tilt bar in the primary drawing', async ({page}) => {
  await page.goto('/quote/anatomy-preview/attachments/');
  await page.getByLabel('Attachment example').selectOption('5');
  await expect(page.locator('[data-shutter-assembly]')).toHaveCount(1);
  await expect(page.locator('[data-shutter-panel="L"]')).toHaveCount(1);
  await expect(page.locator('[data-shutter-panel]')).toHaveAttribute('href', /shutter-center-plain.webp/);
  await expect(page.getByText('Front tilt detail', {exact:true})).toHaveCount(0);
  for (const width of [1440,1024,768,390,320]) {
    await page.setViewportSize({width,height:1100});
    await assertAttachments(page);
    await page.screenshot({path:`artifacts/anatomy-attachments/laundry-${width}.png`,fullPage:true});
  }
  await page.setViewportSize({width:1440,height:1100});
  await page.emulateMedia({media:'print'});
  await assertAttachments(page);
  await page.screenshot({path:'artifacts/anatomy-attachments/laundry-print.png',fullPage:true});
});
