import { commercialModeImages } from "./commercial-mode-data";

export type ProductPreview = {
  label: string;
  /** Hero preview shown while hovering this product on the home page. */
  image?: string;
};

export type CategoryNavItem = {
  label: string;
  href: string;
  products: ProductPreview[];
};

/**
 * Every product points at a photo that actually shows that product type, and
 * no photo repeats inside the residential menu. Preview images live in:
 * - /images/portfolio-enhanced/  real install photos (wide crops)
 * - /images/editorial-scroll/    editorial hero photography
 * - /images/product-previews/    licensed fill-ins for types we have not
 *                                photographed yet (see manifest.json there)
 */
export const residentialCategoryItems: CategoryNavItem[] = [
  {
    label: "Blinds",
    href: "/blinds/",
    products: [
      { label: "Faux Wood", image: "/images/commercial-mode/commercial-office-faux-wood-blinds.png" },
      { label: "Premium Wood", image: "/images/805-portfolio-blinds-office.jpg" },
      { label: "Vertical Blinds", image: "/images/product-previews/vertical-blinds-sliding-door.jpg" },
      { label: "Aluminum Blinds", image: "/images/product-previews/aluminum-blinds-window.jpg" }
    ]
  },
  {
    label: "Shades",
    href: "/shades/",
    products: [
      { label: "Roller Shades", image: "/images/editorial-scroll/coastal-living-roller-shades.jpg" },
      { label: "Honeycomb Shades", image: "/images/portfolio-enhanced/uploaded-full-height-cellular-shades-wide.jpg" },
      { label: "Room Darkening", image: "/images/video-posters/motorized-roller-shades-patio-view.jpg" },
      { label: "Layered Shades", image: "/images/portfolio-enhanced/layered-shades-bedroom-window-wide.jpg" },
      { label: "Roman Shades", image: "/images/805-portfolio-shades-bedroom.jpg" },
      { label: "Natural Shades", image: "/images/editorial-scroll/breakfast-room-woven-shades.jpg" },
      { label: "Bamboo Shades", image: "/images/editorial-scroll/garden-living-woven-shades.jpg" },
      { label: "Sheer Shades", image: "/images/video-posters/ventura-county-roller-shades-bedroom-live.jpg" }
    ]
  },
  {
    label: "Drapery",
    href: "/drapery/",
    products: [
      { label: "Ripplefold Drapery", image: "/images/805-portfolio-drapery-living-room.jpg" },
      { label: "Pinch Pleat Drapery", image: "/images/editorial-scroll/poolside-bedroom-roller-shades.jpg" },
      { label: "French Pleat Drapery", image: "/images/805-hero-window-treatments.jpg" },
      { label: "Grommet Drapery", image: "/images/product-previews/grommet-drapery.jpg" },
      { label: "Rod Pocket Drapery", image: "/images/product-previews/rod-pocket-drapery.jpg" },
      // No goblet-pleat photo in the portfolio yet — hovering it keeps the
      // hero unchanged. See docs/ai-homepage-photo-prompts.md for the prompt.
      { label: "Goblet Pleat Drapery" },
      { label: "Inverted Box Pleat Drapery", image: "/images/product-previews/inverted-box-pleat-drapery.jpg" }
    ]
  },
  {
    label: "Shutters",
    href: "/shutters/",
    products: [
      { label: "Premium Stained Wood", image: "/images/portfolio-enhanced/dark-wood-plantation-shutters-living-room-wide.jpg" },
      { label: "Painted Wood", image: "/images/portfolio-enhanced/plantation-shutters-dining-room-wide.jpg" },
      { label: "Poly Composite", image: "/images/portfolio-enhanced/bedroom-sliding-door-shutters-wide.jpg" },
      { label: "MDF Composite", image: "/images/portfolio-enhanced/uploaded-office-plantation-shutters-wide.jpg" }
    ]
  },
  {
    label: "Exterior Shades",
    href: "/exterior-shades/",
    products: [
      { label: "Motorized Patio", image: "/images/editorial-scroll/sunset-patio-exterior-shades.jpg" },
      { label: "Non Motorized Patio", image: "/images/editorial-scroll/ocean-terrace-exterior-shades.jpg" }
    ]
  }
];

/**
 * Commercial previews mix realistic Southern California applications — small
 * offices, storefronts, and warehouses alongside larger offices. Product
 * groups stay unique within each dropdown; the audience-oriented "Shade
 * Audit" list shows the space that best matches each audience.
 */
export const commercialCategoryItems: CategoryNavItem[] = [
  {
    label: "Roller Shades",
    href: "/commercial-roller-shades/",
    products: [
      { label: "Office Roller Shades", image: commercialModeImages.smallOffice },
      { label: "Blackout Roller Shades", image: commercialModeImages.conference },
      { label: "Motorized Roller Shades", image: commercialModeImages.motorized },
      { label: "Tenant Improvement Shades", image: commercialModeImages.warehouseTenantImprovement }
    ]
  },
  {
    label: "Solar Shades",
    href: "/commercial-window-coverings/",
    products: [
      { label: "Glare Control", image: "/images/product-previews/commercial-glare-control-shades.jpg" },
      { label: "Heat Control", image: "/images/product-previews/commercial-heat-control-shades.jpg" },
      { label: "Street-Facing Glass", image: commercialModeImages.storefront }
    ]
  },
  {
    label: "Honeycomb",
    href: "/commercial-window-coverings/",
    products: [
      { label: "Office Honeycomb Shades", image: commercialModeImages.honeycomb },
      // Reuses the conference blackout photo until a room-darkening honeycomb
      // shot exists (prompt in docs/ai-homepage-photo-prompts.md).
      { label: "Room-Darkening Honeycomb", image: commercialModeImages.conference },
      { label: "Privacy Cellular Shades", image: commercialModeImages.medical }
    ]
  },
  {
    label: "Faux Wood",
    href: "/commercial-window-coverings/",
    products: [
      { label: "Office Faux Wood Blinds", image: commercialModeImages.fauxWood },
      { label: "Rental Turn Blinds", image: "/images/product-previews/commercial-rental-turn-blinds.jpg" },
      { label: "Staff Area Blinds", image: "/images/product-previews/commercial-staff-area-blinds.jpg" }
    ]
  },
  {
    label: "Shade Audit",
    href: "/commercial-window-coverings/",
    products: [
      { label: "Property Managers", image: commercialModeImages.propertyExterior },
      { label: "Schools And Facilities", image: commercialModeImages.school },
      { label: "Medical Offices", image: commercialModeImages.medical },
      { label: "Product Mix Review", image: commercialModeImages.storefrontCorner }
    ]
  }
];
