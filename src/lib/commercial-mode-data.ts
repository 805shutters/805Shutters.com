import type { PageSection, Service, SitePage } from "./site-data";

export const commercialBrand = {
  name: "805 Commercial",
  label: "COMMERCIAL"
};

/**
 * Commercial photos must read as Southern California (palms, stucco, dry
 * light, tilt-up/industrial) and cover realistic applications — small
 * offices and storefronts alongside larger offices and warehouses. Licensed
 * fill-ins live in /images/product-previews/ (see its manifest.json);
 * replace with brand photos as real installs or SoCal AI shots are added.
 */
export const commercialModeImages = {
  hero: "/images/product-previews/commercial-socal-office-hero.jpg",
  smallOffice: "/images/commercial-mode/commercial-small-office-roller-shades.png",
  motorized: "/images/commercial-mode/commercial-small-office-roller-shades.png",
  warehouseTenantImprovement: "/images/product-previews/commercial-warehouse-tenant-improvement.jpg",
  industrialWarehouse: "/images/product-previews/commercial-industrial-warehouse.jpg",
  school: "/images/product-previews/commercial-socal-school.jpg",
  propertyExterior: "/images/product-previews/commercial-socal-property-managers.jpg",
  storefrontCorner: "/images/product-previews/commercial-socal-storefront-corner.jpg",
  conference: "/images/commercial-mode/commercial-conference-blackout-shades.png",
  medical: "/images/commercial-mode/commercial-medical-privacy-shades.png",
  storefront: "/images/commercial-mode/commercial-local-storefront-solar-shades.png",
  honeycomb: "/images/commercial-mode/commercial-single-room-honeycomb-shades.png",
  fauxWood: "/images/commercial-mode/commercial-office-faux-wood-blinds.png"
};

export const commercialServices: Service[] = [
  {
    title: "Commercial Roller Shades",
    shortTitle: "Roller Shades",
    slug: "commercial-roller-shades",
    description:
      "Clean roller-shade systems for small offices, storefronts, warehouse offices, tenant improvements, schools, and shared spaces.",
    image: commercialModeImages.hero,
    imageAlt: "Sunlit Southern California office floor with tall shaded windows"
  },
  {
    title: "Solar Shade Systems",
    shortTitle: "Solar Shades",
    slug: "commercial-window-coverings",
    description:
      "Glare and heat control for glass-heavy workspaces, lobbies, conference rooms, and customer-facing spaces.",
    image: commercialModeImages.storefront,
    imageAlt: "Commercial storefront windows fitted with solar roller shades"
  },
  {
    title: "Blackout And Privacy Shades",
    shortTitle: "Blackout",
    slug: "commercial-window-coverings",
    description:
      "Privacy and presentation control for conference rooms, medical offices, classrooms, and treatment rooms.",
    image: commercialModeImages.conference,
    imageAlt: "Commercial conference room fitted with dark blackout roller shades"
  },
  {
    title: "Commercial Honeycomb Shades",
    shortTitle: "Honeycomb Shades",
    slug: "commercial-window-coverings",
    description:
      "Insulating cellular shades for offices, schools, medical suites, and rooms that need softer light and privacy.",
    image: commercialModeImages.honeycomb,
    imageAlt: "Commercial office windows fitted with honeycomb cellular shades"
  },
  {
    title: "Faux Wood Blinds For Commercial Spaces",
    shortTitle: "Faux Wood Blinds",
    slug: "commercial-window-coverings",
    description:
      "Durable, wipeable faux wood blinds for offices, rentals, multifamily turns, staff areas, and budget-conscious properties.",
    image: commercialModeImages.fauxWood,
    imageAlt: "Commercial office windows fitted with faux wood blinds"
  },
  {
    title: "Motorized Commercial Shades",
    shortTitle: "Motorized",
    slug: "commercial-roller-shades",
    description:
      "Motorized shade planning for tall glass, hard-to-reach openings, boardrooms, and multi-window spaces.",
    image: commercialModeImages.motorized,
    imageAlt: "Tall glass office partitions filtering warm afternoon sun"
  },
  {
    title: "Property Replacement Programs",
    shortTitle: "Replacement",
    slug: "commercial-window-coverings",
    description:
      "Phased replacement plans for damaged blinds, glare complaints, tenant turns, common areas, warehouses, and facilities.",
    image: commercialModeImages.industrialWarehouse,
    imageAlt: "Bright industrial warehouse interior with high window bands"
  }
];

export const commercialHomeSections: PageSection[] = [
  {
    heading: "Commercial Shade Audits",
    body:
      "805 Commercial helps property managers, general contractors, small offices, larger workplaces, schools, storefronts, warehouses, and medical spaces identify glare, heat, privacy, safety, and damaged-covering issues before choosing a product.",
    bullets: ["Free shade audit", "Site walks", "Budget direction", "Phased replacements"]
  },
  {
    heading: "Built For Workspaces",
    body:
      "The commercial mode includes roller shades, solar shades, blackout shades, honeycomb shades, faux wood blinds, motorized systems, vertical blinds, and replacement programs that fit daily-use business spaces — from single-suite offices and storefronts to warehouses and industrial buildings.",
    bullets: ["Small offices", "Storefronts", "Warehouses", "Schools", "Medical spaces", "Tenant improvements", "Rental turns"]
  },
  {
    heading: "GC And Property Manager Ready",
    body:
      "We can support Division 12 window-treatment scopes, tenant improvement bids, property maintenance needs, vacancy turns, and multi-room replacement planning with clear proposals and local installation coordination.",
    bullets: ["Division 12", "Vendor-ready", "Licensed", "Insurance available"]
  }
];

export const commercialGallery = [
  {
    image: commercialModeImages.storefront,
    imageAlt: "Retail storefront interior with commercial solar shades and palm-lined street"
  },
  {
    image: commercialModeImages.industrialWarehouse,
    imageAlt: "Bright industrial warehouse interior with high window bands"
  },
  {
    image: commercialModeImages.medical,
    imageAlt: "Medical office waiting area with privacy roller shades"
  },
  {
    image: commercialModeImages.honeycomb,
    imageAlt: "Commercial office windows fitted with honeycomb cellular shades"
  },
  {
    image: commercialModeImages.fauxWood,
    imageAlt: "Commercial office windows fitted with faux wood blinds"
  },
  {
    image: commercialModeImages.propertyExterior,
    imageAlt: "Spanish-style Southern California commercial buildings with palms"
  }
];

export function commercializePage(page: SitePage): SitePage {
  const isCommercialPage = page.path.includes("commercial");
  const h1 = isCommercialPage ? page.h1.replaceAll("805 Shutters", commercialBrand.name) : "Commercial Window Coverings";

  return {
    ...page,
    title: page.title.replaceAll("805 Shutters", commercialBrand.name),
    description:
      "Commercial roller shades, solar shades, blackout shades, honeycomb shades, faux wood blinds, motorized shades, and window coverings for small offices, storefronts, warehouses, schools, medical spaces, and property managers.",
    h1: page.path === "/" ? "Commercial Shade Systems" : h1,
    eyebrow: "805 Commercial",
    intro:
      "Commercial window-covering help for small offices, larger workplaces, storefronts, warehouses, schools, medical spaces, property managers, and tenant-improvement teams that need practical shade systems, honeycomb shades, or faux wood blinds installed cleanly.",
    image: commercialModeImages.hero,
    imageAlt: "Sunlit Southern California office floor with tall shaded windows",
    gallery: commercialGallery,
    sections: commercialHomeSections,
    cta: "Schedule a free commercial shade audit"
  };
}
