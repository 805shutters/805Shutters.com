// Synthetic data only. This module is never imported by application entry points.
import { createMobileQuoteDraft,emptyMobileQuoteDesign,selectMobileQuoteProduct } from './mobile-quote-draft';
import { jobSettings,selectSupplierFamily,selectSupplierManufacturer,patchSupplierInputs } from './mobile-supplier-spec';
export function syntheticDraft(){
  let draft=createMobileQuoteDraft('synthetic-owner',{kind:'new',jobId:null,name:'SYNTHETIC CUSTOMER',phone:'',email:'',address:'',appointmentDate:null});
  draft.draftJob={...jobSettings(draft),multiplier:'2',tax:{treatment:'excluded_confirmed',amount:'0.00',instruction:'SYNTHETIC test decision'}};
  draft=selectSupplierFamily(draft,draft.windows[0].id,'Roller Shades');draft=selectSupplierManufacturer(draft,draft.windows[0].id,'Norman');
  draft=selectMobileQuoteProduct(draft,draft.windows[0].id,{productId:'roller',productType:'Roller Shades',design:{...emptyMobileQuoteDesign(draft.windows[0].id,'Roller Shades'),supplier:'Norman',options_json:{program_id:'SYNTHETIC',nested:{width:10,height:10,lift:'SYNTHETIC'}}}});
  draft=patchSupplierInputs(draft,draft.windows[0].id,{colorFabric:'SYNTHETIC',mount:'SYNTHETIC',control:'SYNTHETIC',controlSide:'Not applicable',shippingBasis:'line'});
  Object.assign(draft.windows[0],{room:'SYNTHETIC ROOM',widthWhole:36,widthFraction:'3/16',heightWhole:60,heightFraction:'15/16',notes:'Do not discard this note.'});
  return draft;
}
