/** Ultimate Faux Wood September 2026 dealer guide, pages 6–15. */
export const ULTIMATE_FAUX_SOURCE = "norman-ultimate-faux-guide-2026-09-01";
export const ULTIMATE_FAUX_VALANCES = ["None", "2.5-inch Modern Curved", "3.25-inch Designer Crown", "3-inch Linear"] as const;
export const ULTIMATE_FAUX_FITS = ["Fully Recessed", "Bracket Flush", "Minimum Depth", "Shallow Mounting Holes"] as const;
export const ULTIMATE_FAUX_WANDS = ["11.75", "17.75", "24", "29.75", "38.25", "47.25", "60"] as const;
export const ULTIMATE_FAUX_COLORS = [
 ...["P001", "E008", "P003", "P004", "P006", "P075"].flatMap(code => ["Smooth", "Embossed"].map(finish => ({code,finish,printed:false}))),
 ...["6957", "P230", "6959", "P226"].map(code => ({code,finish:"Embossed",printed:true})),
];
export const ULTIMATE_FAUX_FACTORY_CODES: Record<string,string> = {P001:"6016",E008:"6051",P003:"6017",P004:"6018",P006:"6019",P075:"6101","6957":"6957",P230:"6922","6959":"6959",P226:"6921"};
export const ultimateFauxColor = (code:unknown,finish:unknown) => ULTIMATE_FAUX_COLORS.find(row => row.code === code && String(finish).toLowerCase().endsWith(row.finish.toLowerCase()));
export const ultimateFauxWandDrop = (height:number) => height<=36?17.75:height<=48?24:height<=72?29.75:38.25;
export const ultimateFauxBrackets = (netWidth:number) => netWidth<=37?2:netWidth<=47?3:netWidth<=75?4:5;
