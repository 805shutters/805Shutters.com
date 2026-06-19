// Representative product photography for each catalog product type, reusing the
// marketing site's existing imagery (verified paths under /public/images). Shown
// on the builder design cards and the customer-facing quote so a quote looks like
// the product, not just a price.

const PRODUCT_TYPE_IMAGES: Record<string, string> = {
  shutter: "/images/portfolio-enhanced/plantation-shutters-dining-room-card.jpg",
  faux_wood_blind: "/images/805-portfolio-blinds-office.jpg",
  wood_blind: "/images/805-portfolio-blinds-office.jpg",
  honeycomb_shade: "/images/portfolio-enhanced/uploaded-full-height-cellular-shades-natural.jpg",
  vertical_honeycomb_shade: "/images/portfolio-enhanced/uploaded-full-height-cellular-shades-natural.jpg",
  roller_shade: "/images/portfolio-enhanced/roller-shade-large-window-wide.jpg",
  sheer_shade: "/images/805-portfolio-shades-bedroom.jpg",
  smartfold_shade: "/images/805-portfolio-shades-bedroom.jpg",
  roman_shade: "/images/805-portfolio-drapery-living-room.jpg",
  smart_drape: "/images/805-portfolio-drapery-living-room.jpg",
  vertical_blind: "/images/product-previews/vertical-blinds-sliding-door.jpg",
  aluminum_blind: "/images/product-previews/aluminum-blinds-window.jpg",
  accessory: "/images/805-portfolio-shades-bedroom.jpg",
};

const FALLBACK_IMAGE = "/images/805-portfolio-shades-bedroom.jpg";

export function productImage(productType: string): string {
  return PRODUCT_TYPE_IMAGES[productType] ?? FALLBACK_IMAGE;
}
