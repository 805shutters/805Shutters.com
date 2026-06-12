import type { PageSection, Service, SitePage } from "./site-data";

export const commercialBrand = {
  name: "805 Commercial",
  label: "COMMERCIAL"
};

export const commercialModeImages = {
  hero: "/images/commercial-mode/commercial-office-roller-shades.png",
  lobby: "/images/commercial-mode/commercial-lobby-solar-shades.png",
  conference: "/images/commercial-mode/commercial-conference-blackout-shades.png",
  medical: "/images/commercial-mode/commercial-medical-privacy-shades.png",
  classroom: "/images/commercial-mode/commercial-classroom-roller-shades.png",
  storefront: "/images/commercial-mode/commercial-storefront-solar-shades.png"
};

export const commercialServices: Service[] = [
  {
    title: "Commercial Roller Shades",
    shortTitle: "Roller Shades",
    slug: "commercial-roller-shades",
    description:
      "Clean roller-shade systems for offices, storefronts, tenant improvements, schools, and shared spaces.",
    image: commercialModeImages.hero,
    imageAlt: "Commercial office windows fitted with neutral roller shades"
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
    title: "Motorized Commercial Shades",
    shortTitle: "Motorized",
    slug: "commercial-roller-shades",
    description:
      "Motorized shade planning for tall glass, hard-to-reach openings, boardrooms, and multi-window spaces.",
    image: commercialModeImages.lobby,
    imageAlt: "Commercial lobby with tall windows and motorized solar shades"
  },
  {
    title: "Property Replacement Programs",
    shortTitle: "Replacement",
    slug: "commercial-window-coverings",
    description:
      "Phased replacement plans for damaged blinds, glare complaints, tenant turns, common areas, and facilities.",
    image: commercialModeImages.classroom,
    imageAlt: "School facility room with cordless commercial roller shades"
  }
];

export const commercialHomeSections: PageSection[] = [
  {
    heading: "Commercial Shade Audits",
    body:
      "805 Commercial helps property managers, general contractors, offices, schools, storefronts, and medical spaces identify glare, heat, privacy, safety, and damaged-covering issues before choosing a product.",
    bullets: ["Free shade audit", "Site walks", "Budget direction", "Phased replacements"]
  },
  {
    heading: "Built For Workspaces",
    body:
      "The commercial mode focuses on roller shades, solar shades, blackout shades, motorized systems, vertical blinds, and replacement programs that fit daily-use business spaces.",
    bullets: ["Offices", "Storefronts", "Schools", "Medical spaces", "Tenant improvements"]
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
    image: commercialModeImages.lobby,
    imageAlt: "Commercial office lobby fitted with solar roller shades"
  },
  {
    image: commercialModeImages.storefront,
    imageAlt: "Retail storefront interior with commercial solar shades"
  },
  {
    image: commercialModeImages.medical,
    imageAlt: "Medical office waiting area with privacy roller shades"
  }
];

export function commercializePage(page: SitePage): SitePage {
  const isCommercialPage = page.path.includes("commercial");
  const h1 = isCommercialPage ? page.h1.replaceAll("805 Shutters", commercialBrand.name) : "Commercial Window Coverings";

  return {
    ...page,
    title: page.title.replaceAll("805 Shutters", commercialBrand.name),
    description:
      "Commercial roller shades, solar shades, blackout shades, motorized shades, and window coverings for offices, storefronts, schools, medical spaces, and property managers.",
    h1: page.path === "/" ? "Commercial Shade Systems" : h1,
    eyebrow: "805 Commercial",
    intro:
      "Commercial window-covering help for offices, storefronts, schools, medical spaces, property managers, and tenant-improvement teams that need practical shade systems installed cleanly.",
    image: commercialModeImages.hero,
    imageAlt: "Commercial office windows fitted with neutral roller shades",
    gallery: commercialGallery,
    sections: commercialHomeSections,
    cta: "Schedule a free commercial shade audit"
  };
}
