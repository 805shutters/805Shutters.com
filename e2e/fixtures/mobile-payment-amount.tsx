// Synthetic version of the reported amounts; never creates a real link or sends a message.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MobileCustomersApp } from '../../src/components/crm/MobileCustomersApp';
import type { MobilePaymentCustomer } from '../../src/lib/crm/mobile-payment-queue';
const row: MobilePaymentCustomer = {
  id: 'fixture', quoteId: 'fixture', jobId: 'fixture-job', name: 'Sample Customer', phone: '8055551212', email: 'customer@example.invalid', address: 'Sample address',
  project: 'TEST-0268', products: ['Shutters'], contractTotal: 1602.4, outstanding: 1001.2, paid: 601.2, deposit: 200, balance: 801.2,
  dueType: 'deposit', amountDue: 200, priority: true, activePayment: true, shipped: true, archived: false, closed: false, paidInFull: false, soldDate: '2026-09-01', contractUrl: null,
};
window.fetch = async (_url, init) => {
  if (init?.method === 'POST') {
    document.getElementById('fixture-request')!.textContent = String(init.body);
    return new Response(JSON.stringify({ deliveryState: 'accepted' }));
  }
  return new Response(JSON.stringify({ results: [row], asOf: '2026-09-26T01:00:00Z' }));
};
createRoot(document.getElementById('root')!).render(<><MobileCustomersApp/><pre id="fixture-request" aria-label="Synthetic request" style={{ color: '#fff', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}/></>);
