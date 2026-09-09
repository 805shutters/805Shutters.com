import { test, expect } from '@playwright/test';
import { buildDashboardData } from '../src/lib/crm/backend';

test('calendar badges remain compact and preserve scheduling and outage behavior', async ({ page }) => {
  test.setTimeout(120000);
  let failed = false;
  const user = { id: '10000000-0000-4000-8000-000000000099', aud: 'authenticated', role: 'authenticated', email: '805shutters@gmail.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  const token = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: user.id, email: user.email, role: 'authenticated', exp: Math.floor(Date.now()/1000)+7200 })).toString('base64url'), 'synthetic-signature'].join('.');
  await page.addInitScript(({ user, token }) => localStorage.setItem('sb-jobtracking-test-auth-token', JSON.stringify({ access_token: token, refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_in: 7200, expires_at: Math.floor(Date.now()/1000)+7200, user })), { user, token });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/\/$/, '');
    if (!['localhost','127.0.0.1'].includes(url.hostname)) return url.hostname === 'jobtracking-test.supabase.co' ? route.fulfill({ json: user }) : route.abort();
    if (!path.startsWith('/api/')) return route.continue();
    if (path === '/api/crm/session') return route.fulfill({ json: { email: user.email, displayName: 'Local verification' } });
    if (path === '/api/crm/jobs') return route.fulfill({ json: buildDashboardData({ jobs: [], quotes: [], events: [], customers: [], products: [], contracts: [], expenses: [], payments: [], credits: [], entries: [], installationInvoiceEmails: [], kenPayments: [], openingBalance: 0, payoffTarget: 500000 }) });
    if (path === '/api/crm/availability') {
      if (failed) return route.fulfill({ status: 503, json: { message: 'Fixture outage' } });
      const month = url.searchParams.get('month');
      return route.fulfill({ json: { slots: Array.from({length:28}, (_, i) => ({ id: `slot-${i}`, owner: 'Jessica', status: 'available', source: 'crm_working_ranges', start_at: `${month}-${String(i+1).padStart(2,'0')}T17:00:00Z`, end_at: `${month}-${String(i+1).padStart(2,'0')}T20:00:00Z` })) } });
    }
    return route.fulfill({ status: 503, json: { message: 'Outside fixture' } });
  });
  await page.goto('/crm/?tab=calendar');
  if (!(await page.getByRole('heading', {name:'Sales Appointment Calendar'}).count())) await page.getByRole('button', {name:'Calendar', exact:true}).click();
  await page.getByRole('button', {name:'Next', exact:true}).click();
  const available = page.locator('.crm-calendar-slot--available').first();
  const unavailable = page.locator('.crm-calendar-slot--override').first();
  await expect(available).toHaveText('Available');
  await expect(unavailable).toHaveText('Unavailable');
  await expect(available).toBeEnabled();
  await expect(unavailable).toBeEnabled();
  await expect(page.locator('.crm-calendar-slot small')).toHaveCount(0);
  for (const viewport of [{width:1440,height:1000},{width:1024,height:1366}]) {
    await page.setViewportSize(viewport);
    await page.locator('.crm-calendar-board').scrollIntoViewIfNeeded();
    await page.screenshot({path:`output/calendar-badges-${viewport.width}.png`});
    for (const slot of [available, unavailable]) {
      const bounds = await slot.evaluate(el => { const badge=el.querySelector('span')!;return {slot:el.getBoundingClientRect().width,badge:badge.getBoundingClientRect().width,height:badge.getBoundingClientRect().height}; });
      expect(bounds.badge).toBeLessThan(bounds.slot);
      expect(bounds.height).toBeLessThan(24);
    }
  }
  await available.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', {name:'Cancel',exact:true}).click();
  failed=true;
  for (let i=0;i<4;i++) await page.getByRole('button', {name:'Next',exact:true}).click();
  await expect(page.locator('.crm-calendar-open-times-error')).toContainText('Availability is unknown');
  await expect(page.locator('.crm-calendar-slot:not(:disabled)')).toHaveCount(0);
  failed=false;
  await page.getByRole('button', {name:'Retry availability'}).click();
  await expect(available).toBeEnabled();
});
