import {expect,it} from 'vitest';
import {sundancePrivacyPieceEvidence,sundancePrivacyPieceDescription,readSundancePrivacyPieces,SUNDANCE_PRIVACY_PIECES_KEY} from './privacy-pieces';
import {sundanceShadeOptionEvidence,validateSundanceShadeConfiguration} from './shade-configuration';
import type {SelectionContext} from '@/lib/quote-v2/core';
import {sundanceComponentConfiguration} from './assembly-records';
import {getQuoteDesignDetails} from '@mts/lib/quoteDesignDetails';
import type {SalesQuoteDesign} from '@mts/types/quote';
function options(kind='Aluminum side channels',length=60,quantity=2){return{sundance_shade_privacy:kind,[SUNDANCE_PRIVACY_PIECES_KEY]:{version:1,kind,pieces:[{id:'a',lengthInches:length,quantity}]}};}
it('retains exact independently measured pieces and computes whole-foot source amounts at the published rates',()=>{
 const c=options();expect(sundancePrivacyPieceEvidence(c)).toMatchObject({feet:10,rate:14,sourceNet:140,issues:[],customerPriceEligible:false});
 expect(sundancePrivacyPieceEvidence(options('Solar bar',36,1))).toMatchObject({feet:3,rate:3,sourceNet:9});
 const reopened=JSON.parse(JSON.stringify(c));expect(sundancePrivacyPieceEvidence(reopened)).toEqual(sundancePrivacyPieceEvidence(c));
 expect(sundanceShadeOptionEvidence('sundance_roller','',c,36).netSubtotal).toBe(140);
 expect(sundanceShadeOptionEvidence('sundance_louvolite_roller','',c,36).netSubtotal).toBe(140);
});
it('does not invent per-piece fractional-foot billing even when summed lengths reach whole feet',()=>{
 const c=options('Aluminum side channels',18,2),e=sundancePrivacyPieceEvidence(c);
 expect(e.feet).toBe(3);expect(e.unroundedSourceNet).toBe(42);expect(e.sourceNet).toBeNull();expect(e.issues[0]).toContain('fractional-foot');
 expect(sundanceShadeOptionEvidence('sundance_roller','',c,36).netSubtotal).toBe(0);
 expect(validateSundanceShadeConfiguration({productId:'sundance_roller',programId:null,widthInches:36,heightInches:60,configuration:c as unknown as SelectionContext['configuration']}).map(i=>i.ruleId)).toContain('sundance.shade.privacy_pieces');
});
it('rejects malformed or stale records, duplicate IDs and invalid quantities and dimensions',()=>{
 expect(readSundancePrivacyPieces({version:2,kind:'Solar bar',pieces:[]})).toBeNull();
 for(const c of [options('Solar bar',0),options('Solar bar',24,-1),options('Solar bar',24,1.5),options('Solar bar',NaN),{sundance_shade_privacy:'Solar bar'},{...options(),sundance_shade_privacy:'None'},{...options(),sundance_shade_privacy:'Solar bar'}])expect(sundancePrivacyPieceEvidence(c).issues.length).toBeGreaterThan(0);
 const c=options();c[SUNDANCE_PRIVACY_PIECES_KEY].pieces.push({...c[SUNDANCE_PRIVACY_PIECES_KEY].pieces[0]});expect(sundancePrivacyPieceEvidence(c).issues).toContain('Each privacy piece requires a distinct saved identity.');
});
it('describes physical pieces without serialized IDs, version or source charges and avoids cloning them into new components',()=>{
 const c=options();expect(sundancePrivacyPieceDescription(c[SUNDANCE_PRIVACY_PIECES_KEY])).toBe('Aluminum side channels: 2 × 60 inches');
 expect(getQuoteDesignDetails({options_json:{[SUNDANCE_PRIVACY_PIECES_KEY]:c[SUNDANCE_PRIVACY_PIECES_KEY]}} as unknown as SalesQuoteDesign)).toEqual([{label:'Privacy accessory pieces',value:'Aluminum side channels: 2 × 60 inches'}]);
 expect(sundanceComponentConfiguration(c)[SUNDANCE_PRIVACY_PIECES_KEY]).toBeUndefined();
});
