/** Presentation catalog only. Order choices and pricing remain in the quote catalog. */
export const VALANCE_ART_ROOT = "/images/contract-illustrations/valances-c-v1";
const normalize = (value: string) => value.toLowerCase().replace(/[_*-]/g, " ").replace(/[“”″]/g, '"').replace(/\s+/g, " ").trim();

export const VALANCE_ARTWORK = [
  { id: "norman-fabric", manufacturer: "norman", label: "Fabric valance", products: ["roller shades"], aliases: ['3 1/2" Fabric Valance', '4 1/2" Fabric Valance', '6" Fabric Valance', '8" Fabric Valance', "Fabric Valance"] },
  { id: "norman-wood", manufacturer: "norman", label: "Modern wood valance", products: ["roller shades"], aliases: ['4 1/2" Modern Wood Valance', "Modern Wood Valance", "Wood Valance"] },
  { id: "norman-curved-fascia", manufacturer: "norman", label: "Curved fascia", products: ["roller shades"], aliases: ["Plain Curved Fascia", "Curved Fascia"] },
  { id: "norman-square-fascia", manufacturer: "norman", label: "Square fascia", products: ["roller shades"], aliases: ["Square Fascia"] },
  { id: "norman-curved-cassette", manufacturer: "norman", label: "Curved cassette", products: ["roller shades"], aliases: ["Curved Cassette", "Cassette"] },
  { id: "norman-square-cassette", manufacturer: "norman", label: "Square cassette", products: ["roller shades"], aliases: ["Square Cassette"] },
  { id: "polar-fascia", manufacturer: "polar", label: "L fascia", products: ["roller shades"], aliases: ["L Fascia", "Standard L Fascia", '3" Fascia', '4" Fascia', '5" Fascia', '7" Fascia', "Fascia 3", "Fascia 4", "Fascia 5", "Fascia 7", '3" Square Fascia', '4" Square Fascia', '5" Square Fascia', '7" Square Fascia', '3" (7.6 cm) Fascia'] },
  { id: "polar-fabric-wrapped", manufacturer: "polar", label: "Fabric-wrapped fascia", products: ["roller shades"], aliases: ["Fabric Wrapped", "Fabric Wrapped Fascia", "Fabric Wrapped L Fascia"] },
  { id: "polar-curved-cassette", manufacturer: "polar", label: "Curved cassette", products: ["roller shades"], aliases: ["Curved Cassette", "Curved Cassette with Fabric Insert"] },
  { id: "polar-square-cassette", manufacturer: "polar", label: "Square cassette", products: ["roller shades"], aliases: ["Square Cassette"] },
  { id: "polar-head-pocket", manufacturer: "polar", label: "Head pocket", products: ["roller shades"], aliases: ["Head Pocket", '4" Head Pocket', '5" Head Pocket', '5.5" Head Pocket', "Head Pocket with Closure Plate"] },
  { id: "norman-contempo", manufacturer: "norman", label: "Contempo valance", products: ["wood blinds", "faux wood blinds"], aliases: ["Contempo", "Contempo Valance"] },
  { id: "norman-designer-crown", manufacturer: "norman", label: "Designer crown valance", products: ["wood blinds", "faux wood blinds"], aliases: ["Designer Crown", "Designer Crown Valance", '3 1/4" Designer Crown Valance'] },
  { id: "lotus-crown", manufacturer: "lotus", label: "Crown valance", products: ["faux wood blinds"], aliases: ["Crown", "Crown Valance", "Royal Crown Valance", '3 1/4" Crown Valance'] },
  { id: "lotus-beaded", manufacturer: "lotus", label: "Beaded valance", products: ["faux wood blinds"], aliases: ["Beaded", "Beaded Valance", '2 1/2" Beaded Valance'] },
  { id: "norman-curved-fabric", manufacturer: "norman", label: "Curved fascia with fabric", products: ["roller shades"], aliases: ["Curved Fascia with Fabric"] },
] as const;

export function valanceArtwork(id: string | null | undefined) {
  const art = VALANCE_ARTWORK.find((entry) => entry.id === id);
  return art ? { ...art, src: `${VALANCE_ART_ROOT}/${art.id}.webp` } : null;
}

/** Match manufacturer BEFORE customer branding removes supplier attribution. */
export function valanceIllustration(productType: string, options: readonly string[] = [], manufacturerId?: string, surchargeIds: readonly string[] = []): string | null {
  const fields = options.flatMap((option) => {
    const colon = option.indexOf(":");
    return colon < 0 ? [] : [[normalize(option.slice(0, colon)), normalize(option.slice(colon + 1))]];
  });
  const manufacturers = new Set([...(manufacturerId ? [normalize(manufacturerId)] : []), ...fields.filter(([key]) => ["supplier", "manufacturer", "manufacturer selection"].includes(key)).map(([, value]) => value)]
    .map((value) => /^(norman|norman usa)$/.test(value) ? "norman" : /^(polar|polar shades)$/.test(value) ? "polar" : /^(lotus|lotus windoware)$/.test(value) ? "lotus" : value));
  if (manufacturers.size !== 1) return null;
  const manufacturer = [...manufacturers][0];
  const product = normalize(productType) === "interior roller" ? "roller shades" : normalize(productType);
  const explicit = fields.filter(([key]) => ["valance", "valance type", "valance style"].includes(key)).map(([, value]) => value);
  let selected = explicit.length ? explicit : fields.filter(([key]) => ["top treatment", "top treatment class", "roller top treatment"].includes(key)).map(([, value]) => value);
  if (!selected.length) {
    const polarSurcharges: Record<string, string> = { fascia_3: '3" Fascia', fascia_4: '4" Fascia', fascia_5: '5" Fascia', fascia_7: '7" Fascia', head_pocket_4: '4" Head Pocket', head_pocket_5_5: '5.5" Head Pocket' };
    selected = manufacturer === "polar" ? surchargeIds.flatMap((id) => polarSurcharges[id] ? [normalize(polarSurcharges[id])] : []) : [];
  }
  if (!selected.length || selected.some((value) => /^(none|no valance|no top treatment|open roll|no valance \/ open roll)$/.test(value))) return null;
  const matches = selected.map((value) => VALANCE_ARTWORK.find((art) => art.manufacturer === manufacturer && (art.products as readonly string[]).includes(product) && art.aliases.some((alias) => normalize(alias) === value))?.id);
  return matches.every(Boolean) && new Set(matches).size === 1 ? matches[0]! : null;
}

/** Read selected surcharge identities only, without prices or inferred defaults. */
export function valanceSurchargeIds(value: unknown): string[] {
  return Array.isArray(value) ? value.flatMap((entry) => entry && typeof entry === "object" && typeof entry.id === "string" ? [entry.id] : []) : [];
}
