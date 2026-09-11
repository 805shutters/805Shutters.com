import { test, expect } from '@playwright/test';
import { buildDashboardData } from '../src/lib/crm/backend';
import { candidateVisit } from '../src/lib/booking/scheduling';
import { losAngelesDateString } from '../src/lib/booking/availability';

for (const viewport of [{ width: 1440, height: 1000 }, { width: 1024, height: 1366 }]) {
  test(`admin reschedules into an overlap at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const date = losAngelesDateString(new Date());
    let event = { ...candidateVisit(date, '13:00', 'Test address', 5), title: 'Admin Reschedule Test' };
    const neighbor = { ...candidateVisit(date, '12:00', 'Neighbor address', 5), title: 'Overlapping Neighbor' };
    let failSave = false;
    const writes: Record<string, unknown>[] = [];
    const user = { id: '10000000-0000-4000-8000-000000000099', aud: 'authenticated', role: 'authenticated', email: '805shutters@gmail.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
    const token = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: user.id, email: user.email, role: 'authenticated', exp: Math.floor(Date.now()/1000)+7200 })).toString('base64url'), 'synthetic-signature'].join('.');
    await page.addInitScript(({ user, token }) => localStorage.setItem('sb-jobtracking-test-auth-token', JSON.stringify({ access_token: token, refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_in: 7200, expires_at: Math.floor(Date.now()/1000)+7200, user })), { user, token });
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      const path = url.pathname.replace(/\/$/, '');
      if (!['localhost','127.0.0.1'].includes(url.hostname)) return url.hostname === 'jobtracking-test.supabase.co' ? route.fulfill({ json: user }) : route.abort();
      if (!path.startsWith('/api/')) return route.continue();
      if (path === '/api/crm/session') return route.fulfill({ json: { email: user.email, displayName: 'Local verification' } });
      if (path === '/api/crm/jobs') return route.fulfill({ json: buildDashboardData({ jobs: [], quotes: [], events: [event, neighbor], customers: [], products: [], contracts: [], expenses: [], payments: [], credits: [], entries: [], installationInvoiceEmails: [], kenPayments: [], openingBalance: 0, payoffTarget: 500000 }) });
      if (path === '/api/crm/availability') return route.fulfill({ json: { slots: [] } });
      if (path === '/api/crm/calendar' && route.request().method() === 'PATCH') {
        const payload = route.request().postDataJSON();
        writes.push(payload);
        if (failSave) return route.fulfill({ status: 409, json: { message: 'This appointment changed. Reload it before saving.' } });
        event = { ...event, ...payload, status: 'rescheduled' };
        return route.fulfill({ json: { event } });
      }
      return route.fulfill({ status: 503, json: { message: 'Outside fixture' } });
    });
    await page.goto('/crm/?tab=calendar');
    await page.getByRole('button', { name: 'Calendar', exact: true }).click();
    await page.locator('.crm-calendar-event-block').filter({ hasText: 'Admin Reschedule Test' }).click();
    await page.getByRole('button', { name: 'Reschedule', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('checkbox')).toHaveCount(0);
    await expect(dialog).toContainText('Admin rescheduling allows overlapping appointments');
    await dialog.locator('select[name="time"]').selectOption('12:00');
    await page.screenshot({ path: `output/admin-reschedule-${viewport.width}.png` });
    const bounds = await dialog.locator('.crm-slot-form-panel').boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
    await dialog.getByRole('button', { name: 'Save New Time' }).click();
    await expect(dialog).toHaveCount(0);
    expect(writes[0]).toEqual({ id: event.id, start_at: neighbor.start_at, end_at: neighbor.end_at });
    await expect(page.locator('.crm-calendar-event-block').filter({ hasText: 'Admin Reschedule Test' })).toContainText('12:00');
    await page.screenshot({ path: `output/admin-overlap-saved-${viewport.width}.png` });
    // Failure retains the user's selected values and the open form.
    await page.locator('.crm-calendar-event-block').filter({ hasText: 'Admin Reschedule Test' }).click();
    await page.getByRole('button', { name: 'Reschedule', exact: true }).click();
    await dialog.locator('select[name="time"]').selectOption('11:00');
    failSave = true;
    await dialog.getByRole('button', { name: 'Save New Time' }).click();
    await expect(page.getByText('This appointment changed. Reload it before saving.', { exact: true })).toBeVisible();
    await expect(dialog.locator('select[name="time"]')).toHaveValue('11:00');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    failSave = false;
    await page.locator('.crm-calendar-event-block').filter({ hasText: 'Admin Reschedule Test' }).dragTo(
      page.locator('.crm-calendar-event-block').filter({ hasText: 'Overlapping Neighbor' }),
      { targetPosition: { x: 10, y: 10 } },
    );
    await expect.poll(() => writes.length).toBe(3);
    expect(writes[2].start_at).toBe(neighbor.start_at);
  });
}
