import { test, expect } from '@playwright/test';
import { buildDashboardData } from '../src/lib/crm/backend';
import { candidateVisit } from '../src/lib/booking/scheduling';
import { losAngelesDateString } from '../src/lib/booking/availability';

for (const viewport of [{ width: 1440, height: 1000 }, { width: 1024, height: 1366 }]) {
  test(`staff reschedules and cancels reliably at ${viewport.width}px`, async ({ page }) => {
    test.setTimeout(120000);
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
      if (path === '/api/crm/availability') return route.fulfill({ json: { revision: 'fixture', ranges: [] } });
      if (path === '/api/crm/calendar' && route.request().method() === 'PATCH') {
        const payload = route.request().postDataJSON();
        writes.push(payload);
        if (failSave) return route.fulfill({ status: 409, json: { message: 'This appointment changed. Reload it before saving.' } });
        event = { ...event, ...payload, status: payload.action === 'cancel' ? 'canceled' : 'rescheduled' };
        return route.fulfill({ json: { event } });
      }
      return route.fulfill({ status: 503, json: { message: 'Outside fixture' } });
    });
    await page.goto('/crm/?tab=calendar');
    await page.getByRole('button', { name: 'Calendar', exact: true }).click();
    await page.getByRole('button', { name: /Admin Reschedule Test.*Open appointment/ }).click();
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
    expect(writes[0]).toMatchObject({ id: event.id, start_at: neighbor.start_at, end_at: neighbor.end_at, expected_updated_at: event.updated_at });
    await expect(page.getByRole('button', { name: /Admin Reschedule Test.*Open appointment/ })).toHaveAttribute('aria-label', /12:00/);
    await page.screenshot({ path: `output/admin-overlap-saved-${viewport.width}.png` });
    // Failure retains the user's selected values and the open form.
    await page.getByRole('button', { name: /Admin Reschedule Test.*Open appointment/ }).click();
    await page.getByRole('button', { name: 'Reschedule', exact: true }).click();
    await dialog.locator('select[name="time"]').selectOption('11:00');
    failSave = true;
    await dialog.getByRole('button', { name: 'Save New Time' }).click();
    await expect(page.getByText('This appointment changed. Reload it before saving.', { exact: true })).toBeVisible();
    await expect(dialog.locator('select[name="time"]')).toHaveValue('11:00');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    failSave = false;
    // A move to another month follows the appointment to its new week.
    await page.getByRole('button', { name: /Admin Reschedule Test.*Open appointment/ }).click();
    await page.getByRole('button', { name: 'Reschedule', exact: true }).click();
    const nextMonth = new Date(`${date}T12:00:00Z`);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth()+1, 5);
    const movedDate = nextMonth.toISOString().slice(0,10);
    await dialog.locator('input[name="date"]').fill(movedDate);
    await dialog.locator('select[name="duration"]').selectOption('90');
    await dialog.getByRole('button', { name: 'Save New Time' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Admin Reschedule Test.*Open appointment/ })).toHaveAttribute('aria-label', new RegExp(movedDate));
    expect((Date.parse(String(writes[2].end_at))-Date.parse(String(writes[2].start_at)))/60000).toBe(90);
    // Canceling the confirmation keeps the appointment. A failed save stays open.
    await page.getByRole('button', { name: /Admin Reschedule Test.*Open appointment/ }).click();
    await page.getByRole('button', { name: 'Cancel Appointment', exact: true }).click();
    await dialog.getByRole('button', { name: 'Keep Appointment' }).click();
    expect(writes).toHaveLength(3);
    await page.getByRole('button', { name: /Admin Reschedule Test.*Open appointment/ }).click();
    await page.getByRole('button', { name: 'Cancel Appointment', exact: true }).click();
    failSave = true;
    await dialog.getByRole('button', { name: 'Cancel Appointment', exact: true }).click();
    await expect(page.getByText('This appointment changed. Reload it before saving.', {exact:true})).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Keep Appointment' })).toBeVisible();
    failSave = false;
    await page.screenshot({ path: `output/calendar-cancel-${viewport.width}.png` });
    await dialog.getByRole('button', { name: 'Cancel Appointment', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Admin Reschedule Test.*Open appointment/ })).toHaveCount(0);
    expect(writes.at(-1)).toMatchObject({action:'cancel',id:event.id});
    await page.screenshot({ path: `output/calendar-canceled-${viewport.width}.png` });
  });
}

test.describe('iPad appointment changes', () => {
  test.use({ viewport: { width: 1024, height: 1366 }, userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_6 like Mac OS X) AppleWebKit/605.1.15 Version/17.6 Mobile/15E148 Safari/604.1', hasTouch: true, isMobile: true });
  test('moves to the saved date, retains errors, and cancels from the mobile calendar', async ({ page }) => {
    const date = losAngelesDateString(new Date());
    let event = { ...candidateVisit(date, '13:00', 'Test address', 5), customer_name: 'Mobile Calendar Test', appointment_duration_minutes: 60 };
    const user = { id: '10000000-0000-4000-8000-000000000099', email: '805shutters@gmail.com' };
    const token = [Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now()/1000)+7200 })).toString('base64url'), 'synthetic'].join('.');
    await page.addInitScript(({ user, token }) => localStorage.setItem('sb-jobtracking-test-auth-token', JSON.stringify({ access_token: token, refresh_token: 'synthetic', expires_at: Math.floor(Date.now()/1000)+7200, user })), { user, token });
    let failSave = true;
    const writes: Record<string, unknown>[] = [];
    const ranges: string[] = [];
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      const path = url.pathname.replace(/\/$/, '');
      if (!['localhost', '127.0.0.1'].includes(url.hostname)) return url.hostname === 'jobtracking-test.supabase.co' ? route.fulfill({ json: user }) : route.abort();
      if (!path.startsWith('/api/')) return route.continue();
      if (path === '/api/crm/mobile/appointments') {
        ranges.push(url.searchParams.get('start')!);
        const inRange = event.start_at.slice(0,10) >= url.searchParams.get('start')! && event.start_at.slice(0,10) < url.searchParams.get('end')!;
        return route.fulfill({ json: { appointments: inRange && event.status !== 'canceled' ? [event] : [], user } });
      }
      if (path === '/api/crm/calendar' && route.request().method() === 'PATCH') {
        const payload = route.request().postDataJSON();
        writes.push(payload);
        if (failSave) return route.fulfill({ status:409, json:{message:'This appointment changed. Reload it before saving.'} });
        event = { ...event, ...payload, status: payload.action === 'cancel' ? 'canceled' : 'rescheduled', appointment_duration_minutes: 90 };
        return route.fulfill({ json:{ event } });
      }
      return route.fulfill({ status:503, json:{message:'Outside fixture'} });
    });
    await page.goto('/crm/mobile/');
    await page.getByRole('button', {name:/^Open Appointments/}).click();
    const card = page.getByRole('button', {name:/Mobile Calendar Test,/});
    await card.click();
    await page.getByRole('button', {name:'Reschedule Appointment',exact:true}).click();
    const dialog = page.getByRole('dialog', {name:'Reschedule appointment'});
    const moved = new Date(`${date}T12:00:00Z`);
    moved.setUTCMonth(moved.getUTCMonth()+1, 5);
    const movedDate = moved.toISOString().slice(0,10);
    await dialog.locator('input[name="date"]').fill(movedDate);
    await dialog.locator('input[name="time"]').fill('12:30');
    await dialog.locator('select[name="duration"]').selectOption('90');
    await dialog.getByRole('button',{name:'Confirm New Time'}).click();
    await expect(dialog.getByRole('alert')).toContainText('This appointment changed');
    await expect(dialog.locator('input[name="date"]')).toHaveValue(movedDate);
    await page.screenshot({path:'output/mobile-reschedule-error-ipad.png'});
    failSave = false;
    await dialog.getByRole('button',{name:'Confirm New Time'}).click();
    await expect(dialog).toHaveCount(0);
    await expect(card).toBeVisible();
    expect(ranges.at(-1)).toBe(movedDate);
    expect(writes.at(-1)).toMatchObject({ expected_updated_at:event.updated_at });
    await card.click();
    const details = page.getByRole('dialog',{name:'Appointment details'});
    await expect(details).toContainText('90 min');
    // Keep Appointment through the native confirmation makes no request.
    const count = writes.length;
    page.once('dialog', dialog => dialog.dismiss());
    await details.getByRole('button',{name:'Cancel Appointment',exact:true}).click();
    expect(writes).toHaveLength(count);
    failSave = true;
    page.once('dialog', dialog => dialog.accept());
    await details.getByRole('button',{name:'Cancel Appointment',exact:true}).click();
    await expect(details.getByRole('alert')).toContainText('This appointment changed');
    await page.screenshot({path:'output/mobile-cancel-error-ipad.png'});
    failSave = false;
    page.once('dialog', dialog => dialog.accept());
    await details.getByRole('button',{name:'Cancel Appointment',exact:true}).click();
    await expect(details).toHaveCount(0);
    await expect(card).toHaveCount(0);
    await expect(page.getByText("Mobile Calendar Test's appointment was canceled.", {exact:true})).toBeVisible();
    await page.screenshot({path:'output/mobile-canceled-ipad.png'});
  });
});
