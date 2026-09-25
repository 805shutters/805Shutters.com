// Actual production components, with reads/API requests served by Playwright's shared test backend.
// No credentials and no production connections. Each browser context has independent IndexedDB.
import { setMeasurementDatabase } from './measurement-client';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Session } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { MobileQuoteWalkthrough } from '@/components/crm/MobileQuoteWalkthrough';
import { QuoteBuilder } from '@mts/components/crm/quote-builder/QuoteBuilder';
import { QuoteContract } from '@mts/components/crm/quote-builder/QuoteContract';
import { QuoteBuilderDatabaseProvider, type QuoteBuilderDatabase } from '@mts/integrations/supabase/quoteBuilderDatabase';
import { useQuoteBuilderStore } from '@mts/stores/quoteBuilderStore';
import { PortalContainerContext } from '@mts/lib/portal-container';
import '../../src/app/globals.css';
import '../../src/mts-quote/mts-quote.css';

const session = { access_token: 'local-test-session', user: { id: '11111111-1111-4111-8111-111111111111' } } as Session;
const database = {
  auth: { getSession: async () => ({ data: { session }, error: null }) },
  from(table: string) {
    const filters: Array<{key:string; value:unknown; operator:string}> = [];
    let one = false;
    const query = {
      select: () => query, order: () => query, limit: () => query,
      eq: (key:string,value:unknown) => { filters.push({key,value,operator:'eq'}); return query; },
      is: (key:string,value:unknown) => { filters.push({key,value,operator:'is'}); return query; },
      in: (key:string,value:unknown) => { filters.push({key,value,operator:'in'}); return query; },
      single: () => { one=true; return query; }, maybeSingle: () => {one=true;return query;},
      async then(resolve:(value:unknown)=>unknown,reject?:(error:unknown)=>unknown) {
        try { return resolve(await (await fetch('/__window_drafts__/query', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({table,filters,one})})).json()); }
        catch(error) { return reject?.(error); }
      },
    };
    return query;
  },
} as unknown as QuoteBuilderDatabase;
setMeasurementDatabase(database);
const params = new URLSearchParams(location.search);
const quoteId = params.get('quote');
if (quoteId) useQuoteBuilderStore.getState().setActiveQuote(quoteId);
const client = new QueryClient({ defaultOptions: { queries: { retry:false } } });
function Fixture() {
  const [scope,setScope] = useState<HTMLDivElement|null>(null);
  const { activeTab, setActiveTab } = useQuoteBuilderStore();
  if (!quoteId) return <MobileQuoteWalkthrough session={session} onSessionExpired={() => { throw new Error('Unexpected session expiry'); }} />;
  return <QuoteBuilderDatabaseProvider database={database} authoritativeV2 serverOwnedV2>
    <QueryClientProvider client={client}><PortalContainerContext.Provider value={scope}>
      <div ref={setScope} className="mts-quote-scope">
        <nav><button onClick={() => setActiveTab('builder')}>Test builder view</button> | <button onClick={() => setActiveTab('contract')}>Test contract view</button></nav>
        {activeTab === 'contract' ? <QuoteContract /> : <QuoteBuilder />}<Toaster />
      </div>
    </PortalContainerContext.Provider></QueryClientProvider>
  </QuoteBuilderDatabaseProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
