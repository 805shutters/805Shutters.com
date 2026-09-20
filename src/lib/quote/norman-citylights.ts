/** August 1, 2026 dealer guide, pages 7–9 and 15–19. */
export const CITYLIGHTS_SOURCE = "norman-citylights-guide-2026-08-01" as const;
export const CITYLIGHTS_WANDS = {1:["17","21","24","30","36","48","60"],2:["17.75","24","29.75","38.25","47.25","60"]} as const;
export function citylightsWand(slat:number,height:number){return slat===1?height<=36?17:height<=48?21:height<=60?24:height<=72?30:height<=84?36:48:height<=36?17.75:height<=48?24:height<=72?29.75:38.25;}
export function citylightsBrackets(slat:number,width:number){return width<=37?2:slat===1?width<=60?3:4:width<=47?3:width<=75?4:5;}
export function citylightsLadders(slat:number,route:string,width:number,height:number){
 if(slat===1){
  const ladder=width<=32?2:width<=52?3:width<=72?4:5;
  const cord=route==="Privacy"?width<=39?2:width<=52?3:width<=72?4:5:width<=39?4:width<=52?5:width<=60?4:width<=72?6:5;
  return {ladder,cord};
 }
 return {ladder:width<=37?2:width<=48?3:width<=87?4:5,cord:width>72||height>84&&width>67?8:4};
}
