import { shutterIllustration } from "./shutter-illustrations";

/** Approved C artwork. Presentation only; never supplies missing order selections. */
export const CONTRACT_ART_ROOT = "/images/contract-illustrations/c-v1";

export type ContractIllustration = {
  src: string;
  alt: string;
  remote: boolean;
  mirror: boolean;
  referenceNote?: string;
  panels?: number;
  shutterLayout?: string;
  operationReference?: { src: string; label: string };
};

const PRODUCTS: Record<string, string> = {
  shutters: "shutters", shutter: "shutters",
  "roller shade": "roller", "roller shades": "roller",
  "roman shade": "roman", "roman shades": "roman",
  "honeycomb shade": "honeycomb", "honeycomb shades": "honeycomb",
  "cellular shade": "honeycomb", "cellular shades": "honeycomb",
  "sheer shade": "sheer", "sheer shades": "sheer", "smartfold shade": "sheer",
  "faux wood blind": "faux-wood", "faux wood blinds": "faux-wood",
  "wood blind": "wood", "wood blinds": "wood",
  "mini blinds": "mini", "aluminum blind": "mini", "aluminum blinds": "mini",
  "vertical blind": "vertical", "vertical blinds": "vertical",
  "smart drape": "smart-drapes", "smart drapes": "smart-drapes", drapery: "smart-drapes", "drapery shades": "smart-drapes",
};

const normalize = (value: string) => value.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().replace(/[_-]/g, " ").replace(/\s+/g, " ").trim();

/** Consume the same labeled specifications printed alongside the drawing. */
export function contractIllustration(productType: string, options: readonly string[] = []): ContractIllustration | null {
  const product = PRODUCTS[normalize(productType)];
  if (!product) return null;
  const fields = options.flatMap((option) => {
    const colon = option.indexOf(":");
    const value = colon < 0 ? "" : normalize(option.slice(colon + 1));
    return !value ? [] : [[normalize(option.slice(0, colon)), value]];
  });
  const values = (...keys: string[]) => fields.filter(([key]) => keys.includes(key)).map(([, value]) => value);
  const savedOperations = values("lift system", "operating system", "control type", "honeycomb operating system");
  if (values("specialty shape").some((value) => value && !["none", "rectangle", "rectangular"].includes(value))) return null;
  const special = values("application", "shade type", "shutter type", "honeycomb application", "roller application", "specialty shape").join(" ");
  const tdbuPattern = /\btdbu\b|top down[ /]*bottom up/;
  const tdbu = product === "honeycomb" && tdbuPattern.test(special + " " + savedOperations.join(" "));
  const operationValues = savedOperations.map((value) => {
    if (!tdbu) return value;
    // The legacy Top Down-Bottom Up selection denotes the cordless system.
    if (value === "top down bottom up" || value === "top down/bottom up") return "cordless";
    return value.replace(tdbuPattern, "").trim();
  });
  const operation = operationValues.join(" ");
  const track = product === "shutters" ? shutterOperationReference(fields) : null;
  const specialConfiguration = (tdbu ? special.replace(tdbuPattern, "") : special).replace(track ? /tracked/g : /$^/, "");
  // These need their own approved drawings, rather than an ordinary rectangular shade.
  if (/specialty|arched|arch top|skylight|vertical|day.*night|top.*down|\btdbu\b|\btd\b|coupled|dual|common valance|french door|tracked|lightguard|light guard/.test(specialConfiguration + " " + operation)) return null;
  if (values("faux blind count", "lotus blind count", "blind count").some((count) => Number(count) > 1)) return null;

  const sideValues = values("control side", "chain location", "chain side", "wand side", "wand location", "tilt side", "tilt location");
  const sides = new Set(sideValues.map((side) => /^(left|l)( side)?$/.test(side) ? "left" : /^(right|r)( side)?$/.test(side) ? "right" : "unknown"));
  const side = sides.size === 1 && !sides.has("unknown") ? [...sides][0] : null;
  const motorSystem = /^(motorized|motorised|motorisation|motorization)( bottom up)?$/;
  const loopSystem = /^(continuous )?(cord|chain) loop$|^ccl$/;
  const cordlessSystem = /^(smart rise |precision lift |precisionlift )?cordless$/;
  const motorized = operationValues.some((value) => motorSystem.test(value));
  const loop = operationValues.some((value) => loopSystem.test(value));
  const cordless = operationValues.some((value) => cordlessSystem.test(value));
  if (["roller", "honeycomb", "roman", "sheer"].includes(product) && operationValues.some((value) => !motorSystem.test(value) && !loopSystem.test(value) && !cordlessSystem.test(value))) return null;
  if ([motorized, loop, cordless].filter(Boolean).length > 1) return null;
  if (tdbu && (operationValues.length > 0 && !motorized && !cordless || loop)) return null;
  if (/auto ?wand|motorized wand/.test(operation + " " + values("motor type", "motor", "power source", "power configuration", "motorization components").join(" "))) return null;
  if (product === "shutters") {
    if (operation) return null;
    const shutter = shutterIllustration(fields);
    return shutter ? { src: `${CONTRACT_ART_ROOT}/${shutter.asset}.webp`, alt: `${productType} · ${shutter.detail} — pencil illustration`, remote: false, mirror: false, panels: shutter.panels, shutterLayout: shutter.layout, ...(track ? { operationReference: track } : {}) } : track ? { src: track.src, alt: `${track.label} — pencil illustration`, remote: false, mirror: false, operationReference: track } : null;
  }
  let asset = tdbu ? "honeycomb-tdbu" : product;
  let mirror = false;
  let detail = "";
  let remote = false;
  // Older quotes did not collect every operating detail. A labeled product-only
  // reference keeps their layout complete without supplying an order selection.
  const reference = (assetName: string, note: string): ContractIllustration => ({
    src: `${CONTRACT_ART_ROOT}/${assetName}.webp`,
    alt: `${productType} — pencil product reference; ${note.toLowerCase()}`,
    remote: false, mirror: false, referenceNote: note,
  });
  if (["faux-wood", "wood", "mini"].includes(product)) {
    if (motorized || loop || (operation && !cordless && !/^wand( tilt)?$/.test(operation))) return null;
    if (!side) return sideValues.length === 0 ? reference(`${product}-reference`, "Wand side not recorded") : null;
    if (side === "right") {
      if (product === "faux-wood") asset = "faux-wood-wand-right";
      else mirror = true;
    }
    detail = `Wand tilt · ${side}`;
  } else if (["roller", "honeycomb", "roman", "sheer"].includes(product)) {
    if (loop) {
      if (!["roller", "honeycomb"].includes(product)) return null;
      if (!side) return sideValues.length === 0 ? reference(asset, "Cord loop side not recorded") : null;
      asset = `${product}-loop-${side}`;
      detail = `Continuous cord loop · ${side}`;
    } else if (motorized) {
      remote = true;
      detail = "Motorized";
    } else if (cordless) {
      detail = "Cordless";
    } else return reference(asset, "Operating system not recorded");
  } else if (product === "smart-drapes" && motorized) {
    remote = true;
    detail = "Motorized";
  } else if (motorized || loop) return null;
  if (tdbu) detail = `Top-down/bottom-up · ${detail}`;
  return { src: `${CONTRACT_ART_ROOT}/${asset}.webp`, alt: `${productType}${detail ? ` · ${detail}` : ""} — pencil illustration`, remote, mirror };
}

/** Explicit 180 selection only: a generic bifold may be a different mechanism. */
function shutterOperationReference(fields: readonly string[][]) {
  const values = fields.filter(([key]) => ["track system", "track type", "shutter type", "application"].includes(key)).map(([, value]) => value);
  const bypass = values.some(value => /\bby ?pass\b/.test(value));
  const bifold180 = values.some(value => /bi ?fold.*180|180.*bi ?fold/.test(value));
  const otherBifold = values.some(value => /bi ?fold/.test(value) && !/180/.test(value));
  if (otherBifold || (bypass && bifold180)) return null;
  const asset = bypass ? "shutter-bypass" : bifold180 ? "shutter-bifold-180-v2" : null;
  return asset ? { src: `${CONTRACT_ART_ROOT}/${asset}.webp`, label: bypass ? "Bypass operation reference" : "Bifold 180 operation reference · left folding, right closed" } : null;
}
