import { fileURLToPath } from 'node:url';
export default {
 root:fileURLToPath(new URL('..',import.meta.url)),
 resolve:{alias:{'@':fileURLToPath(new URL('../src',import.meta.url)),'@mts':fileURLToPath(new URL('../src/mts-quote',import.meta.url)),'@mts-v1':fileURLToPath(new URL('../src/mts-quote-v1',import.meta.url))}},
 define:{'process.env':{}},esbuild:{jsx:'automatic'},server:{host:'127.0.0.1',port:4198,strictPort:true},
 plugins:[{name:'internal-base-price-fixture',configureServer(server){
  server.middlewares.use('/__base-price',async(req,res)=>{
   if(req.method!=='POST'){res.statusCode=405;return res.end();}
   try{
    let body='';for await(const chunk of req)body+=chunk;
    const {line,design}=JSON.parse(body);
    const {prepareSalesQuoteV2PricingBatch}=await server.ssrLoadModule('/src/lib/crm/sales-quote-v2-price-save.ts');
    const {prepared}=prepareSalesQuoteV2PricingBatch({lines:[line],selectedDesigns:[design],serverDate:'2026-09-28'});
    const result=prepared[0].rpcResult;
    let customerPayload=null;
    if(result.priceStatus==='authoritative'){
     const {prepareV2CustomerSendPayload}=await server.ssrLoadModule('/src/lib/crm/sales-quote-v2-send.ts');
     const snapshot=result.authoritativeSnapshot;
     customerPayload=prepareV2CustomerSendPayload({quote:{id:line.quote_id,status:'draft',quote_v2_backend:true,quote_v2_status:'priced',quote_v2_revision:1,quote_v2_catalog_version:result.catalogVersion,total_amount:snapshot.retail.total},lineItems:[line],designs:[{...design,options_json:{...design.options_json,authoritative_v2_snapshot:snapshot},unit_price:snapshot.retail.unitPrice,quote_v2_selection:result.selection,quote_v2_price_status:'authoritative',quote_v2_selection_fingerprint:result.selectionFingerprint,quote_v2_priced_catalog_version:result.catalogVersion,current_v2_snapshot_id:'internal-snapshot'}],serverDate:'2026-09-28',snapshots:[{id:'internal-snapshot',quote_id:line.quote_id,line_item_id:line.id,design_id:design.id,quote_revision:1,selection_fingerprint:result.selectionFingerprint,catalog_version:result.catalogVersion,retail_total:snapshot.retail.total,retail_snapshot:snapshot}]});
    }
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({...result,customerPayload}));
   }catch(e){res.statusCode=500;res.end(JSON.stringify({error:String(e)}));}
  });
 }}],
};
