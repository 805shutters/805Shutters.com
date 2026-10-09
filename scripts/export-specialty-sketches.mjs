/** Export the same original SVG renderer used by customer contracts. */
import { createServer } from 'vite';
import { resolve } from 'node:path';
const server=await createServer({configFile:false,resolve:{alias:{'@':resolve('src')}},optimizeDeps:{noDiscovery:true},server:{middlewareMode:true},appType:'custom'});
try {const {exportCatalog}=await server.ssrLoadModule('/scripts/specialty-sketch-export-entry.mjs'); const destination=resolve(process.argv[2] || 'artifacts/specialty-shutters'); console.log(`Exported ${await exportCatalog(destination)} SVG sketches to ${destination}`);} finally {await server.close();}
