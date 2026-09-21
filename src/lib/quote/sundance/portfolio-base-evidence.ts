import {lookupSundanceSourceGrid} from './catalog';
import {sundancePortfolioColors} from './portfolio-assortment';
import {lookupSundanceValanceSource} from './valance-schedules';

/** Exact source base plus liner only; excludes operating options, assemblies and account pricing. */
export function sundancePortfolioBaseEvidence(c:Record<string,unknown>,width:number,height:number){
 const color=sundancePortfolioColors.find(row=>row.id===c.fabric_color_id);
 if(!color||color.colorCode!==c.fabric_color_code||color.fabricType!==c.roman_style)return null;
 if(!['LF03 Light-Filtering Ivory','LF02 Light-Filtering Snow White','BO01 Black-Out White'].includes(String(c.sundance_portfolio_liner)))return null;
 const valanceOnly=color.fabricType==='Valance Only';
 if(!valanceOnly&&color.programId!==c.catalog_program_id)return null;
 const expectedValance=color.automaticDetails.catalog_sundance_portfolio_valance_id;
 if(valanceOnly&&(!expectedValance||expectedValance!==c.catalog_sundance_portfolio_valance_id))return null;
 const grid=valanceOnly
  ?lookupSundanceValanceSource(String(expectedValance),width,height)
  :lookupSundanceSourceGrid('sundance_portfolio_roman',String(color.programId),width,height);
 if(!grid)return null;
 const baseRetail=grid.sourceRetail,blackoutRetail=c.sundance_portfolio_liner==='BO01 Black-Out White'?Math.round(baseRetail*10)/100:0;
 return {baseRetail,blackoutRetail,baseWithLinerRetail:Math.round((baseRetail+blackoutRetail)*100)/100,gridWidth:grid.gridWidth,gridHeight:'gridHeight' in grid?grid.gridHeight:null,sourcePage:valanceOnly?25:'sourcePage' in grid?grid.sourcePage:null,sourceId:'sundance-sundance-portfolio-roman-shade-product-price-guide-2026-421a4cba9a72',customerPriceEligible:false as const};
}
