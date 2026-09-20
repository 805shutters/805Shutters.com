/** Ultimate Wood p24 and Ultimate Faux Wood p15, September 2026 guides. */
export function normanBlindClips(netBlindWidth:number,customOrCommonWidth:number|null,faux:boolean){
  const basis=customOrCommonWidth??netBlindWidth;
  const quantity=basis<=37?2:basis<60?3:basis<=96?4:null;
  return {quantity,basisInches:basis,basis:customOrCommonWidth===null?'net_blind_width':'custom_or_common_valance_width',
    minimum:quantity===null?(faux?5:4):quantity,maximum:quantity===null?(faux?17:null):quantity,
    requiresFactoryConfirmation:quantity===null};
}
export function ultimateFauxLadders(netWidth:number){
  return {ladders:netWidth<=24?2:netWidth<=37?3:netWidth<=50?4:netWidth<=63?5:netWidth<=76?6:netWidth<=89?7:8,
    cords:netWidth<=50?4:8,ladderCountStatus:'guide_standard_may_vary_near_width_boundary'};
}
export function normanBlindScrews(brackets:number,hasShims:boolean,holdDowns:number,sideMount:boolean){
  return {mounting:brackets*2,mountingLength:hasShims?2:1.25,holdDown:holdDowns,holdDownLength:.75,sideNutBolt:sideMount?4:0};
}
