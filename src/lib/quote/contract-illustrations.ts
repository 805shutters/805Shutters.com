/** Approved C artwork. Presentation only; never supplies missing order selections. */
export const CONTRACT_ART_ROOT = "/images/contract-illustrations/c-v1";

export type ContractIllustration = {
  src: string;
  alt: string;
  remote: boolean;
  mirror: boolean;
};

const PRODUCTS: Record<string, string> = {
  shutters: "shutters", shutter: "shutters",
  "roller shade": "roller", "roller shades": "roller",
  "roman shade": "roman", "roman shades": "roman",
  "honeycomb shade": "honeycomb", "honeycomb shades": "honeycomb",
  "cellular shades": "honeycomb",
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
    return colon < 0 ? [] : [[normalize(option.slice(0, colon)), normalize(option.slice(colon + 1))]];
  });
  const values = (...keys: string[]) => fields.filter(([key]) => keys.includes(key)).map(([, value]) => value);
  const operationValues = values("lift system", "operating system", "control type", "honeycomb operating system");
  const operation = operationValues.join(" ");
  if (values("specialty shape").some((value) => value && !["none", "rectangle", "rectangular"].includes(value))) return null;
  const special = values("application", "shade type", "shutter type", "honeycomb application", "roller application", "specialty shape").join(" ");
  // These need their own approved drawings, rather than an ordinary rectangular shade.
  if (/specialty|arched|arch top|skylight|vertical|day.*night|top.*down|\btdbu\b|\btd\b|coupled|dual|common valance|french door|tracked|lightguard|light guard/.test(special + " " + operation)) return null;
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
  if (/auto ?wand|motorized wand/.test(operation + " " + values("motor type", "motor", "power source", "power configuration", "motorization components").join(" "))) return null;
  let asset = product;
  let mirror = false;
  let detail = "";
  let remote = false;
  if (["faux-wood", "wood", "mini"].includes(product)) {
    if (!side || motorized || loop || (operation && !cordless && !/^wand( tilt)?$/.test(operation))) return null;
    if (side === "right") {
      if (product === "faux-wood") asset = "faux-wood-wand-right";
      else mirror = true;
    }
    detail = `Wand tilt · ${side}`;
  } else if (["roller", "honeycomb", "roman", "sheer"].includes(product)) {
    if (loop) {
      if (!side || !["roller", "honeycomb"].includes(product)) return null;
      asset = `${product}-loop-${side}`;
      detail = `Continuous cord loop · ${side}`;
    } else if (motorized) {
      remote = true;
      detail = "Motorized";
    } else if (cordless) {
      detail = "Cordless";
    } else return null;
  } else if (product === "smart-drapes" && motorized) {
    remote = true;
    detail = "Motorized";
  } else if (motorized || loop) return null;
  return { src: `${CONTRACT_ART_ROOT}/${asset}.webp`, alt: `${productType}${detail ? ` · ${detail}` : ""} — pencil illustration`, remote, mirror };
}
