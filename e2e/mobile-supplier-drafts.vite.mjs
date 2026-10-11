import {fileURLToPath} from 'node:url';
import base from './mobile-window-drafts.vite.mjs';
export default {...base,server:{...base.server,port:4282},resolve:{alias:{'@/lib/crm/supplier-draft-availability':fileURLToPath(new URL('./fixtures/supplier-draft-availability.ts',import.meta.url)),'@/lib/supabase-browser':fileURLToPath(new URL('./fixtures/supplier-browser-client.ts',import.meta.url)),...base.resolve.alias}}};
