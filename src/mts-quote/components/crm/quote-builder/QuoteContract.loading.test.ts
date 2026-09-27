// @vitest-environment happy-dom
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { QuoteContract } from './QuoteContract';
const state = vi.hoisted(() => ({ results: {} as Record<string, unknown> }));
vi.mock('@tanstack/react-query', () => ({
 useQuery: ({queryKey}: {queryKey: unknown[]}) => {
  const key = ['group-line-items','group-designs','group','line-items','designs'].find(key => queryKey.includes(key)) || 'quote';
  return state.results[key] || {data: [], isPending: false, isError: false};
 },
 useQueryClient: () => ({}), useIsMutating: () => 0, useMutation: () => ({}),
}));
vi.mock('@mts/stores/quoteBuilderStore', () => ({ useQuoteBuilderStore: () => ({activeQuoteId:'q',setActiveTab:vi.fn(),setActiveQuote:vi.fn()}) }));
vi.mock('@/components/crm/QuoteWindowPhotos', () => ({QuoteWindowPhotos: () => null}));
vi.mock('./QuoteGroupTabs', () => ({QuoteGroupTabs: () => null}));
vi.mock('./SendQuoteDialog', () => ({SendQuoteDialog: () => null}));
vi.mock('./InPersonSigning', () => ({InPersonSigning: () => null}));
const ready = (data: unknown) => ({data, isPending:false, isError:false});
const pending = {isPending:true,isError:false};
const failed = {isPending:false,isError:true};
beforeEach(() => {
 state.results = {
  quote: ready({id:'q',status:'draft',quote_number:'QA',customer_name:'Internal QA',account_id:'805'}),
  'line-items': ready([{id:'line',quote_id:'q',room_name:'QA roller',product_type:'Roller Shades',quantity:1,width:36,height:60}]),
  designs: pending,
 };
});
const render = () => renderToStaticMarkup(React.createElement(QuoteContract));
it('shows loading instead of declaring every saved line unpriced before designs arrive', () => {
 const html=render();
 expect(html).toContain('Loading saved quote pricing');
 expect(html).not.toContain('Not priced');
 expect(html).not.toContain('Unfinished contract draft');
});
it('reports a failed pricing read without presenting missing data as an unpriced quote', () => {
 state.results.designs=failed;
 const html=render();
 expect(html).toContain('Saved quote pricing could not be loaded');
 expect(html).not.toContain('Not priced');
});
it('still identifies a genuinely unpriced line after the design query completes', () => {
 state.results.designs=ready([]);
 expect(render()).toContain('Unfinished contract draft');
});
it('does not wait forever on a disabled design query for a quote with no lines', () => {
 state.results['line-items']=ready([]);
 expect(render()).toContain('Unfinished contract draft');
});
it('waits for sibling pricing before showing a grouped contract', () => {
 state.results.quote=ready({id:'q',status:'draft',quote_group_id:'g'});
 state.results.group=ready([{id:'q',quote_group_id:'g'},{id:'sibling',quote_group_id:'g'}]);
 state.results.designs=ready([]);
 state.results['group-line-items']=ready([{id:'sibling-line',quote_id:'sibling'}]);
 state.results['group-designs']=pending;
 expect(render()).toContain('Loading saved quote pricing');
});
it('keeps the standalone preview loading while its saved quote is being fetched', () => {
 state.results.quote=pending;
 const html=render();
 expect(html).toContain('Loading saved quote pricing');
 expect(html).not.toContain('Select or create a quote');
});
