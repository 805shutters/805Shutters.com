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
  smallOffice: "/images/commercial-mode/commercial-small-office-roller-shades.jpg",
  motorized: "/images/commercial-mode/commercial-small-office-roller-shades.jpg",
  warehouseTenantImprovement: "/images/product-previews/commercial-warehouse-tenant-improvement.jpg",
  industrialWarehouse: "/images/product-previews/commercial-industrial-warehouse.jpg",
  school: "/images/product-previews/commercial-socal-school.jpg",
  propertyExterior: "/images/product-previews/commercial-socal-property-managers.jpg",
  storefrontCorner: "/images/product-previews/commercial-socal-storefront-corner.jpg",
  conference: "/images/commercial-mode/commercial-conference-blackout-shades.webp",
  medical: "/images/commercial-mode/commercial-medical-privacy-shades.webp",
  storefront: "/images/commercial-mode/commercial-local-storefront-solar-shades.webp",
  honeycomb: "/images/commercial-mode/commercial-single-room-honeycomb-shades.webp",
  fauxWood: "/images/commercial-mode/commercial-office-faux-wood-blinds.webp"
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

export type CommercialApplication = {
  title: string;
  eyebrow: string;
  body: string;
  image: string;
  imageAlt: string;
  bullets: string[];
};

export type CommercialProcessStep = {
  title: string;
  body: string;
};

export type CommercialFaq = {
  question: string;
  answer: string;
};

export const commercialProofPoints = [
  "Schools, campuses, and public facilities",
  "Office buildings, suites, and tenant improvements",
  "Warehouses, flex spaces, and industrial parks",
  "Storefronts, retail spaces, lobbies, and showrooms",
  "Local Ventura County measuring and installation"
];

export const commercialApplications: CommercialApplication[] = [
  {
    title: "Schools And Facilities",
    eyebrow: "Classrooms and campuses",
    body:
      "Commercial shades for schools need to support daily use, glare control, safe operation, and room-to-room consistency. 805 Shutters helps classrooms, offices, multipurpose rooms, and campus facilities plan durable shade replacement or new installation.",
    image: commercialModeImages.school,
    imageAlt: "Southern California school campus suited for classroom shade planning",
    bullets: ["Classrooms", "Administrative offices", "Multipurpose rooms", "Cordless shade options"]
  },
  {
    title: "Office Buildings And Suites",
    eyebrow: "Workplace comfort",
    body:
      "Office window coverings should reduce screen glare, soften heat, support privacy, and keep the space looking professional from inside and outside. We help small suites, multi-room offices, and larger workplace floors compare roller shades, solar shades, honeycomb shades, faux wood blinds, and motorized systems.",
    image: commercialModeImages.hero,
    imageAlt: "Sunlit Southern California office floor with tall shaded windows",
    bullets: ["Office roller shades", "Conference rooms", "Tenant improvements", "Motorized shade planning"]
  },
  {
    title: "Warehouses And Industrial Spaces",
    eyebrow: "Flex and industrial",
    body:
      "Warehouses often need window coverings for front offices, staff areas, high window bands, mezzanines, and tenant-improvement build-outs. The right shade plan can reduce heat and glare without overcomplicating a working building.",
    image: commercialModeImages.industrialWarehouse,
    imageAlt: "Bright industrial warehouse interior with high window bands",
    bullets: ["Warehouse offices", "Industrial parks", "Staff areas", "Phased replacement plans"]
  },
  {
    title: "Storefronts And Retail Spaces",
    eyebrow: "Customer-facing glass",
    body:
      "Storefronts and retail spaces need daylight control without making the business feel closed. Solar shades and commercial roller shades can protect displays, improve comfort, and keep lobbies, showrooms, restaurants, and sales floors usable during bright hours.",
    image: commercialModeImages.storefrontCorner,
    imageAlt: "Southern California storefront corner suited for retail solar shade planning",
    bullets: ["Street-facing glass", "Retail showrooms", "Restaurant windows", "Lobby privacy"]
  }
];

export const commercialProcessSteps: CommercialProcessStep[] = [
  {
    title: "1. Walk the space",
    body:
      "We review window count, exposure, glare, heat, privacy, damaged coverings, safety concerns, and the way each room is used."
  },
  {
    title: "2. Match product to the building",
    body:
      "Recommendations can include roller shades, solar shades, blackout shades, honeycomb shades, faux wood blinds, vertical blinds, or motorized controls."
  },
  {
    title: "3. Scope the project clearly",
    body:
      "The proposal can separate priority rooms, phases, tenant-improvement areas, replacement groups, product options, and install coordination."
  }
];

export const commercialFaqs: CommercialFaq[] = [
  {
    question: "Do you install commercial window coverings in Ventura County?",
    answer:
      "Yes. 805 Shutters installs commercial window coverings across Ventura County for offices, schools, storefronts, retail spaces, warehouses, medical offices, property managers, and shared facilities."
  },
  {
    question: "What products work best for office buildings?",
    answer:
      "Office buildings often use commercial roller shades, solar shades, blackout shades for conference rooms, honeycomb shades, faux wood blinds, or motorized shade systems depending on glare, heat, privacy, and room use."
  },
  {
    question: "Can you help schools replace classroom shades or blinds?",
    answer:
      "Yes. School and facility projects can be reviewed by room or building so the replacement plan addresses glare, privacy, safe operation, durability, budget, and timing."
  },
  {
    question: "Do storefronts and retail spaces need different shade planning?",
    answer:
      "Usually, yes. Storefront and retail projects need to balance customer visibility, product protection, privacy, heat control, glare reduction, and the appearance of the glass from the street."
  },
  {
    question: "Can warehouse offices and industrial spaces use commercial shades?",
    answer:
      "Yes. Warehouses, flex spaces, and industrial buildings often need shades or blinds for office build-outs, staff areas, mezzanines, front entries, and high-exposure window bands."
  },
  {
    question: "Can you phase a commercial window covering project?",
    answer:
      "Yes. Projects can be phased by room, building, priority issue, budget, or tenant schedule so the highest-impact areas are handled first."
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
