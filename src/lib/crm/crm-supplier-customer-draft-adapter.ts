import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MOBILE_QUOTE_ACCOUNT_ID } from './mobile-quote-draft';
import { canonicalJson,supplierSourceFeeProgram, validateSupplierSpec, type SupplierQuoteSpec } from './mobile-supplier-spec';
import { DraftStepBlocked, type CustomerDraftAdapter, type CustomerDraftProgress, type DraftPrice, type QuoteReadback } from './supplier-draft-orchestrator';
import { createSalesQuoteV2Draft, mutateSalesQuoteV2Structure, parseCreateSalesQuoteV2DraftBody, parseSalesQuoteV2StructureBody, type QuoteV2StructureOperation } from './sales-quote-v2-structure';
import { customerChargeEligible, customerPhysicalUnits } from '@/lib/quote/customer-charges';

type Row = Record<string, unknown>;
export type CrmDraftDeploymentEvidence = {
  accountId: typeof MOBILE_QUOTE_ACCOUNT_ID;
  feePolicy: 'blind-shade-install-ship-v1';
  reference: string;
};
const fields = [['supplier','supplier'],['material','material'],['louver_size','louverSize'],['tilt_type','tiltType'],['hinge_color','hingeColor'],['panel_config','panelConfig'],['mount_type','mountType'],['shade_type','shadeType'],['lift_system','liftSystem'],['valance','valance'],['fabric','fabric'],['motor_type','motorType'],['remote_type','remoteType'],['hard_surface_install','hardSurfaceInstall'],['ladder_over_15ft','ladderOver15ft'],['requires_takedown','requiresTakedown']] as const;
const metadata = ['mobile_added_catalog_identity','mobile_added_program_identity','mobile_supplier_product_id','mobile_opening_room','mobile_opening_position','mobile_window_notes','mobile_design_notes'];
const fail = (message:string,code:'readback_mismatch'|'pricing_decision'|'adapter_unavailable'='readback_mismatch'):never => { throw new DraftStepBlocked({code,message}); };
const text = (v:unknown)=>typeof v==='string'?v:'';
const money = (v:unknown) => {
  const value=typeof v==='number'?v:typeof v==='string'?Number(v):NaN;
  if(!Number.isFinite(value)||value<0||!Number.isSafeInteger(Math.round(value*100))||Math.abs(value*100-Math.round(value*100))>Math.max(0.000001,Number.EPSILON*Math.abs(value*100)*4))return fail('CRM readback contains invalid money.');
  return value.toFixed(2);
};
export function stableDraftRequestUuid(key:string) {
  const hex=createHash('sha256').update(key).digest('hex').split('');hex[12]='8';hex[16]=((parseInt(hex[16],16)&3)|8).toString(16);
  const h=hex.join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
}
export function customerDraftOperations(spec:SupplierQuoteSpec,key:string):QuoteV2StructureOperation[] {
  return spec.lines.flatMap((line,index)=>{
    if(Object.keys(line.configuration).some(key=>key.startsWith('mobile_')))return fail('Supplier configuration collides with reserved CRM handoff fields.');
    for(const key of ['catalog_product_id','quote_lab_product_id'])if(line.configuration[key]!=null&&line.configuration[key]!==line.productId)return fail('Catalog product identity differs from the selected exact product.');
    const options:Row={...structuredClone(line.configuration),mobile_supplier_product_id:line.productId,mobile_opening_room:line.room,mobile_opening_position:line.position,mobile_window_notes:line.notes,mobile_design_notes:line.designNotes};
    // The existing SQL fee helper reads catalog identity, not mobile handoff metadata.
    if(options.catalog_product_id==null){options.catalog_product_id=line.productId;options.mobile_added_catalog_identity=true;}
    if(options.catalog_program_id==null&&options.quote_lab_program_id==null&&options.program_id!=null){options.catalog_program_id=options.program_id;options.mobile_added_program_identity=true;}
    const patch:Row={productType:line.productType,supplier:line.manufacturer,notes:line.designNotes||null,optionsJson:options};
    for(const [stored,api] of fields)if(line.configuration[stored]!=null)patch[api]=line.configuration[stored];
    return [
      {type:'line.create',lineItemId:line.id,patch:{roomName:[line.room,line.position].filter(Boolean).join(' · '),productType:line.productType,widthWhole:line.widthWhole,widthFraction:line.widthFraction,heightWhole:line.heightWhole,heightFraction:line.heightFraction,quantity:line.quantity,sortOrder:index}},
      {type:'design.upsert',lineItemId:line.id,designId:stableDraftRequestUuid(`${key}:design:${line.id}`),variant:'A',selectDesign:true,patch},
    ] as QuoteV2StructureOperation[];
  });
}
function sourceAutomaticUnit(line:SupplierQuoteSpec['lines'][number]) {
  const program=supplierSourceFeeProgram(line.configuration);
  return customerChargeEligible(`${line.productType} ${line.productId}`,program)?39*customerPhysicalUnits({productId:line.productId,configuration:line.configuration}):0;
}
function priceInput(line:SupplierQuoteSpec['lines'][number],price:DraftPrice) {
  if(!price||price.lineId!==line.id)return fail('CRM price and specification line identities differ.');
  if(!/^\d{1,10}\.\d{2}$/.test(price.total))return fail('Customer line total requires exact cents.','pricing_decision');
  const target=BigInt(price.total.replace('.',''));
  if(price.manualPreserved!==(line.manualAllInPrice!==null)||target>999999999999n)return fail('Manual-price preservation or the CRM money range is inconsistent.','pricing_decision');
  if(price.manualPreserved&&target!==BigInt(line.manualAllInPrice!.replace('.',''))*BigInt(line.quantity))return fail('The preserved customer price must stay unchanged.','pricing_decision');
  if(target%BigInt(line.quantity)!==0n)return fail('Customer line total cannot be represented in exact unit cents.','pricing_decision');
  const input=target/BigInt(line.quantity)-BigInt(sourceAutomaticUnit(line)*100);
  if(input<0n)return fail('Preserved all-in price is below source automatic charges; resolve its policy without changing the price.','pricing_decision');
  const unit=(Number(input)/100).toFixed(2);
  if(!price.manualPreserved&&price.merchandiseUnitInput!==unit)return fail('Merchandise input differs from the verified source fee policy.','pricing_decision');
  return Number(unit);
}
/** Existing authenticated CRM server only. Importing this adapter performs no action. */
export function createCrmSupplierCustomerDraftAdapter(db:SupabaseClient,actorId:string,evidence?:CrmDraftDeploymentEvidence):CustomerDraftAdapter {
  const ownerQuote=async(id:string)=>{
    const [q,d]=await Promise.all([
      db.from('sales_quotes').select('*').eq('id',id).eq('account_id',MOBILE_QUOTE_ACCOUNT_ID).eq('created_by',actorId).maybeSingle(),
      db.from('sales_quote_v2_deliveries').select('id').eq('quote_id',id),
    ]);
    if(q.error||d.error||!q.data)return fail('Owned 805 quote / delivery readback is unavailable.');
    const row=q.data as Row;
    if(row.status!=='draft'||row.quote_v2_backend!==true||!['draft','stale','priced','blocked'].includes(String(row.quote_v2_status))||row.sent_at||row.sent_via||row.signed_at||row.customer_signature||row.ordered_at||row.archived_at||row.deleted_at||row.quote_v2_delivery_id||row.quote_v2_accepted_selection||Number(row.deposit_paid||0)!==0||Number(row.balance_paid||0)!==0||d.data?.length)return fail('Sent, finalized, delivered or paid quotes cannot be changed by this adapter.');
    return row;
  };
  const sameCustomer=(row:Row,spec:SupplierQuoteSpec)=>{
    if(row.created_job_id!==spec.customer.jobId||row.customer_name!==spec.customer.name||text(row.customer_phone)!==spec.customer.phone||text(row.customer_email)!==spec.customer.email||text(row.customer_address)!==spec.customer.address||text(row.appointment_date)!==text(spec.customer.appointmentDate))return fail('CRM customer/job/contact readback differs from the submitted specification.');
  };
  const readSnapshot=async(id:string,requirePrices=true):Promise<QuoteReadback>=>{
    const q=await ownerQuote(id);
    const l=await db.from('sales_quote_line_items').select('*').eq('quote_id',id).order('sort_order');
    if(l.error||!l.data)return fail('Complete CRM line readback is unavailable.');
    const rows=l.data as Row[],ids=rows.map(row=>text(row.id));
    const d=ids.length?await db.from('sales_quote_designs').select('*').in('line_item_id',ids):{data:[],error:null};
    const photos=await db.from('mobile_quote_photos').select('photo_id,line_item_id,uploaded_at').eq('quote_id',id).eq('account_id',MOBILE_QUOTE_ACCOUNT_ID);
    if(d.error||!d.data||photos.error||!photos.data)return fail('Complete CRM design / photo readback is unavailable.');
    const designs=d.data as Row[];
    const lines=rows.map(row=>{
      const selected=designs.find(design=>design.id===row.selected_design_id&&design.line_item_id===row.id&&design.variant==='A');
      if(!selected||row.archived_at||(requirePrices&&selected.quote_v2_price_status!=='authoritative'))return fail('CRM selected design is missing, archived or unpriced.');
      const options=structuredClone(selected.options_json??{}) as Row;
      const room=text(options.mobile_opening_room),position=text(options.mobile_opening_position),productId=text(options.mobile_supplier_product_id),notes=text(options.mobile_window_notes),designNotes=text(options.mobile_design_notes);
      if(row.room_name!==[room,position].filter(Boolean).join(' · ')||text(selected.notes)!==designNotes||row.product_type!==selected.product_type)return fail('CRM visible room, notes or product differs from its saved handoff fields.');
      for(const [column] of fields)if(options[column]!=null&&selected[column]!==options[column])return fail(`CRM ${column} column differs from its saved configuration.`);
      if(options.catalog_product_id!==productId)return fail('CRM catalog identity differs from the selected product.');
      if(options.mobile_added_catalog_identity===true)delete options.catalog_product_id;
      if(options.mobile_added_program_identity===true)delete options.catalog_program_id;
      for(const k of metadata)delete options[k];
      for(const k of Object.keys(options))if(/^(quote_v2_|authoritative_|current_v2_snapshot|manual_price_override$|manual_merchandise_unit_price$|manual_customer_charge|customer_charges$)/i.test(k))delete options[k];
      return {id:text(row.id),manufacturer:text(selected.supplier),productId,productType:text(row.product_type),room,position,widthWhole:Number(row.width_whole),widthFraction:text(row.width_fraction),heightWhole:Number(row.height_whole),heightFraction:text(row.height_fraction),quantity:Number(row.quantity),configuration:options,notes,designNotes,total:money(Number(selected.unit_price)*Number(row.quantity))};
    });
    const subtotal=(lines.reduce((sum,line)=>sum+Math.round(Number(line.total)*100),0)/100).toFixed(2);
    if(subtotal!==money(q.total_amount))return fail('CRM quote total differs from its full selected line totals.');
    if(!Number.isSafeInteger(q.quote_v2_revision)||Number(q.quote_v2_revision)<1||!q.quote_group_id)return fail('CRM revision/group readback is invalid.');
    return {id,revision:Number(q.quote_v2_revision),status:'draft',groupId:text(q.quote_group_id),letter:text(q.quote_letter),customerJobId:q.created_job_id as string|null,customerName:text(q.customer_name),customerContact:{phone:text(q.customer_phone),email:text(q.customer_email),address:text(q.customer_address),appointmentDate:q.appointment_date as string|null},deliveryRecord:false,finalized:false,lines,subtotal,tax:'0.00',total:money(q.total_amount),photos:(photos.data as Row[]).filter(p=>p.uploaded_at).map(p=>({id:text(p.photo_id),lineId:text(p.line_item_id)}))};
  };
  return {
    readback:id=>readSnapshot(id),
    async createOrResumeDraft(input){
      const spec=validateSupplierSpec(input.spec);
      if(input.draftOnly!==true||!input.journal)return fail('A draft-only durable customer journal is required.','adapter_unavailable');
      if(!evidence||typeof evidence.reference!=='string'||evidence.accountId!==MOBILE_QUOTE_ACCOUNT_ID||evidence.feePolicy!=='blind-shade-install-ship-v1'||!evidence.reference.trim())return fail('The deployed 805 merchandise-plus-automatic-fees policy must be verified before CRM writes.','adapter_unavailable');
      if(spec.tax.treatment!=='excluded_confirmed'||spec.tax.amount!=='0.00')return fail('This CRM schema has no verified tax write contract; only explicitly confirmed zero additional tax is supported.','pricing_decision');
      if(input.prices.length!==spec.lines.length||new Set(input.prices.map(p=>p.lineId)).size!==spec.lines.length||spec.lines.some(line=>!input.prices.some(p=>p.lineId===line.id)))return fail('Every submitted CRM line needs exactly one verified price.');
      const prices=spec.lines.map(line=>input.prices.find(p=>p.lineId===line.id)!);
      const amounts=spec.lines.map((line,i)=>priceInput(line,prices[i]));
      const operations=customerDraftOperations(spec,input.idempotencyKey);
      // Validate all structure BEFORE creating even an empty quote.
      parseSalesQuoteV2StructureBody({expectedRevision:1,idempotencyKey:input.idempotencyKey+':structure',operations});
      const initial:CustomerDraftProgress={key:input.idempotencyKey,quoteId:null,createRevision:null,structureRevision:null,revision:null,pricedLines:[]};
      let progress=structuredClone(input.journal.progress??initial);
      if(progress.key!==input.idempotencyKey)return fail('The customer journal belongs to a different immutable job.');
      const save=async()=>input.journal!.checkpoint(structuredClone(progress));
      await save();
      if(!progress.quoteId){
        const created=await createSalesQuoteV2Draft(db,actorId,parseCreateSalesQuoteV2DraftBody({idempotencyKey:input.idempotencyKey+':create',customerName:spec.customer.name,customerPhone:spec.customer.phone||null,customerEmail:spec.customer.email||null,customerAddress:spec.customer.address||null,appointmentDate:spec.customer.appointmentDate,createdJobId:spec.customer.jobId,quoteLetter:'A'}));
        progress={...progress,quoteId:created.quoteId,createRevision:created.revision,revision:created.revision};await save();
      }
      const id=progress.quoteId!;sameCustomer(await ownerQuote(id),spec);
      if(!progress.structureRevision){
        await save();
        const structured=await mutateSalesQuoteV2Structure(db,id,actorId,parseSalesQuoteV2StructureBody({expectedRevision:progress.createRevision,idempotencyKey:input.idempotencyKey+':structure',operations}));
        progress={...progress,structureRevision:structured.revision,revision:structured.revision};await save();
      }
      const structural=await readSnapshot(id,false);
      if(structural.letter!=='A'||structural.lines.length!==spec.lines.length||new Set(structural.lines.map(line=>line.id)).size!==spec.lines.length)return fail('Structural readback has an unexpected group letter or line set.');
      for(const line of spec.lines){
        const saved=structural.lines.find(saved=>saved.id===line.id);
        if(!saved)return fail('Structural readback is missing a submitted line.');
        for(const key of ['manufacturer','productId','productType','room','position','widthWhole','widthFraction','heightWhole','heightFraction','quantity','notes','designNotes'] as const)if(saved[key]!==line[key])return fail(`Structural ${key} readback differs from the submitted specification.`);
        if(canonicalJson(saved.configuration)!==canonicalJson(line.configuration))return fail('Structural options readback differs from the submitted specification.');
      }
      for(let i=0;i<spec.lines.length;i++){
        const line=spec.lines[i];if(progress.pricedLines.includes(line.id))continue;
        sameCustomer(await ownerQuote(id),spec);await save();
        const response=await db.rpc('set_sales_quote_line_price',{p_quote_id:id,p_line_item_id:line.id,p_variant:'A',p_unit_price:amounts[i],p_actor_id:actorId,p_expected_revision:progress.revision,p_request_id:stableDraftRequestUuid(`${input.idempotencyKey}:price:${line.id}`)});
        if(response.error)throw response.error;
        const result=response.data as Row;
        if(!result||result.designId!==stableDraftRequestUuid(`${input.idempotencyKey}:design:${line.id}`)||money(result.unitPrice)!==money(Number(prices[i].total)/line.quantity)||!Number.isSafeInteger(result.revision)||Number(result.revision)<=Number(progress.revision))return fail('CRM line price RPC returned inconsistent identity, cents or revision.');
        progress={...progress,revision:Number(result.revision),pricedLines:[...progress.pricedLines,line.id]};await save();
      }
      sameCustomer(await ownerQuote(id),spec);
      return readSnapshot(id);
    },
  };
}
