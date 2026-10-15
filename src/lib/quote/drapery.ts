import type { QuoteLabCatalogProduct } from '@/lib/quote-lab/types';

/** Approved presentation references. Drapery is priced only by staff. */
export const DRAPERY_STYLES = [
  {
    "id": "ripplefold",
    "title": "Ripplefold",
    "description": "Continuous S-shaped waves create an even, flowing heading.",
    "hardware": "Track and carriers"
  },
  {
    "id": "pinch-pleat",
    "title": "Pinch Pleat",
    "description": "Two-finger pleats are stitched together below the top for a tailored drape.",
    "hardware": "Pole, rings and hooks"
  },
  {
    "id": "french-pleat",
    "title": "French Pleat",
    "description": "Three-finger pleats fan out above each stitched pinch for a fuller, traditional heading.",
    "hardware": "Pole, rings and hooks"
  },
  {
    "id": "grommet",
    "title": "Grommet",
    "description": "Metal eyelets set into the fabric allow the pole to pass directly through the heading.",
    "hardware": "Pole through eyelets"
  },
  {
    "id": "rod-pocket",
    "title": "Rod Pocket",
    "description": "A sewn fabric sleeve gathers directly onto the pole, creating a soft, informal heading.",
    "hardware": "Pole inside sewn sleeve"
  },
  {
    "id": "goblet-pleat",
    "title": "Goblet Pleat",
    "description": "Rounded, cup-shaped pleats narrow into a stitched pinch and fall into long folds.",
    "hardware": "Pole, rings and hooks"
  },
  {
    "id": "inverted-box-pleat",
    "title": "Inverted Box Pleat",
    "description": "Flat front sections conceal inward folds for a clean, structured heading.",
    "hardware": "Track and concealed hooks"
  },
  {
    "id": "modern-ring-top",
    "title": "Modern Ring Top",
    "description": "Flat-top fabric panels hang from separate rings, creating clean, relaxed folds.",
    "hardware": "Slim pole, separate rings and pin hooks"
  }
] as const;
export const DRAPERY_ART_ROOT = '/images/contract-illustrations/drapery-v1';
export const DRAPERY_CATALOG_PRODUCT: QuoteLabCatalogProduct = {
  id: 'custom_drapery', name: 'Drapery', system: 'Drapery · manual pricing',
  productType: 'Drapery', manufacturer: 'Custom', priceBasis: 'manual_required',
  provisional: false, source: null, programs: [], surcharges: [], motorizationGroups: [],
};
export function draperyStyle(value: unknown) {
  return DRAPERY_STYLES.find(style => style.id === value || style.title === value) ?? null;
}
export function draperyStyleFromOptions(options: readonly string[]) {
  const selected = options.find(option => /^drapery style:/i.test(option));
  return selected ? draperyStyle(selected.slice(selected.indexOf(':') + 1).trim()) : null;
}
export function draperySketch(style: {id: string}) { return `${DRAPERY_ART_ROOT}/${style.id}.webp`; }
export function draperyReferencePhoto(style: {id: string}) {
  return style.id === 'modern-ring-top' ? null : `/images/product-previews/drapery-${style.id}-closeup.jpg`;
}
export function draperyStyleOptions(id: string, current: Record<string, unknown>) {
  const style = draperyStyle(id);
  if (!style) return current;
  const previous = draperyStyle(current.drapery_style);
  const description = current.drapery_description;
  const hardware = current.drapery_hardware;
  return {...current, drapery_style: style.title,
    drapery_description: !description || description === previous?.description ? style.description : description,
    drapery_hardware: !hardware || hardware === previous?.hardware ? style.hardware : hardware,
  };
}
/** Empty draft means unpriced; explicit zero is a valid staff price. */
export function parseDraperyPrice(value: string): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const price = Number(value);
  return Number.isFinite(price) && price >= 0 ? Math.round(price * 100) / 100 : null;
}
