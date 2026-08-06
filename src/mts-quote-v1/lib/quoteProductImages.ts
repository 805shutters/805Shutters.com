import type { SalesQuoteDesign, SalesQuoteLineItem } from "@mts-v1/types/quote";

export type QuoteProductImageSource = "manufacturer" | "uploaded" | "customer" | "job_site";

export interface QuoteProductImage {
  id: string;
  title: string;
  manufacturer: string;
  productTypes: string[];
  imageUrl: string;
  sourceUrl: string;
  source: QuoteProductImageSource;
  supplier?: string;
  description?: string;
}

export interface SalesQuoteMedia {
  id: string;
  quote_id: string;
  line_item_id: string | null;
  source: QuoteProductImageSource;
  image_url: string;
  title: string;
  caption: string | null;
  product_type: string | null;
  supplier: string | null;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const MANUFACTURER_PRODUCT_IMAGES: QuoteProductImage[] = [
  {
    id: "onyx-shutters",
    title: "ONYX Shutters",
    manufacturer: "ONYX",
    supplier: "Onyx",
    productTypes: ["Shutters"],
    imageUrl:
      "https://www.onyxshutters.com/web/image/451-c33b3899/ChatGPT%20Image%20Jul%207%2C%202025%2C%2002_37_39%20PM.webp",
    sourceUrl: "https://www.onyxshutters.com/shutters",
    source: "manufacturer",
    description: "Custom shutter inspiration from ONYX.",
  },
  {
    id: "norman-woodlore-shutters",
    title: "Norman Woodlore Shutters",
    manufacturer: "Norman",
    supplier: "Norman",
    productTypes: ["Shutters"],
    imageUrl: "https://normanusa.com/app/uploads/2021/05/1844-x-1038_Photo_Shutters_05.jpg.webp",
    sourceUrl: "https://normanusa.com/product/woodlore-shutters/",
    source: "manufacturer",
    description: "Woodlore shutter inspiration from Norman.",
  },
  {
    id: "norman-soluna-roller",
    title: "Norman Soluna Roller Shades",
    manufacturer: "Norman",
    productTypes: ["Roller Shades"],
    imageUrl: "https://normanusa.com/app/uploads/2022/05/Right-Image-1440-x-1200-Roller.jpg.webp",
    sourceUrl: "https://normanusa.com/product/soluna-roller-shades/",
    source: "manufacturer",
    description: "Soluna roller shade inspiration from Norman.",
  },
  {
    id: "norman-centerpiece-roman",
    title: "Norman Centerpiece Roman Shades",
    manufacturer: "Norman",
    productTypes: ["Roman Shades"],
    imageUrl: "https://normanusa.com/app/uploads/2022/06/1440-x-1200-Roman-MDA.jpg.webp",
    sourceUrl: "https://normanusa.com/product/centerpiece-roman/",
    source: "manufacturer",
    description: "Centerpiece roman shade inspiration from Norman.",
  },
  {
    id: "norman-portrait-honeycomb",
    title: "Norman Portrait Honeycomb Shades",
    manufacturer: "Norman",
    productTypes: ["Honeycomb Shades"],
    imageUrl: "https://normanusa.com/app/uploads/2023/07/1440x1200_Kid-RM-HC.jpg",
    sourceUrl: "https://normanusa.com/product/portrait-honeycomb/",
    source: "manufacturer",
    description: "Portrait honeycomb shade inspiration from Norman.",
  },
  {
    id: "norman-perfectsheer",
    title: "Norman PerfectSheer Shades",
    manufacturer: "Norman",
    productTypes: ["Sheer Shades"],
    imageUrl: "https://normanusa.com/app/uploads/2022/06/1440x1200-PerfectSheer-blackWand.jpg.webp",
    sourceUrl: "https://normanusa.com/product/perfectsheer-shades/",
    source: "manufacturer",
    description: "PerfectSheer shade inspiration from Norman.",
  },
  {
    id: "norman-ultimate-faux-wood",
    title: "Norman Ultimate Faux Wood Blinds",
    manufacturer: "Norman",
    productTypes: ["Faux Wood Blinds"],
    imageUrl:
      "https://normanusa.com/app/uploads/2022/01/1440-x-1200-RightSideImage-UltmateFW-03.jpg.webp",
    sourceUrl: "https://normanusa.com/product/ultimate-faux-wood-blinds/",
    source: "manufacturer",
    description: "Ultimate faux wood blind inspiration from Norman.",
  },
  {
    id: "norman-ultimate-wood",
    title: "Norman Ultimate Wood Blinds",
    manufacturer: "Norman",
    productTypes: ["Wood Blinds"],
    imageUrl:
      "https://normanusa.com/app/uploads/2022/07/700-x-394_Design-Inspiration_Ultimate2.jpg.webp",
    sourceUrl: "https://normanusa.com/product/ultimate-normandy-wood-blinds/",
    source: "manufacturer",
    description: "Ultimate wood blind inspiration from Norman.",
  },
  {
    id: "norman-synchrony-vertical",
    title: "Norman Synchrony Vertical Blinds",
    manufacturer: "Norman",
    productTypes: ["Vertical Blinds"],
    imageUrl:
      "https://normanusa.com/app/uploads/2022/07/700-x-394_Design-Inspiration_Synchrony2.jpg.webp",
    sourceUrl: "https://normanusa.com/product/synchrony-blinds/",
    source: "manufacturer",
    description: "Synchrony vertical blind inspiration from Norman.",
  },
  {
    id: "norman-smartdrape",
    title: "Norman SmartDrape Shades",
    manufacturer: "Norman",
    productTypes: ["Smart Drapes"],
    imageUrl: "https://normanusa.com/app/uploads/2021/06/1440-x-1200_Right_Image-17.jpg.webp",
    sourceUrl: "https://normanusa.com/product/smartdrape-shades/",
    source: "manufacturer",
    description: "SmartDrape inspiration from Norman.",
  },
];

export function getLineItemProductImage(
  item: Pick<SalesQuoteLineItem, "product_type">,
  designs: Pick<SalesQuoteDesign, "supplier">[]
): QuoteProductImage | null {
  const supplier = designs.find((design) => design.supplier)?.supplier || "";
  const productType = item.product_type;

  return (
    MANUFACTURER_PRODUCT_IMAGES.find(
      (image) =>
        image.productTypes.includes(productType) &&
        supplier &&
        image.supplier &&
        normalize(image.supplier) === normalize(supplier)
    ) ||
    MANUFACTURER_PRODUCT_IMAGES.find((image) => image.productTypes.includes(productType)) ||
    null
  );
}

export function getPortfolioManufacturerImages(
  lineItems: Pick<SalesQuoteLineItem, "id" | "product_type" | "room_name">[],
  designs: Pick<SalesQuoteDesign, "line_item_id" | "supplier">[]
): QuoteProductImage[] {
  const byId = new Map<string, QuoteProductImage>();

  for (const item of lineItems) {
    const itemDesigns = designs.filter((design) => design.line_item_id === item.id);
    const image = getLineItemProductImage(item, itemDesigns);
    if (image) byId.set(image.id, image);
  }

  return Array.from(byId.values());
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}
