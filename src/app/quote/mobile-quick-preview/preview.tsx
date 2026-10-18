'use client';
import {MobileRoomSelector} from '@/components/crm/MobileRoomSelector';
import {MobileMeasurementKeypad,mobileMeasurementPatch} from '@/components/crm/MobileMeasurementKeypad';
import {useState} from 'react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MobileSupplierSequence} from '@/components/crm/MobileSupplierSequence';
import {MobileQuoteRequiredDetails} from '@/components/crm/MobileQuoteRequiredDetails';
import {DesignCard,normalizeCrmQuoteCatalog,buildCatalogSelectionPatch} from '@mts/components/crm/quote-builder/DesignCard';
import {SelectQuickButtonsProvider} from '@mts/components/ui/select';
import {buildUiCatalog} from '@/lib/quote/ui-catalog';
import {selectMobileQuoteRoom,selectMobileQuoteBedroomNumber,selectMobileQuoteWindowLetter,createMobileQuoteDraft,emptyMobileQuoteDesign,mobileQuoteLine,selectMobileQuoteProduct,updateMobileQuoteDesign} from '@/lib/crm/mobile-quote-draft';
import {prepareMobileSupplierDraft,selectSupplierFamily,selectSupplierManufacturer,selectSupplierMeasurementBasis,patchSupplierInputs} from '@/lib/crm/mobile-supplier-spec';
import styles from '@/components/crm/MobileQuoteWalkthrough.module.css';
import '@/mts-quote/mts-quote.css';
export function QuickQuotePreview(){
 const [client]=useState(()=>new QueryClient());
 const [products]=useState(()=>normalizeCrmQuoteCatalog({catalog:buildUiCatalog()}).products);
 const [draft,setDraft]=useState(()=>prepareMobileSupplierDraft(createMobileQuoteDraft('local-preview',{kind:'new',jobId:null,name:'Preview — never saved',phone:'',email:'',address:'',appointmentDate:null})));
 const line=draft.windows[0],family=line.activeProductId?line.families[line.activeProductId]:null;
 const patchLine=(patch:Partial<typeof line>)=>setDraft(d=>({...d,windows:[{...d.windows[0],...patch}]}));
 return <QueryClientProvider client={client}><main className={`${styles.shell} mobile-805-experience`} style={{maxWidth:520,margin:'auto',padding:'24px 16px 80px',background:'#0c1412',color:'white',minHeight:'100vh'}}><small>805 SHUTTERS · LOCAL UI PREVIEW</small><h1>Quick quote</h1><p>Red: required · Green: confirmed · Yellow: optional.</p><MobileSupplierSequence draft={draft} line={line} products={products} onSettings={patch=>setDraft(d=>({...d,draftJob:{...d.draftJob!,...patch}}))} chooseFamily={family=>setDraft(d=>selectSupplierFamily(d,line.id,family))} chooseManufacturer={m=>setDraft(d=>selectSupplierManufacturer(d,line.id,m))} chooseProduct={id=>{const p=products.find(p=>p.id===id);if(p)setDraft(d=>selectMobileQuoteProduct(d,line.id,{productId:p.id,productType:p.productType,design:{...emptyMobileQuoteDesign(line.id,p.productType),...buildCatalogSelectionPatch({},p)}}));}} chooseMeasurementBasis={basis=>setDraft(d=>selectSupplierMeasurementBasis(d,line.id,basis))} patch={patch=>setDraft(d=>patchSupplierInputs(d,line.id,patch))} roomEditor={<MobileRoomSelector buttonsOnly window={line} onSelectRoom={room=>setDraft(d=>selectMobileQuoteRoom(d,line.id,room))} onSelectBedroom={room=>setDraft(d=>selectMobileQuoteBedroomNumber(d,line.id,room))} onSelectLetter={letter=>setDraft(d=>selectMobileQuoteWindowLetter(d,line.id,letter))} onCustomRoomChange={()=>{}}/>} dimensionEditor={<MobileMeasurementKeypad keypadOnly blankZero widthWhole={line.widthWhole} widthFraction={line.widthFraction} heightWhole={line.heightWhole} heightFraction={line.heightFraction} onWholeChange={(side,whole)=>patchLine(mobileMeasurementPatch(side,whole))} onFractionChange={(side,fraction)=>patchLine({[side==='width'?'widthFraction':'heightFraction']:fraction})}/>} optionsEditor={<SelectQuickButtonsProvider collapseSelected><div className={styles.designCard}>{family&&<DesignCard lineItem={mobileQuoteLine(draft,line)} lineNumber={1} designs={[family.design]} mobilePresentation authoritativeV2 catalogProducts={products} onUpdateDesign={(patch,origin)=>setDraft(d=>updateMobileQuoteDesign(d,line.id,patch,origin==='user'))} onSaveLinePrice={async()=>{}} onCopyAll={()=>{}} onCopySome={()=>{}} onStack={()=>{}} copyMode="none" isCopyTarget={false} isSelectedTarget={false} onToggleCopyTarget={()=>{}}/>}<MobileQuoteRequiredDetails line={line} onDesign={patch=>setDraft(d=>updateMobileQuoteDesign(d,line.id,patch,true))} onInputs={patch=>setDraft(d=>patchSupplierInputs(d,line.id,patch))}/></div></SelectQuickButtonsProvider>}/></main></QueryClientProvider>;
}
