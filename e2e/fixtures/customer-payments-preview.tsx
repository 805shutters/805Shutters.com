// Local-only browser fixture. No customer, Square, SMS, or email provider is called.
import React from 'react';
import { createRoot } from 'react-dom/client';
import type { Session } from '@supabase/supabase-js';
import { SquareFinanceWorkspace } from '../../src/components/crm/SquareFinanceWorkspace';
import { CrmNavigation } from '../../src/components/crm/CrmNavigation';
import '../../src/app/globals.css';
import '../../src/components/crm/crm-platinum.css';
const rows = [
  { id: 'one', quoteId: 'q1', jobId: 'j1', name: 'Alex Sample', project: '805-0412 · Camarillo', contractTotal: 6400, paid: 0, deposit: 3200, balance: 3200, outstanding: 6400 },
  { id: 'two', quoteId: 'q2', jobId: 'j2', name: 'Jordan Example', project: '805-0398 · Ventura', contractTotal: 4800, paid: 2400, deposit: 0, balance: 2400, outstanding: 2400, shipped: true },
  { id: 'three', quoteId: 'q3', jobId: 'j3', name: 'Taylor Demo', project: '805-0407 · Thousand Oaks', contractTotal: 5200, paid: 800, deposit: 1800, balance: 2600, outstanding: 4400 },
  { id: 'four', quoteId: 'q4', jobId: 'j4', name: 'Morgan Preview', project: '805-0386 · Oxnard', contractTotal: 3600, paid: 3600, deposit: 0, balance: 0, outstanding: 0, paidInFull: true },
  { id: 'unlinked', quoteId: null, jobId: 'j5', name: 'Unlinked Sample', project: 'Legacy order', contractTotal: 1000, paid: 0, deposit: 500, balance: 500, outstanding: 1000 },
  { id: 'draft', quoteId: 'q6', jobId: 'j6', name: 'Unsold Sample', project: 'Draft quote', contractTotal: 1000, paid: 0, deposit: 500, balance: 500, outstanding: 1000, sold: false },
].map((row, i) => ({ phone: i === 2 ? null : '(805) 555-0142', email: `${row.id}@example.test`, products: ['Shutters'], archived: false, closed: false, activePayment: true, sold: true, ...row }));
const history = { environment: 'sandbox', canReview: false, objects: [], allocations: [], payments: [], quotes: [], bankMatches: [], classifications: [], events: [], requests: [], credits: [], entries: [], alerts: [], smsConfigured: false, sync: { history_from: '2020-01-01T00:00:00Z', state: {} }, totals: { completedGrossCents: 0, assignedGrossCents: 0, knownFeeCents: 0, feesPending: 0, completedRefundCents: 0, pendingCount: 0 }, webhook: { configured: false, url: null } };
(window as unknown as { paymentRequests: unknown[] }).paymentRequests = [];
window.fetch = async (url, init) => {
  if (init?.method === 'POST') {
    const request = JSON.parse(String(init.body));
    (window as unknown as { paymentRequests: unknown[] }).paymentRequests.push(request);
    await new Promise(resolve => setTimeout(resolve, 150));
    if (new URLSearchParams(location.search).has('send-error')) return new Response(JSON.stringify({ message: 'Provider acceptance unknown. Review the audit before retrying.' }), { status: 502 });
    return new Response(JSON.stringify({ amount: request.expectedAmount, deliveryState: 'accepted', replayed: false }), { status: 200 });
  }
  if (String(url).includes('/mobile/customers')) return new Response(JSON.stringify({ results: rows, asOf: new Date().toISOString() }), { status: 200 });
  return new Response(JSON.stringify(history), { status: 200 });
};
createRoot(document.getElementById('root')!).render(<div className="crm-platinum-shell"><CrmNavigation activeTab="square" onNavigate={() => {}} onRefresh={() => {}} onSignOut={() => {}} busy={false} /><main className="crm-platinum-main"><div className="crm-platinum-topbar">Workspace / Payment Hub · Local test data</div><div className="crm-platinum-content"><SquareFinanceWorkspace session={{ access_token: 'fixture' } as Session} /></div></main></div>);
