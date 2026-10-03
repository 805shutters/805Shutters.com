import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {SendQuoteDialog} from '../../src/mts-quote/components/crm/quote-builder/SendQuoteDialog';
import {PortalContainerContext} from '../../src/mts-quote/lib/portal-container';
import type {SalesQuote} from '../../src/mts-quote/types/quote';
import '../../src/app/globals.css';
import '../../src/mts-quote/mts-quote.css';
const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
const quote={id:'synthetic-sender',quote_number:'LOCAL-TEST',quote_letter:'A',customer_name:'Synthetic Customer',customer_email:'test@example.invalid',customer_phone:'+18055550100',quote_v2_backend:true,quote_v2_revision:1,status:'draft',total_amount:2855.14,installer_notes:'{}'} as SalesQuote;
function Fixture(){const [open,setOpen]=useState(true);return <QueryClientProvider client={client}><PortalContainerContext.Provider value={document.getElementById('root')}><button onClick={()=>setOpen(true)}>Open Send quote</button><SendQuoteDialog open={open} onClose={()=>setOpen(false)} quote={quote}/></PortalContainerContext.Provider></QueryClientProvider>;}
createRoot(document.getElementById('root')!).render(<Fixture/>);
