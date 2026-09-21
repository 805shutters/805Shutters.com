import {expect,it} from 'vitest';
import {sundancePortfolioColorPatch} from './portfolio-assortment';
import {sundancePortfolioBaseEvidence} from './portfolio-base-evidence';
function options(style='Knife Pleat'){return {...sundancePortfolioColorPatch({roman_style:style},`sundance_portfolio_roman:ASE01:${style}`)!,sundance_portfolio_liner:'BO01 Black-Out White'};}
it('adds 10% to the exact published shade cell, excluding motors and other retail options',()=>{
 // Portfolio PDF21 GroupA:36x60=$666;36x66=$683. PDF25 blackout=10% of shade price.
 expect(sundancePortfolioBaseEvidence({...options(),sundance_portfolio_control:'Somfy Sonesse Ultra 30',sundance_portfolio_somfy_charger_qty:3},36,60)).toMatchObject({baseRetail:666,blackoutRetail:66.6,baseWithLinerRetail:732.6,sourcePage:21,customerPriceEligible:false});
 expect(sundancePortfolioBaseEvidence(options(),36,60.0625)).toMatchObject({baseRetail:683,blackoutRetail:68.3,gridHeight:66});
});
it('preserves included light-filtering liner and the separate valance-only percentage basis',()=>{
 expect(sundancePortfolioBaseEvidence({...options(),sundance_portfolio_liner:'LF03 Light-Filtering Ivory'},36,60)).toMatchObject({blackoutRetail:0,baseWithLinerRetail:666});
 // PDF25 GroupA 36-inch valance=$314, length<=18, blackout10%.
 expect(sundancePortfolioBaseEvidence(options('Valance Only'),36,18)).toMatchObject({baseRetail:314,blackoutRetail:31.4,baseWithLinerRetail:345.4,sourcePage:25});
 expect(sundancePortfolioBaseEvidence(options('Valance Only'),36,18.0625)).toBeNull();
});
it('does not fabricate a base for invalid identities, mismatched styles/programs, unspecified liners or missing grid cells',()=>{
 for(const patch of [{fabric_color_id:'unknown'},{roman_style:'Hobbled'},{catalog_program_id:'sundance_portfolio_roman_p21_t2'},{sundance_portfolio_liner:null}])expect(sundancePortfolioBaseEvidence({...options(),...patch},36,60)).toBeNull();
 expect(sundancePortfolioBaseEvidence(options(),96.0625,60)).toBeNull();
 expect(sundancePortfolioBaseEvidence({...options('Valance Only'),catalog_sundance_portfolio_valance_id:'wrong'},36,12)).toBeNull();
});
