/** Ultimate Normandy Wood dealer guide, effective September 1, 2026. */
export const WOOD_SOURCE = "norman-wood-blinds-guide-2026-09-01";
export const WOOD_VALANCES = ["No Valance", "Designer Crown", "Contempo", "Linear"] as const;
export const WOOD_FITS = ["Fully Recessed", "Bracket Flush", "Minimum Depth", "Shallow Mounting Holes"] as const;
export const WOOD_WANDS = ["17.75", "29.75", "38.25", "47.25", "60"] as const;
export const WOOD_CODES = ["ND001","ND003","ND006","ND080","ND053","ND091","ND617","ND017","ND110","ND114","ND108","ND204","ND211","ND230","ND221","ND246","1003","1501","1502","1301","1109","1111","1203","1204","1112","1114"] as const;
export const woodWandDrop = (height:number) => height<=48?17.75:height<=72?29.75:38.25;
export const woodBrackets = (width:number) => width<=37?2:width<=47?3:width<=75?4:5;
export function woodLadders(width:number,large:boolean){return width<=(large?36.5:32)?{ladders:2,cords:4}:width<40?{ladders:3,cords:4}:width<=(large?54:52)?{ladders:3,cords:6}:width<=(large?75:78)?{ladders:4,cords:8}:{ladders:5,cords:8};}

/** The 11¾-inch default is a running change for heights at most 36 inches, not an all-height optional wand. */
export function woodWandChoices(height:number,asOf="2026-09-20"):readonly string[]{return asOf>="2026-09-20"&&height<=36?["11.75",...WOOD_WANDS]:WOOD_WANDS;}
