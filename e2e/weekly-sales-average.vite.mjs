import { fileURLToPath } from 'node:url';
import base from './norman-fall.vite.mjs';
// The browser preview only uses pure helpers; server authentication is never invoked.
export default {...base,plugins:[{name:'fixture-crm-auth',enforce:'pre',resolveId(source,importer){
 if(source==='@/lib/crm/auth'||source==='./auth'&&importer?.includes('/src/lib/crm/')) return fileURLToPath(new URL('./fixtures/local-crm-auth.ts',import.meta.url));
}}],server:{host:'127.0.0.1',port:4296,strictPort:true}};
