import { fileURLToPath } from 'node:url';
import base from './measurement-save.vite.mjs';
export default {...base,plugins:[...(base.plugins??[]),{name:'local-norman-price',configureServer(server){
 server.middlewares.use('/__fixture/price',async(req,res)=>{
  try{
   let body='';for await(const chunk of req)body+=chunk;
   const {prepareNormanLegacyPricing}=await server.ssrLoadModule('/src/lib/crm/sales-quote-norman-price.ts');
   const result=prepareNormanLegacyPricing(JSON.parse(body),'2026-09-22');
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));
  }catch(error){res.statusCode=500;res.end(String(error));}
 });
}}],resolve:{alias:{
 '@/lib/crm/auth':fileURLToPath(new URL('./fixtures/local-crm-auth.ts',import.meta.url)),
 ...base.resolve.alias,
}},server:{host:'127.0.0.1',port:4281,strictPort:true}};
