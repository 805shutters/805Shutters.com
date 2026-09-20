/** SmartPrivacy guide, October 2024 revision, pp6–11. Independent of Ultimate Faux Wood. */
export const SMARTPRIVACY_SOURCE = "norman-smartprivacy-guide-2024-10";
export const SMARTPRIVACY_VALANCES = ["None", "2.5-inch Modern Curved", "3.25-inch Designer Crown"] as const;
export const SMARTPRIVACY_FITS = ["Fully Recessed", "Bracket Flush", "Minimum Depth"] as const;
export const SMARTPRIVACY_WAND_DROPS = ["11.75", "17.75", "29.75", "38.25", "47.25"] as const;
export const SMARTPRIVACY_COLORS = [
  {code:"P001",finish:"Smooth",factoryCode:"6016",headrail:"2080 Pure White",wand:"2080 Pure White",bottomRail:"2080 Pure White",bracket:"3058 White",cord:"T001 White",endCap:"2037 Snow White"},
  {code:"P001",finish:"Embossed",factoryCode:"6016",headrail:"2080 Pure White",wand:"2080 Pure White",bottomRail:"2080 Pure White",bracket:"3058 White",cord:"T001 White",endCap:"2037 Snow White"},
  {code:"E008",finish:"Smooth",factoryCode:"6051",headrail:"20103 Designer White",wand:"2080 Pure White",bottomRail:"20103 Designer White",bracket:"3058 White",cord:"T001 White",endCap:"20103 Designer White"},
  {code:"P003",finish:"Smooth",factoryCode:"6017",headrail:"2003 Silk White",wand:"2080 Pure White",bottomRail:"2003 Silk White",bracket:"3058 White",cord:"T001 White",endCap:"2037 Snow White"},
  {code:"P006",finish:"Smooth",factoryCode:"6019",headrail:"2095 Pearl",wand:"2095 Pearl",bottomRail:"2095 Pearl",bracket:"H002 Vanilla",cord:"5020 Alabaster",endCap:"2012 Cameo"},
  {code:"6957",finish:"Embossed",factoryCode:"6957",headrail:"2003 Silk White",wand:"2080 Pure White",bottomRail:"6957 Mist",bracket:"3058 White",cord:"T001 White",endCap:"2037 Snow White"},
] as const;
export const smartprivacyColor = (code:unknown,finish:unknown) => SMARTPRIVACY_COLORS.find(row=>row.code===code && String(finish).toLowerCase().endsWith(row.finish.toLowerCase()));
export const smartprivacyWandDrop = (height:number) => height<=36?11.75:height<=48?17.75:height<=72?29.75:38.25;
export const smartprivacyBracketCount = (width:number) => width<=37?2:width<=47?3:4;
