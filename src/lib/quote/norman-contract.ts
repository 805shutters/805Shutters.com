import type { CatalogProduct, CatalogProgram } from "./catalog/types";
import type { ProductColorOption } from "./product-color-options";

export const CONTRACT_FAUX = "norman_contract_faux_wood";
export const CONTRACT_VERTICAL = "norman_contract_vertical";
export const CONTRACT_FAUX_SOURCE = "norman-contract-faux-2024-05-29";
export const CONTRACT_VERTICAL_SOURCE = "norman-contract-vertical-2024-11-01";
export const CONTRACT_REQUEST_SOURCE = "norman-contract-request-2021-12-01";
export const CONTRACT_FAUX_URL = "https://download.normanwindowcoverings.com/Document/Service/Commercial/Contract%20Cordless%20Faux%20Wood%20Blind%20Product%20Specifications.pdf";
export const CONTRACT_VERTICAL_URL = "https://download.normanwindowcoverings.com/Document/Service/Commercial/3.5''%20Contract%20Vertical%20Blind%20Product%20Specifications.pdf";
export function isNormanContractProduct(id: string): boolean { return id === CONTRACT_FAUX || id === CONTRACT_VERTICAL; }
export const CONTRACT_VALANCES = ["None", "2.5-inch Modern Curved", "3.25-inch Designer Crown"] as const;
export const CONTRACT_FITS = ["Fully Inside", "Semi Inside Bracket Flush", "Semi Inside Minimum"] as const;
export const CONTRACT_VERTICAL_FITS = ["Fully Inside", "Semi Inside"] as const;
function program(id: string, name: string, vertical: boolean): CatalogProgram {
  return { id, name, priceGroup: null, priceAxis: "wh", priceBasis: "manual_required", sourceId: vertical ? CONTRACT_VERTICAL_SOURCE : CONTRACT_FAUX_SOURCE,
    grid: { widths: [], heights: [], prices: [] }, minWidth: vertical ? 18 : 16.5, maxWidth: vertical ? 100 : 96, minHeight: vertical ? 36 : 24, maxHeight: vertical ? 108 : 96, maxAreaSqft: vertical ? 75 : 48,
    fabricCollections: [], sourcePages: [vertical ? 6 : 7], notes: ["Contract Sales specification only; current project pricing must be obtained from Norman. No retail grid or dealer factor is established by this document."] };
}
export const normanContractProducts: CatalogProduct[] = [
  { id: CONTRACT_FAUX, name: "Contract Cordless Faux Wood Blinds", productType: "Faux Wood Blinds", manufacturer: "Norman", priceBasis: "manual_required", customerRetailStatus: "unverified", provisional: true,
    source: "Norman Contract Sales Edition M, May 29, 2024", pages: [3,5,6,7,8,9,10,11,12,15], fabricRouting: null,
    programs: [program("norman_contract_faux_2", 'Contract 2-inch Cordless', false), program("norman_contract_faux_2_5", 'Contract 2.5-inch Cordless', false)],
    surcharges: [], fabricByYard: [], freightStatus: "unresolved", notes: ["Five active color/finish combinations. Bright White 6018 discontinued.", "No valance is standard. Optional valance and hardware charges require a current Contract Sales quote. Ocean freight."] },
  { id: CONTRACT_VERTICAL, name: "Contract 3.5-inch Vertical Blinds", productType: "Vertical Blinds", manufacturer: "Norman", priceBasis: "manual_required", customerRetailStatus: "unverified", provisional: true,
    source: "Norman Contract Sales Edition B, November 1, 2024", pages: [3,4,5,6,8,9,10], fabricRouting: null,
    programs: [program("norman_contract_vertical_3_5", "Contract 3.5-inch PVC Headrail", true)], surcharges: [], fabricByYard: [], freightStatus: "unresolved",
    notes: ["Quoted through Norman Contract Sales request form; minimum order 50 blinds across the order.", "Three smooth PVC vane colors; reversible left/right wand. Ocean or air freight quoted per project."] },
];
const fauxFinishes = [["6016","Pure White","Smooth",true],["6016","Pure White","Embossed",true],["6017","Silk White","Smooth",true],["6019","Pearl","Smooth",true],["6051","Designer White","Smooth",true],["6018","Bright White","Smooth",false]] as const;
export const normanContractColors: ProductColorOption[] = [
  ...["2", "2.5"].flatMap(slat => fauxFinishes.map(([code,name,finish,available]) => ({ productId: CONTRACT_FAUX, programId: slat === "2" ? "norman_contract_faux_2" : "norman_contract_faux_2_5", code, name, finish: `${slat}-inch ${finish}`, available, detail: { slat_size: `${slat}\"`, finish_type: finish }, page: 6 }))),
  ...[["8076","Pearl"],["8075","Silk White"],["8071","Pure White"]].map(([code,name]) => ({ productId: CONTRACT_VERTICAL, programId: "norman_contract_vertical_3_5", code, name, finish: "3.5-inch Smooth PVC", available: true, detail: { slat_size: '3.5"', finish_type: "Smooth" }, page: 5 })),
].map(row => ({ id: `${row.productId}:${row.code}:${row.finish.replaceAll(" ","_")}`, productId: row.productId, programId: row.programId,
  collection: row.finish, publicCollection: row.finish, fabricType: row.productId === CONTRACT_FAUX ? "Faux Wood" : "PVC", colorCode: row.code, colorName: row.name, publicColorName: row.name,
  frStatus: "Not specified", imageUrl: "", sourcePage: `${row.productId === CONTRACT_FAUX ? CONTRACT_FAUX_URL : CONTRACT_VERTICAL_URL}#page=${row.page}`, sourcePageModified: null,
  sourceNote: row.available ? "Current dealer binder Contract Sales specification; project pricing not supplied." : "Discontinued in Edition M, page 6. Retained for historical identification only.",
  selectionMode: "program", requiresProgram: false, available: row.available, automaticDetails: row.detail, searchText: `${row.code} ${row.name} ${row.finish}`.toLowerCase(),
}));
