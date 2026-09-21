/** Physical envelopes from A PDF26/28 and D PDF14/16; these are not minimum mounting-depth requirements. */
export const sundanceRollerTopDimensions:Record<string,{height:number;depth:number}>={
 '3" Square Cassette':{height:3,depth:3.5},'Small Round Cassette':{height:3,depth:3.5},'Large Round Cassette':{height:3.5,depth:4},'Tuscany Cassette':{height:3.875,depth:3.5},'Fascia 3"':{height:3.375,depth:3.125},'Fascia 4"':{height:3.875,depth:4.125},'Fascia 5"':{height:5.125,depth:5.125},'Contractor’s Box 5"':{height:5.5,depth:5.5},
};
export const sundanceDualBracketDimensions:Record<string,{height:number;depth:number}>={Vertical:{height:5.625,depth:2},'Small 45-degree':{height:4,depth:4},'Large 45-degree':{height:4.875,depth:4.875},'5-inch fascia dual':{height:5.125,depth:5.125}};
export function sundanceHorizontalRailReference(productId:string,grade:unknown,width:number){
 if(productId.includes('advantage_ii')||productId.includes('premium_ii'))return{page:7,text:`Headrail2 ×2¼ inches; installation bracket2⅜ ×2¼. Included center support for widths over50 inches${width>50?' (required for this width)':''}.`};
 if(productId==='sundance_aluminum_1')return{page:12,text:grade==='Premium'?'Premium headrail1½ inches high ×1¾ deep; white lift cord.':'Standard decorative steel headrail1 ×1½ inches; white lift cord.'};
 if(productId==='sundance_aluminum_2')return{page:12,text:'Headrail2 ×2 inches; white lift cord; two-slat standard valance.'};
 if(productId==='sundance_chateau_woods')return{page:20,text:`Included center support for widths over54 inches${width>54?' (required for this width)':''}.`};
 return null;
}
