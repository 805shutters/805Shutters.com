import { brandIdentity } from "./brand-identity";

export type Service = {
  title: string;
  shortTitle: string;
  slug: string;
  description: string;
  image: string;
  imageAlt: string;
};

export type PageSection = {
  heading: string;
  body: string;
  bullets?: string[];
  links?: { label: string; href: string }[];
};

export type PageFaq = {
  question: string;
  answer: string;
};

export type SitePage = {
  path: string;
  title: string;
  description: string;
  h1: string;
  eyebrow: string;
  intro: string;
  image: string;
  imageAlt: string;
  gallery?: {
    image: string;
    imageAlt: string;
    video?: string;
    label?: string;
  }[];
  sections: PageSection[];
  faqs?: PageFaq[];
  cta?: string;
  form?: boolean;
  noIndex?: boolean;
};

export const site = {
  name: brandIdentity.name,
  shortName: brandIdentity.name,
  legalName: brandIdentity.name,
  phone: brandIdentity.phone,
  phoneHref: brandIdentity.phoneHref,
  smsHref: brandIdentity.smsHref,
  email: brandIdentity.email,
  emailHref: brandIdentity.emailHref,
  domain: brandIdentity.domain,
  website: brandIdentity.website,
  officialPath: brandIdentity.officialPath,
  serviceDescription: brandIdentity.serviceDescription,
  nonAffiliationStatement: brandIdentity.nonAffiliationStatement,
  social: {
    facebook: "https://www.facebook.com/805shutters",
    instagram: "https://www.instagram.com/805shutters/",
    yelp: "https://www.yelp.com/biz/805-shutters-shades-blinds-camarillo-2"
  },
  googleMaps: {
    cid: "14597332202667384985",
    url: "https://www.google.com/maps?cid=14597332202667384985"
  },
  baseUrl: process.env.NEXT_PUBLIC_SITE_URL || "https://www.805shutters.com",
  serviceArea: brandIdentity.serviceArea,
  areas: [
    "Camarillo",
    "Thousand Oaks",
    "Ventura",
    "Oxnard",
    "Simi Valley",
    "Moorpark",
    "Newbury Park",
    "Westlake Village",
    "Ojai",
    "Santa Rosa Valley",
    "Port Hueneme",
    "Santa Paula",
    "Oak Park",
    "Fillmore",
    "Santa Clarita"
  ]
};

// Shared Open Graph fields spread into every page's `openGraph` so social
// shares carry consistent branding (og:site_name / og:locale / og:type).
export const ogDefaults = {
  type: "website",
  siteName: "805 Shutters",
  locale: "en_US"
} as const;

// First hero-carousel slide on the residential homepage. The carousel renders
// it with next/image so crawlers can discover it and the browser can preload it.
export const homeHeroImage = "/images/homepage-flow/main-homepage-photo.jpg";

export const images = {
  hero: "/images/805-hero-window-treatments.jpg",
  shutters:
    "/images/portfolio-enhanced/uploaded-stacked-arch-shutters-wide.jpg",
  shades: "/images/805-portfolio-shades-bedroom.jpg",
  blinds: "/images/805-portfolio-blinds-office.jpg",
  drapery: "/images/805-portfolio-drapery-living-room.jpg",
  exteriorShades: "/images/editorial-scroll/ocean-terrace-exterior-shades.jpg",
  commercialHero: "/images/product-previews/commercial-socal-office-hero.jpg",
  commercialStorefront: "/images/product-previews/commercial-socal-storefront-corner.jpg",
  commercialSchool: "/images/product-previews/commercial-socal-school.jpg",
  commercialWarehouse: "/images/product-previews/commercial-industrial-warehouse.jpg",
  aboutLegacy: "/images/legacy-wordpress/about-blue-blinds.jpg",
  aboutLegacyFull: "/images/legacy-wordpress/about-blue-blinds-full.jpg",
  aboutLegacyHome: "/images/legacy-wordpress/about-legacy-home-slider.jpg",
  aboutLegacyShades: "/images/legacy-wordpress/about-legacy-shades-header.jpg",
  project:
    "https://i0.wp.com/www.805shutters.com/wp-content/uploads/2024/04/window-coverings-ventura-california-windows-covering-store-installation-1.jpg?w=900&ssl=1"
};

const recentJobGallery: NonNullable<SitePage["gallery"]> = [
  {
    image: "/images/portfolio-enhanced/recent-patterned-roller-shades-card.jpg",
    imageAlt: "Patterned roller shades installed in a Ventura County home"
  },
  {
    image: "/images/portfolio-enhanced/recent-tall-window-blinds-card.jpg",
    imageAlt: "Tall window blinds installed in a Ventura County room"
  },
  {
    image: "/images/portfolio-enhanced/recent-bedroom-plantation-shutters-card.jpg",
    imageAlt: "White plantation shutters installed on bedroom windows"
  },
  {
    image: "/images/portfolio-enhanced/recent-bay-window-plantation-shutters-card.jpg",
    imageAlt: "White plantation shutters installed across a bay window"
  },
  {
    image: "/images/video-posters/recent-living-room-roller-shades.jpg",
    imageAlt: "Roller shades installed around a Ventura County living room",
    video: "/videos/recent-living-room-roller-shades.mp4"
  },
  {
    image: "/images/video-posters/recent-bedroom-roller-shades-patio-view.jpg",
    imageAlt: "Roller shades installed across a bedroom patio view",
    video: "/videos/recent-bedroom-roller-shades-patio-view.mp4"
  },
  {
    image: "/images/portfolio-enhanced/recent-patio-door-plantation-shutters-card.jpg",
    imageAlt: "Plantation shutters installed around patio doors"
  },
  {
    image: "/images/portfolio-enhanced/recent-arched-window-plantation-shutters-card.jpg",
    imageAlt: "Arched plantation shutters installed in a Ventura County home"
  },
  {
    image: "/images/portfolio-enhanced/recent-two-story-arch-plantation-shutters-card.jpg",
    imageAlt: "Two-story arched plantation shutters installed in a living room"
  },
  {
    image: "/images/portfolio-enhanced/recent-solar-roller-shade-detail-card.jpg",
    imageAlt: "Solar roller shade detail over a patio view"
  },
  {
    image: "/images/portfolio-enhanced/recent-dining-room-plantation-shutters-card.jpg",
    imageAlt: "Plantation shutters installed in a dining room"
  }
];

const oldWebsitePortfolioGallery: NonNullable<SitePage["gallery"]> = [
  {
    image: "/images/portfolio-enhanced/exterior-patio-shades-detail-card.jpg",
    imageAlt: "Exterior patio shades installed across a Ventura County pergola for sun and glare control"
  },
  {
    image: "/images/portfolio-enhanced/exterior-patio-shades-wide-card.jpg",
    imageAlt: "Custom exterior shades installed beneath a Ventura County backyard pergola"
  },
  {
    image: "/images/portfolio-enhanced/exterior-patio-shades-pergola-card.jpg",
    imageAlt: "Exterior shades lowering across a custom wood pergola patio in Ventura County"
  },
  {
    image: "/images/portfolio-enhanced/split-tilt-shutters-living-room-card.jpg",
    imageAlt: "White split tilt plantation shutters installed across a Ventura County living room"
  },
  {
    image: "/images/portfolio-enhanced/split-tilt-shutters-open-card.jpg",
    imageAlt: "Custom split tilt plantation shutters with the upper louvers open for daylight"
  },
  {
    image: "/images/portfolio-enhanced/split-tilt-shutters-light-control-card.jpg",
    imageAlt: "Split tilt plantation shutters showing independent upper and lower louver control"
  },
  {
    image: "/images/portfolio-enhanced/split-tilt-shutters-detail-card.jpg",
    imageAlt: "Close view of white split tilt plantation shutters with independently controlled louvers"
  },
  {
    image: "/images/portfolio-enhanced/top-down-bottom-up-shades-bathroom-wide-card.jpg",
    imageAlt: "Top-down bottom-up cellular shades bringing privacy and daylight control to a Ventura County bathroom remodel"
  },
  {
    image: "/images/portfolio-enhanced/top-down-bottom-up-shades-bathroom-detail-card.jpg",
    imageAlt: "Top-down bottom-up cellular shades providing privacy in a Ventura County bathroom remodel"
  },
  {
    image: "/images/portfolio-enhanced/top-down-bottom-up-shades-bedroom-front-card.jpg",
    imageAlt: "Top-down bottom-up cellular shade balancing daylight and privacy in a Ventura County bedroom"
  },
  {
    image: "/images/portfolio-enhanced/top-down-bottom-up-shades-bedroom-angle-card.jpg",
    imageAlt: "Top-down bottom-up cellular shade installed in a Ventura County bedroom remodel"
  },
  {
    image: "/images/portfolio-enhanced/top-down-bottom-up-shades-office-pair-card.jpg",
    imageAlt: "Paired top-down bottom-up cellular shades installed in a Ventura County home office"
  },
  {
    image: "/images/portfolio-enhanced/top-down-bottom-up-shades-bedroom-detail-card.jpg",
    imageAlt: "Close view of a top-down bottom-up cellular shade installed in a Ventura County remodel"
  },
  {
    image: "/images/portfolio-enhanced/skylight-plantation-shutters-open-card.jpg",
    imageAlt: "Custom white plantation shutters installed over a Ventura County skylight with the louvers open"
  },
  {
    image: "/images/portfolio-enhanced/skylight-plantation-shutters-closed-card.jpg",
    imageAlt: "Custom white plantation shutters closed over a Ventura County skylight for light control"
  },
  {
    image: "/images/portfolio-enhanced/bedroom-horizontal-blinds-before-card.jpg",
    imageAlt: "Before view of horizontal blinds on a Ventura County bedroom window",
    label: "Before"
  },
  {
    image: "/images/portfolio-enhanced/bedroom-plantation-shutters-after-front-card.jpg",
    imageAlt: "After view of white plantation shutters on a Ventura County bedroom window",
    label: "After"
  },
  {
    image: "/images/portfolio-enhanced/bedroom-plantation-shutters-after-room-card.jpg",
    imageAlt: "Room-angle after view of white plantation shutters in a Ventura County bedroom",
    label: "After"
  },
  {
    image: "/images/portfolio-enhanced/arched-bedroom-plantation-shutters-room-card.jpg",
    imageAlt: "White plantation shutters with an arched center bedroom window in Ventura County"
  },
  {
    image: "/images/portfolio-enhanced/arched-bedroom-plantation-shutters-detail-card.jpg",
    imageAlt: "Custom arched plantation shutters with side bedroom shutters in Ventura County"
  },
  {
    image: "/images/portfolio-enhanced/bedroom-plantation-shutters-single-window-card.jpg",
    imageAlt: "White plantation shutters installed on a Ventura County bedroom window"
  },
  {
    image: "/images/portfolio-enhanced/kitchen-roman-shade-lowered-card.jpg",
    imageAlt: "Textured Roman shade lowered over a Ventura County kitchen sink window"
  },
  {
    image: "/images/portfolio-enhanced/kitchen-roman-shade-raised-card.jpg",
    imageAlt: "Textured Roman shade raised above a Ventura County kitchen sink window"
  },
  ...recentJobGallery,
  {
    image: "/images/video-posters/motorized-roller-shades-living-room-view.jpg",
    imageAlt: "Motorized roller shades installed across living room patio-view windows",
    video: "/videos/motorized-roller-shades-living-room-view.mp4"
  },
  {
    image: "/images/portfolio-enhanced/fabric-roller-shade-valance-detail-card.jpg",
    imageAlt: "Fabric roller shade with a matching valance installed over a Ventura County window"
  },
  {
    image: "/images/portfolio-enhanced/bedroom-plantation-shutters-angle-card.jpg",
    imageAlt: "White plantation shutters installed on a Ventura County bedroom window"
  },
  {
    image: "/images/portfolio-enhanced/bedroom-plantation-shutters-straight-card.jpg",
    imageAlt: "Straight-on view of white plantation shutters in a Ventura County bedroom"
  },
  {
    image: "/images/portfolio-enhanced/bedroom-plantation-shutters-wide-angle-card.jpg",
    imageAlt: "Wide angle view of white plantation shutters in a Ventura County bedroom"
  },
  {
    image: "/images/portfolio-enhanced/bay-window-plantation-shutters-front-card.jpg",
    imageAlt: "White plantation shutters installed across a Ventura County bay window"
  },
  {
    image: "/images/portfolio-enhanced/bay-window-plantation-shutters-angle-card.jpg",
    imageAlt: "White plantation shutters installed on an angled Ventura County bay window"
  },
  {
    image: "/images/portfolio-enhanced/two-story-shutter-installation-detail-card.jpg",
    imageAlt: "Custom plantation shutter detail on tall angled Ventura County windows"
  },
  {
    image: "/images/portfolio-enhanced/bedroom-sliding-door-shutters-card.jpg",
    imageAlt: "Custom shutters installed on a Ventura County bedroom sliding door"
  },
  {
    image: "/images/portfolio-enhanced/roller-shade-large-window-card.jpg",
    imageAlt: "Roller shade covering a large Ventura County window"
  },
  {
    image: "/images/portfolio-enhanced/layered-shades-bedroom-window-card.jpg",
    imageAlt: "Layered window shades installed on a Ventura County bedroom window"
  },
  {
    image: "/images/portfolio-enhanced/specialty-arch-window-shutters-card.jpg",
    imageAlt: "Specialty arch window shutters custom fit in a Ventura County home"
  },
  {
    image: "/images/portfolio-enhanced/arched-window-custom-shutters-card.jpg",
    imageAlt: "Custom arched plantation shutters in a Ventura County living room"
  },
  {
    image: "/images/portfolio-enhanced/dark-wood-plantation-shutters-living-room-card.jpg",
    imageAlt: "Dark wood plantation shutters across living room windows in Ventura County"
  },
  {
    image: "/images/portfolio-enhanced/dark-wood-plantation-shutters-reading-room-card.jpg",
    imageAlt: "Dark wood plantation shutters in a Ventura County reading room"
  },
  {
    image: "/images/portfolio-enhanced/arched-plantation-shutters-living-room-card.jpg",
    imageAlt: "Arched plantation shutters installed in a Ventura County living room"
  },
  {
    image: "/images/portfolio-enhanced/plantation-shutters-dining-room-card.jpg",
    imageAlt: "White plantation shutters installed in a Ventura County dining room"
  },
  {
    image: "/images/portfolio-enhanced/uploaded-arched-shutter-detail-card.jpg",
    imageAlt: "Custom arched shutter installed in a Ventura County room"
  },
  {
    image: "/images/portfolio-enhanced/uploaded-single-arch-shutter-card.jpg",
    imageAlt: "Single arched plantation shutter installed in a Ventura County home"
  },
  {
    image: "/images/portfolio-enhanced/uploaded-shutter-panel-detail-card.jpg",
    imageAlt: "Close detail of a custom shutter panel beside a door in a Ventura County home"
  },
  {
    image: "/images/portfolio-enhanced/uploaded-two-story-living-room-shutters-card.jpg",
    imageAlt: "Two-story living room windows fitted with custom plantation shutters"
  },
  {
    image: "/images/portfolio-enhanced/uploaded-stacked-arch-shutters-card.jpg",
    imageAlt: "Stacked arched and rectangular shutters installed on tall living room windows"
  },
  {
    image: "/images/portfolio-enhanced/uploaded-corner-cellular-shades-card.jpg",
    imageAlt: "Cellular shades installed on two corner windows in a Ventura County home"
  },
  {
    image: "/images/portfolio-enhanced/uploaded-bedroom-cellular-shades-card.jpg",
    imageAlt: "Cellular shades installed on two bedroom windows beside a door"
  },
  {
    image: "/images/portfolio-enhanced/uploaded-twin-cellular-shades-card.jpg",
    imageAlt: "Twin cellular shades installed on side-by-side bedroom windows"
  },
  {
    image: "/images/portfolio-enhanced/uploaded-office-plantation-shutters-card.jpg",
    imageAlt: "White plantation shutters installed over office corner windows"
  },
  {
    image: "/images/portfolio-enhanced/uploaded-corner-room-cellular-shades-card.jpg",
    imageAlt: "Cellular shades installed across a corner room window grouping"
  },
  {
    image: "/images/portfolio-enhanced/uploaded-full-height-cellular-shades-card.jpg",
    imageAlt: "Full-height cellular shades installed on corner room windows"
  }
];

export const services: Service[] = [
  {
    title: "Custom Shutters",
    shortTitle: "Shutters",
    slug: "shutters",
    description:
      "Plantation shutters, wood shutters, specialty shapes, sliding door shutters, and whole-home shutter upgrades.",
    image: images.shutters,
    imageAlt: "Stacked arched and rectangular shutters installed on tall living room windows"
  },
  {
    title: "Custom Window Shades",
    shortTitle: "Shades",
    slug: "shades",
    description:
      "Roller shades, honeycomb shades, Roman shades, woven wood shades, layered shades, and motorized options.",
    image: images.shades,
    imageAlt: "Relaxed Roman shades over a wide bedroom window in a Ventura County home"
  },
  {
    title: "Custom Blinds",
    shortTitle: "Blinds",
    slug: "blinds",
    description:
      "Wood, faux wood, aluminum, vertical, and softwood blinds measured and installed for local homes and businesses.",
    image: images.blinds,
    imageAlt: "Warm wood blinds filtering light in a Ventura County home office"
  },
  {
    title: "Custom Drapery & Curtains",
    shortTitle: "Drapery",
    slug: "drapery",
    description:
      "Custom drapery, curtains, and fabric window treatment planning for rooms that need warmth, privacy, light control, and a finished designer look.",
    image: images.drapery,
    imageAlt: "Soft fabric window treatments in a Ventura County living room"
  },
  {
    title: "Commercial Window Coverings",
    shortTitle: "Commercial",
    slug: "commercial-window-coverings",
    description:
      "Commercial roller shades and window treatments for offices, storefronts, schools, medical spaces, and shared workspaces.",
    image: "/images/product-previews/commercial-socal-office-hero.jpg",
    imageAlt: "Sunlit Southern California office floor with tall shaded windows"
  }
];

const cityPages = [
  ["camarillo", "camarillo-ca", "Camarillo"],
  ["fillmore", "fillmore-ca", "Fillmore"],
  ["moorpark", "moorpark-ca", "Moorpark"],
  ["newbury-park", "newbury-park-ca", "Newbury Park"],
  ["oak-park", "oak-park-ca", "Oak Park"],
  ["ojai", "ojai-ca", "Ojai"],
  ["oxnard", "oxnard-ca", "Oxnard"],
  ["port-hueneme", "port-hueneme-ca", "Port Hueneme"],
  ["santa-paula", "santa-paula-ca", "Santa Paula"],
  ["santa-clarita", "santa-clarita-ca", "Santa Clarita"],
  ["santa-rosa-valley", "santa-rosa-valley-ca", "Santa Rosa Valley"],
  ["simi-valley", "simi-valley-ca", "Simi Valley"],
  ["thousand-oaks", "thousand-oaks-ca", "Thousand Oaks"],
  ["ventura", "ventura-ca", "Ventura"],
  ["westlake-village", "westlake-village-ca", "Westlake Village"]
] as const;

// Major commercial hubs every commercial city/roller-shade page links to
// (excluding itself) to build a real internal-link mesh between the pages.
const commercialHubCities: { city: string; caSlug: string }[] = [
  { city: "Camarillo", caSlug: "camarillo-ca" },
  { city: "Thousand Oaks", caSlug: "thousand-oaks-ca" },
  { city: "Ventura", caSlug: "ventura-ca" },
  { city: "Oxnard", caSlug: "oxnard-ca" }
];

const productFit = {
  shutters:
    "Plantation shutters are a durable fit for living rooms, bedrooms, specialty windows, and whole-home upgrades where clean lines and easy maintenance matter.",
  shades:
    "Window shades work well when the priority is glare control, privacy, softness, motorization, or a lighter look than shutters or blinds.",
  blinds:
    "Custom blinds are practical for bedrooms, offices, rentals, and everyday spaces where adjustable light control and budget flexibility are important.",
  drapery:
    "Custom drapery and curtains add softness, warmth, privacy, and a finished designer look, either on their own or layered over shutters, shades, or blinds.",
  "window-coverings":
    "Window coverings include shutters, shades, blinds, and commercial treatments, so the recommendation can fit the room instead of forcing one product type.",
  "window-treatments":
    "Window treatments are selected around the room, light exposure, privacy needs, material preference, and the level of daily use."
};

function legacyProductSections(product: keyof typeof productFit, city: string, label: string): PageSection[] {
  if (product === "blinds") {
    return [
      {
        heading: "Light, Privacy, And View Control",
        body: `Custom blinds in ${city} help control the amount of light entering a room without forcing the window to be fully open or fully covered. Slats can be tilted, opened, or closed so a home or business can keep privacy, reduce glare, protect furniture, and still make use of natural daylight.`
      },
      {
        heading: "Wood, Faux Wood, Aluminum, Vertical, And Softwood Options",
        body:
          "During the consultation, 805 Shutters reviews wood blinds, faux wood blinds, aluminum blinds, vertical blinds, softwood blinds, colors, finishes, and control options. The goal is to match the product to the property, the overall look of the room, the level of daily use, and the budget for the project."
      },
      {
        heading: "A Practical Upgrade For Homes And Businesses",
        body: `For ${city} properties, blinds remain a practical option when customers want top quality light control, a cleaner window appearance, and a flexible price point. We compare the benefits of each blind style before ordering so the finished installation works with trim, doors, furniture, and everyday use.`
      }
    ];
  }

  if (product === "shutters") {
    return [
      {
        heading: "Installation, Repair Review, And Replacement Planning",
        body: `805 Shutters helps ${city} customers with shutter installation, replacement planning, and review of existing shutter issues. If an older shutter system needs attention, the consultation can help determine whether adjustment, replacement panels, new frames, or a new custom installation is the better long-term path.`
      },
      {
        heading: "Privacy, Security, Ventilation, And Temperature",
        body:
          "Plantation shutters can improve privacy, help reduce glare, support airflow through adjustable louvers, and add a more finished architectural look. We review louver size, frame style, materials, color, room temperature concerns, sun exposure, and how the shutters should perform when opened, closed, or tilted."
      },
      {
        heading: "Interior, Wood, Composite, And Specialty Shutters",
        body: `For ${city} homes, shutter recommendations can include interior shutters, wood shutters, composite shutters, specialty shapes, sliding door shutters, and whole-home shutter plans. The final choice is based on the design of the house, window shape, durability needs, cleaning expectations, and the quality of the finished look.`
      }
    ];
  }

  if (product === "window-coverings") {
    return [
      {
        heading: "Personalized Window Covering Consultation",
        body: `805 Shutters provides in-home and in-office consultations for ${city} customers comparing a wide range of window coverings. The visit can include shutters, shades, blinds, drapery, exterior shades, and commercial roller shades so customers can see which product best fits the window, the room, and the way the space is used.`
      },
      {
        heading: "Premium Materials, Colors, And Controls",
        body:
          "Window coverings should be selected around quality, privacy, light control, color, maintenance, and daily operation. We review available colors, fabrics, frame and bracket details, cordless or motorized controls, and the amount of natural light customers want to keep or block."
      },
      {
        heading: "For Homes, Offices, And Commercial Spaces",
        body: `Window covering projects in ${city} may involve bedrooms, living rooms, sliding doors, storefronts, offices, schools, medical spaces, restaurants, and shared workspaces. 805 Shutters helps clients compare products before ordering so the finished installation looks intentional and performs well over time.`
      }
    ];
  }

  if (product === "window-treatments") {
    return [
      {
        heading: "Complete Window Treatment Planning",
        body: `Window treatments in ${city} can include shutters, shades, blinds, wood blinds, draperies, woven shades, roller shades, honeycomb shades, exterior shades, and commercial coverings. 805 Shutters helps customers compare these choices by privacy, light intake, temperature control, color, material, room design, and budget. Customers can also discuss existing coverings, replacement goals, product maintenance, and whether the project should be completed room by room or across the whole home.`
      },
      {
        heading: "Designs, Benefits, And Product Tradeoffs",
        body:
          "Every product has different benefits. Shutters add structure and long-term durability, shades soften light and glare, blinds provide adjustable slat control, and draperies add fabric, warmth, and a finished designer look. We walk through the available designs and explain what each option will do for the room."
      },
      {
        heading: "Residential And Business Window Treatment Support",
        body: `805 Shutters works with ${city} homeowners and businesses that want quality window treatments without guessing from pictures alone. A consultation helps confirm measurements, colors, mounting details, controls, privacy goals, light exposure, and the best product mix before the order is placed.`
      }
    ];
  }

  return [
    {
      heading: `More ${label} Options To Compare`,
      body: `805 Shutters helps ${city} customers compare quality materials, colors, controls, privacy levels, light control, maintenance needs, and installation details before choosing custom ${label}.`
    }
  ];
}

const parentPages: SitePage[] = [
  {
    path: "/shutters/",
    form: true,
    title: "Custom Shutters Ventura County | Plantation Shutters | 805 Shutters",
    description:
      "Custom shutters and plantation shutters for Ventura County homes. Local measuring, installation, and free in-home consultations from 805 Shutters.",
    h1: "Custom Shutters in Ventura County",
    eyebrow: "Plantation shutters",
    intro:
      "805 Shutters measures and installs custom shutters for Ventura County homes, from classic plantation shutters to specialty shapes, sliding door shutters, and whole-home upgrades.",
    image: images.shutters,
    imageAlt: "Stacked arched and rectangular shutters installed on tall living room windows",
    sections: [
      {
        heading: "Built For The Room",
        body:
          "Every shutter project starts with the window, the light, and the way the room is used. We help compare materials, louver size, frame style, color, privacy, cleaning needs, and budget before installation.",
        links: [
          { label: "Plantation shutters", href: "/shutters/plantation/" },
          { label: "Recent shutter projects", href: "/recent-projects/" },
          { label: "Book a shutter consultation", href: "/book-consultation/" }
        ]
      },
      {
        heading: "Where Custom Shutters Fit Best",
        body:
          "Plantation shutters work well when a room needs a built-in look, durable daily operation, flexible light control, and privacy without fabric. They are often a strong fit for living rooms, dining rooms, bedrooms, sliding doors, specialty shapes, and rooms where the window frame should feel finished.",
        bullets: [
          "Plantation shutters for living rooms, bedrooms, and dining rooms",
          "Specialty shutters for arches and non-standard window shapes",
          "Sliding door shutter solutions when access and privacy both matter",
          "Wood, composite, and painted finish discussions during measuring"
        ]
      },
      {
        heading: "Plantation Shutter Project Examples",
        body:
          "Project pages help customers see how custom shutters look in real Ventura County rooms before scheduling a consultation. These examples connect shutter shoppers to finished-room proof instead of leaving the service page as a generic product overview.",
        links: [
          { label: "Plantation shutters installed in Ventura County", href: "/recent-projects/plantation-shutters-ventura-county-project/" },
          { label: "Custom arched plantation shutters", href: "/recent-projects/arched-plantation-shutters-ventura-county/" },
          { label: "Sliding door shutters", href: "/recent-projects/sliding-door-shutters-ventura-county/" },
          { label: "Dark wood plantation shutters", href: "/recent-projects/dark-wood-plantation-shutters-ventura-county/" }
        ]
      },
      {
        heading: "Local Shutter Service Areas",
        body:
          "Our team works across Camarillo, Thousand Oaks, Ventura, Oxnard, Simi Valley, Moorpark, Newbury Park, Westlake Village, Ojai, and nearby Ventura County communities.",
        bullets: site.areas,
        links: [
          { label: "Shutters in Camarillo", href: "/shutters/camarillo/" },
          { label: "Shutters in Thousand Oaks", href: "/shutters/thousand-oaks/" },
          { label: "Shutters in Ventura", href: "/shutters/ventura/" }
        ]
      }
    ],
    faqs: [
      {
        question: "Are plantation shutters a good choice for Ventura County homes?",
        answer:
          "Yes. Plantation shutters are a strong fit for many Ventura County homes because they provide durable privacy, adjustable daylight, and a finished built-in look for living rooms, bedrooms, dining rooms, sliding doors, and specialty windows."
      },
      {
        question: "Can shutters be made for arched windows or sliding doors?",
        answer:
          "Yes. Custom shutters can be planned for specialty shapes, arched windows, and many sliding door openings. The consultation checks the opening, frame depth, clearance, and daily access before an order is placed."
      },
      {
        question: "What do you review before ordering custom shutters?",
        answer:
          "We review window measurements, frame or mount style, material, louver size, color, divider rails, panel swing, handle clearance, privacy goals, light control, and how the shutters should work in the room."
      }
    ]
  },
  {
    path: "/shades/",
    form: true,
    title: "Custom Window Shades Ventura County | 805 Shutters",
    description:
      "Custom roller shades, honeycomb shades, woven wood shades, Roman shades, and motorized shades for Ventura County homes and businesses.",
    h1: "Custom Window Shades in Ventura County",
    eyebrow: "Light control and privacy",
    intro:
      "805 Shutters helps Ventura County customers choose custom shades for privacy, glare control, insulation, style, and motorized convenience.",
    image: images.shades,
    imageAlt: "Relaxed Roman shades over a wide bedroom window in a Ventura County home",
    sections: [
      {
        heading: "Shade Options",
        body:
          "Choose from roller shades, honeycomb shades, woven wood shades, Roman shades, layered shades, light-filtering fabrics, room-darkening options, and motorized controls.",
        links: [
          { label: "Motorized window shades", href: "/motorized-window-shades-ventura-county/" },
          { label: "Large-window roller shade project", href: "/recent-projects/roller-shades-large-window-ventura-county/" },
          { label: "Layered window shade project", href: "/recent-projects/layered-window-shades-ventura-county/" },
          { label: "Commercial roller shades", href: "/commercial-roller-shades/" }
        ]
      },
      {
        heading: "Match The Shade To The Goal",
        body:
          "The right custom shade depends on the problem the room needs to solve. Roller shades keep lines clean across large glass, honeycomb shades add softness and insulation, woven shades bring texture, Roman shades add fabric detail, and motorized shades help with tall or repeated openings.",
        bullets: [
          "Solar and roller shades for glare, views, and large windows",
          "Room-darkening shade fabrics for bedrooms and media rooms",
          "Woven and Roman shades when texture and softness matter",
          "Motorized shade options for tall glass and grouped windows"
        ]
      },
      {
        heading: "Measured And Installed Locally",
        body:
          "We measure each opening, review fabric and control choices, and install shades for homes and businesses throughout Ventura County.",
        links: [
          { label: "Shades in Camarillo", href: "/shades/camarillo-ca/" },
          { label: "Shades in Thousand Oaks", href: "/shades/thousand-oaks-ca/" },
          { label: "Shades in Ventura", href: "/shades/ventura-ca/" },
          { label: "Book a shade consultation", href: "/book-consultation/" }
        ]
      }
    ],
    faqs: [
      {
        question: "Which custom shade is best for glare and privacy?",
        answer:
          "The best shade depends on the room. Roller and solar shades are strong for glare and large glass, honeycomb shades add softness and insulation, woven shades add texture, and room-darkening fabrics help bedrooms and media rooms."
      },
      {
        question: "Do you offer motorized window shades?",
        answer:
          "Yes. Motorized shades can be discussed for tall windows, hard-to-reach openings, repeated windows, and rooms where grouped shade control would make daily use easier."
      },
      {
        question: "Can I compare roller, honeycomb, Roman, and woven shades in one visit?",
        answer:
          "Yes. A consultation can compare shade styles, fabric opacity, color, privacy, view-through, control side, mounting depth, and room-darkening needs before a final recommendation is made."
      }
    ]
  },
  {
    path: "/blinds/",
    form: true,
    title: "Custom Blinds Ventura County | Wood, Faux Wood and Vertical Blinds",
    description:
      "Shop custom blinds in Ventura County including wood, faux wood, aluminum, and vertical blinds. Free local consultation and professional installation.",
    h1: "Custom Blinds in Ventura County",
    eyebrow: "Measured blinds",
    intro:
      "805 Shutters installs custom blinds for Ventura County homes and businesses, including wood, faux wood, aluminum, vertical, and softwood options.",
    image: images.blinds,
    imageAlt: "Warm wood blinds filtering light in a Ventura County home office",
    sections: [
      {
        heading: "Practical Light Control",
        body:
          "Blinds are a flexible choice for bedrooms, offices, rentals, and busy living spaces where adjustable privacy and light control are the priority.",
        links: [
          { label: "Ventura County blinds", href: "/blinds/ventura-county/" },
          { label: "Window treatment comparison", href: "/window-treatments/" },
          { label: "Book a blinds consultation", href: "/book-consultation/" }
        ]
      },
      {
        heading: "Blinds For Homes, Offices, And Rentals",
        body:
          "Custom blinds can be a practical answer when a project needs clean installation, simple operation, and adjustable slat control. We compare wood blinds, faux wood blinds, aluminum blinds, vertical blinds, and softwood options based on the room, moisture exposure, window size, durability needs, and budget.",
        bullets: [
          "Wood and faux wood blinds for bedrooms, offices, and living spaces",
          "Vertical blinds for sliding doors and wide openings",
          "Aluminum blinds for simple, durable light control",
          "Commercial and rental blind replacements where consistency matters"
        ]
      },
      {
        heading: "Local Installation",
        body:
          "Our team confirms measurements, mounting details, control options, and product fit before installation.",
        links: [
          { label: "Blinds in Camarillo", href: "/blinds/camarillo-ca/" },
          { label: "Blinds in Oxnard", href: "/blinds/oxnard-ca/" },
          { label: "Blinds in Simi Valley", href: "/blinds/simi-valley-ca/" }
        ]
      }
    ],
    faqs: [
      {
        question: "What types of custom blinds do you install?",
        answer:
          "805 Shutters installs custom blinds including wood blinds, faux wood blinds, aluminum blinds, vertical blinds, and softwood options for homes, offices, rentals, and commercial spaces."
      },
      {
        question: "Are faux wood blinds good for busy rooms?",
        answer:
          "Faux wood blinds are often a practical choice for busy rooms because they provide adjustable privacy and light control with a durable finish that is easier to maintain than some natural materials."
      },
      {
        question: "Can you replace blinds in rentals, offices, or commercial spaces?",
        answer:
          "Yes. We can review replacement blind needs for homes, rentals, offices, and commercial spaces, including product consistency, durability, mounting details, window count, and budget."
      }
    ]
  },
  {
    path: "/drapery/",
    form: true,
    title: "Custom Drapery & Curtains Ventura County | 805 Shutters",
    description:
      "Custom drapery, curtains, and fabric window treatment planning for Ventura County homes. Compare drapery panels, curtain styles, privacy, light control, and room style.",
    h1: "Custom Drapery and Curtains in Ventura County",
    eyebrow: "Soft window treatments",
    intro:
      "805 Shutters helps Ventura County customers plan custom drapery, curtains, and fabric window treatments that soften rooms, add privacy, and complete the design around shutters, shades, or blinds.",
    image: images.drapery,
    imageAlt: "Custom drapery and shades in a Ventura County living room",
    sections: [
      {
        heading: "Layered Window Treatment Design",
        body:
          "Drapery can add warmth, texture, room-darkening support, privacy, and a finished look alongside shutters, shades, or blinds.",
        links: [
          { label: "Compare window treatments", href: "/window-treatments/" },
          { label: "Custom shades", href: "/shades/" },
          { label: "Book a drapery consultation", href: "/book-consultation/" }
        ]
      },
      {
        heading: "When Drapery And Curtains Complete The Room",
        body:
          "Custom drapery and curtains are often strongest when the window needs softness, a taller visual line, better room-darkening support, or a more finished design around existing shutters, shades, or blinds. The consultation can cover curtain and drapery panel styles, fabric direction, fullness, hardware, stacking space, and how the treatment should frame the room.",
        bullets: [
          "Layer drapery over shades for privacy and a softer finished look",
          "Use fabric panels to add height and warmth around large openings",
          "Plan hardware and stacking so doors and windows remain usable",
          "Coordinate colors with shutters, blinds, shades, furniture, and flooring"
        ]
      },
      {
        heading: "Local Planning",
        body:
          "The consultation covers room goals, fabric direction, privacy, light control, hardware, measurements, and how drapery fits with the rest of the home."
      },
      {
        heading: "Drapery And Curtains By City",
        body:
          "805 Shutters plans and installs custom drapery and curtains across Ventura County. Start with the page for your city for local service details and a free in-home consultation.",
        links: cityPages.map(([, caSlug, city]) => ({
          label: `Drapery and curtains in ${city}`,
          href: `/drapery/${caSlug}/`
        }))
      }
    ],
    faqs: [
      {
        question: "Can drapery be layered with shutters, shades, or blinds?",
        answer:
          "Yes. Drapery can be layered with shades, shutters, or blinds when a room needs more softness, a finished designer look, extra privacy, or stronger room-darkening support."
      },
      {
        question: "Do you offer custom curtains as well as drapery?",
        answer:
          "Yes. 805 Shutters plans custom curtains and drapery panels together during the same consultation, comparing fabric, lining, fullness, hardware, and how the panels should hang and stack for the room."
      },
      {
        question: "Where do you install custom drapery and curtains?",
        answer:
          "805 Shutters installs custom drapery and curtains across Ventura County, including Camarillo, Thousand Oaks, Moorpark, Simi Valley, Newbury Park, Westlake Village, Oxnard, Ventura, Ojai, and nearby communities."
      },
      {
        question: "What is reviewed during a custom drapery consultation?",
        answer:
          "The consultation reviews room goals, fabric direction, fullness, hardware, measurements, stacking space, privacy, light control, and how the drapery should coordinate with nearby window treatments and furniture."
      },
      {
        question: "Can custom drapery help with room darkening?",
        answer:
          "Yes. Depending on fabric, lining, mounting, and how the panels overlap the opening, custom drapery can help improve room darkening and privacy."
      }
    ]
  },
  {
    path: "/exterior-shades/",
    form: true,
    title: "Exterior Shades Ventura County | Outdoor Shades | 805 Shutters",
    description:
      "Exterior shades and outdoor shade planning for Ventura County patios, sun exposure, glare control, privacy, and outdoor living spaces.",
    h1: "Exterior Shades in Ventura County",
    eyebrow: "Outdoor light control",
    intro:
      "805 Shutters helps Ventura County customers plan exterior shades for patios, large openings, sun exposure, glare control, privacy, and more comfortable outdoor living.",
    image: images.exteriorShades,
    imageAlt: "Exterior solar shades across a bright outdoor living opening with ocean views",
    sections: [
      {
        heading: "Shade For Outdoor Living",
        body:
          "Exterior shades can help manage heat, glare, privacy, and sun exposure around patios, sliding doors, outdoor rooms, and large window openings.",
        links: [
          { label: "Compare interior shades", href: "/shades/" },
          { label: "Window coverings overview", href: "/window-coverings/" },
          { label: "Book an exterior shade consultation", href: "/book-consultation/" }
        ]
      },
      {
        heading: "Plan Around Sun, Wind, And The Opening",
        body:
          "Outdoor shade projects need a different review than interior window treatments. We look at sun direction, heat gain, glare, privacy, mounting structure, patio use, operation preferences, and how the shade should perform across the brightest parts of the day.",
        bullets: [
          "Patios and outdoor rooms with afternoon sun exposure",
          "Large openings where glare and heat make the space harder to use",
          "Sliding doors and glass walls that need privacy without closing the room",
          "Exterior shade planning before final product and fabric selection"
        ]
      },
      {
        heading: "Measured For The Opening",
        body:
          "The consultation covers the opening, mounting conditions, exposure, fabric direction, operation preferences, and how the shade should perform throughout the day."
      }
    ],
    faqs: [
      {
        question: "Where do exterior shades work best?",
        answer:
          "Exterior shades can work well around patios, outdoor rooms, sliding doors, glass walls, and large openings where sun exposure, glare, heat, or privacy make the space harder to use."
      },
      {
        question: "Can exterior shades help with heat and glare?",
        answer:
          "Yes. Exterior shades can reduce direct sun exposure and soften glare before the light reaches the interior or outdoor living area, depending on the opening, fabric, and mounting conditions."
      },
      {
        question: "What do you review before ordering outdoor shades?",
        answer:
          "We review the opening, mounting structure, sun direction, wind exposure, privacy goals, fabric direction, operation preference, and how the shade should perform during the brightest parts of the day."
      }
    ]
  },
  {
    path: "/window-treatments/",
    form: true,
    title: "Window Treatments Ventura County | Shutters, Shades and Blinds",
    description:
      "Compare custom shutters, shades, blinds, and window coverings from a local Ventura County installer. Free in-home consultation from 805 Shutters.",
    h1: "Window Treatments in Ventura County",
    eyebrow: "Compare product options",
    intro:
      "Compare shutters, shades, blinds, motorized products, and commercial window treatments with a local Ventura County team.",
    image: images.hero,
    imageAlt: "Custom window treatments installed in a Ventura County living room",
    sections: [
      {
        heading: "One Consultation, Multiple Options",
        body:
          "We help match the product to the room: shutters for structure, shades for softness and glare control, blinds for flexible adjustment, drapery for fabric and warmth, exterior shades for outdoor exposure, and commercial coverings for larger spaces.",
        links: [
          { label: "Custom shutters", href: "/shutters/" },
          { label: "Custom shades", href: "/shades/" },
          { label: "Custom blinds", href: "/blinds/" },
          { label: "Custom drapery", href: "/drapery/" }
        ]
      },
      {
        heading: "In-Home Or In-Office Consultation",
        body:
          "805 Shutters offers personalized consultation for customers comparing window treatments, window coverings, shutters, shades, blinds, drapery, and commercial roller shades. The goal is to understand the room, the amount of light entering the space, privacy needs, color direction, available products, and which design will work best before anything is ordered."
      },
      {
        heading: "Privacy, Light Intake, And Temperature",
        body:
          "Quality shutters, shades, blinds, and draperies can help beautify a living space while giving better control over home privacy, light intake, glare, and temperature. We explain the benefits and tradeoffs of each option so customers can make a confident choice.",
        links: [
          { label: "Recent local projects", href: "/recent-projects/" },
          { label: "Window treatments in Camarillo", href: "/window-treatments/camarillo-ca/" },
          { label: "Book a window treatment consultation", href: "/book-consultation/" }
        ]
      },
      {
        heading: "Best Product By Room Type",
        body:
          "Bedrooms usually need privacy and room-darkening support, kitchens need durable materials and easy cleaning, living rooms often need flexible daylight control, and offices need glare reduction for screens. We use those room-by-room details to narrow the best window treatment before final color, material, and control decisions."
      }
    ],
    faqs: [
      {
        question: "How do I choose between shutters, shades, blinds, and drapery?",
        answer:
          "The best choice depends on the room, privacy needs, light control, cleaning expectations, budget, and the finished look you want. A consultation can compare the options side by side before anything is ordered."
      },
      {
        question: "Can one consultation cover several window treatment types?",
        answer:
          "Yes. One visit can compare shutters, shades, blinds, drapery, exterior shades, and commercial window treatments so each room gets the product that fits the actual goal."
      },
      {
        question: "Do you install window treatments for both homes and businesses?",
        answer:
          "Yes. 805 Shutters works with homeowners and businesses across Ventura County, including residential rooms, offices, storefronts, medical spaces, schools, and shared workspaces."
      }
    ]
  },
  {
    path: "/window-coverings/",
    form: true,
    title: "Window Coverings Ventura County | 805 Shutters",
    description:
      "Custom window coverings for Ventura County homes and businesses including shutters, shades, blinds, and commercial roller shades.",
    h1: "Window Coverings in Ventura County",
    eyebrow: "Custom coverings",
    intro:
      "805 Shutters installs custom window coverings for homes, offices, storefronts, medical spaces, restaurants, schools, and shared workspaces.",
    image: images.hero,
    imageAlt: "Custom window coverings installed in Ventura County",
    sections: [
      {
        heading: "Residential And Commercial",
        body:
          "From plantation shutters and roller shades to vertical blinds and commercial roller shades, the recommendation is based on light, privacy, maintenance, durability, and design.",
        links: [
          { label: "Residential window treatments", href: "/window-treatments/" },
          { label: "Commercial window coverings", href: "/commercial-window-coverings/" },
          { label: "Commercial roller shades", href: "/commercial-roller-shades/" }
        ]
      },
      {
        heading: "Wide Range Of Window Coverings",
        body:
          "805 Shutters provides in-home and in-office consultations on a wide range of window coverings, including shutters, shades, blinds, draperies, woven shades, roller shades, exterior shades, and commercial products. Customers can compare colors, materials, controls, and mounting details in one visit.",
        links: [
          { label: "Shutters", href: "/shutters/" },
          { label: "Shades", href: "/shades/" },
          { label: "Blinds", href: "/blinds/" },
          { label: "Exterior shades", href: "/exterior-shades/" }
        ]
      },
      {
        heading: "Premium Quality For Local Clients",
        body:
          "The consultation focuses on premium quality, practical options, and the final appearance of the room. We help clients consider privacy, sun exposure, the amount of natural light, maintenance, price, and the product style that will make the window covering look like it belongs in the space.",
        links: [
          { label: "Window coverings in Camarillo", href: "/window-coverings/camarillo-ca/" },
          { label: "Window coverings in Thousand Oaks", href: "/window-coverings/thousand-oaks-ca/" },
          { label: "Window coverings in Ventura", href: "/window-coverings/ventura-ca/" },
          { label: "Book a window covering consultation", href: "/book-consultation/" }
        ]
      },
      {
        heading: "What Counts As A Window Covering",
        body:
          "Customers often use window coverings as a broad search term for anything installed at the window. For 805 Shutters, that can include plantation shutters, roller shades, honeycomb shades, woven shades, Roman shades, wood blinds, faux wood blinds, vertical blinds, drapery, exterior shades, and commercial shade systems."
      }
    ],
    faqs: [
      {
        question: "What is the difference between window treatments and window coverings?",
        answer:
          "Customers often use both terms for products installed at the window. Window coverings usually refers broadly to shutters, shades, blinds, drapery, exterior shades, and commercial shade systems."
      },
      {
        question: "Do you install residential and commercial window coverings?",
        answer:
          "Yes. 805 Shutters installs residential window coverings for homes and commercial window coverings for offices, storefronts, schools, medical spaces, restaurants, and shared workspaces."
      },
      {
        question: "Can you help plan window coverings room by room?",
        answer:
          "Yes. We can compare product type, privacy, light control, durability, color, control options, maintenance, and budget room by room before final measuring."
      }
    ]
  },
  {
    path: "/commercial-window-coverings/",
    form: true,
    title: "Commercial Window Coverings Ventura County | 805 Shutters",
    description:
      "Commercial window coverings in Ventura County for schools, office buildings, warehouses, storefronts, retail spaces, and property managers. Free shade audit.",
    h1: "Commercial Window Coverings for Ventura County Businesses",
    eyebrow: "Commercial shade audits",
    intro:
      "805 Shutters helps schools, office buildings, warehouses, storefronts, retail spaces, property managers, and tenant-improvement teams choose commercial shades, blinds, and window coverings that solve glare, heat, privacy, safety, and appearance issues.",
    image: images.commercialHero,
    imageAlt: "Commercial office window coverings for a sunlit Southern California workspace",
    gallery: [
      {
        image: images.commercialStorefront,
        imageAlt: "Southern California storefront for commercial solar shade planning"
      },
      {
        image: images.commercialWarehouse,
        imageAlt: "Industrial warehouse with high windows for commercial shade planning"
      },
      {
        image: images.commercialSchool,
        imageAlt: "Southern California school campus for classroom shade replacement planning"
      }
    ],
    sections: [
      {
        heading: "Built For Commercial Projects",
        body:
          "Commercial window coverings need to do more than look good. They need to control glare, protect privacy, reduce heat, fit the building, and hold up to daily use. 805 Shutters measures the space, recommends the right product mix, and installs the selected coverings with a clear scope."
      },
      {
        heading: "Commercial Spaces We Serve",
        body:
          "The commercial page is built for buyers searching for school window coverings, office building shades, warehouse blinds, storefront roller shades, retail solar shades, medical office privacy shades, and property replacement programs across Ventura County.",
        bullets: [
          "Schools and public facilities",
          "Office buildings and office suites",
          "Warehouses and industrial flex spaces",
          "Storefronts, lobbies, restaurants, and retail spaces",
          "Medical, dental, and professional offices",
          "Property managers and tenant-improvement teams"
        ]
      },
      {
        heading: "Commercial Roller Shades, Blinds, And Replacement Programs",
        body:
          "Product recommendations can include commercial roller shades, solar shades, blackout shades, motorized shades, honeycomb shades, faux wood blinds, vertical blinds, and damaged blind replacement. The right option depends on window size, mounting conditions, fabric openness, color, operation, cleaning needs, building use, employee comfort, and customer-facing appearance."
      },
      {
        heading: "Free Commercial Shade Audit",
        body:
          "The free commercial shade audit reviews glare, heat, privacy, damaged coverings, cord or safety concerns, replacement priorities, room count, and target timing. After the walkthrough, 805 Shutters can recommend product options and provide budget direction before final measuring."
      },
      {
        heading: "Commercial Window Coverings By City",
        body:
          "805 Shutters supports commercial projects across Ventura County. Start with the page for your city for local building types, project examples, and a free shade audit.",
        links: [
          { label: "Commercial roller shades", href: "/commercial-roller-shades/" },
          ...cityPages.map(([, caSlug, city]) => ({
            label: `Commercial window coverings in ${city}`,
            href: `/commercial-window-coverings/${caSlug}/`
          }))
        ]
      }
    ],
    cta: "Schedule a free commercial shade audit"
  },
  {
    path: "/commercial-roller-shades/",
    form: true,
    title: "Commercial Roller Shades Ventura County | Office & Storefront Solar Shades | 805 Shutters",
    description:
      "Commercial roller shades and solar shades for Ventura County offices, storefronts, schools, medical spaces, and warehouses. Glare, heat, and privacy control with a free shade audit.",
    h1: "Commercial Roller Shades in Ventura County",
    eyebrow: "Commercial roller shades",
    intro:
      "Commercial roller shades control glare, heat, and privacy while keeping offices, storefronts, and customer-facing spaces clean and professional. 805 Shutters measures, recommends, and installs roller-shade systems for Ventura County businesses.",
    image: images.commercialHero,
    imageAlt: "Commercial roller shades on tall office windows in a sunlit Southern California workspace",
    gallery: [
      {
        image: images.commercialStorefront,
        imageAlt: "Storefront fitted with commercial solar roller shades"
      },
      {
        image: images.commercialSchool,
        imageAlt: "School campus suited for cordless commercial roller shade replacement"
      },
      {
        image: images.commercialWarehouse,
        imageAlt: "Warehouse office windows suited for commercial roller shades"
      }
    ],
    sections: [
      {
        heading: "Where Commercial Roller Shades Work Best",
        body:
          "Roller shades are the most common commercial window covering because they are clean, durable, and easy to operate. They fit offices, conference rooms, storefronts, lobbies, schools, medical suites, and warehouse offices where glare, heat, and privacy all matter.",
        bullets: [
          "Office floors and private suites",
          "Conference and presentation rooms",
          "Storefronts, lobbies, and showrooms",
          "Classrooms and facility spaces",
          "Medical and professional offices",
          "Warehouse and industrial offices"
        ]
      },
      {
        heading: "Solar, Light-Filtering, And Blackout Roller Shades",
        body:
          "The fabric does most of the work. Solar shades cut glare and heat while keeping the view and daylight, light-filtering fabrics soften a room, and blackout fabrics give conference rooms, classrooms, and treatment rooms full privacy and presentation control. We compare openness factor, color, and exterior appearance before ordering.",
        links: [
          { label: "Commercial window coverings (full overview)", href: "/commercial-window-coverings/" },
          { label: "Custom window shades for homes", href: "/shades/" }
        ]
      },
      {
        heading: "Manual And Motorized Roller Shade Systems",
        body:
          "Roller shades can be manual chain-driven or motorized for tall glass, hard-to-reach openings, boardrooms, and multi-window walls. Motorized systems can be grouped by room or exposure so an entire wall of shades moves together, which keeps large commercial spaces consistent and easy to manage."
      },
      {
        heading: "Roller Shades By City",
        body:
          "805 Shutters installs commercial roller shades across Ventura County, with local landing pages for the cities where most commercial projects start.",
        links: commercialHubCities.map((hub) => ({
          label: `Commercial window coverings in ${hub.city}`,
          href: `/commercial-window-coverings/${hub.caSlug}/`
        }))
      }
    ],
    cta: "Schedule a free commercial shade audit"
  }
];

const supportPages: SitePage[] = [
  {
    path: "/about/",
    title: "About 805 Shutters | Family-Owned Ventura County Window Treatments",
    description:
      "Learn about 805 Shutters, a family-owned Ventura County window treatment company with over 30 years of local experience and 5-star Yelp reviews.",
    h1: "About 805 Shutters",
    eyebrow: "Family-owned by Ken Hill",
    intro:
      "805 Shutters is a family-owned local window treatment company serving Ventura County and nearby communities. For more than 30 years, homeowners and businesses have trusted us for custom shutters, shades, blinds, commercial roller shades, and window coverings installed with personal service.",
    image: images.aboutLegacy,
    imageAlt: "Legacy 805 Shutters blue blinds photo from the previous About page",
    gallery: [
      {
        image: images.aboutLegacyFull,
        imageAlt: "Blue blinds legacy photo from the previous 805 Shutters website"
      },
      {
        image: images.aboutLegacyHome,
        imageAlt: "Legacy 805 Shutters window treatment room photo from the previous website"
      },
      {
        image: images.aboutLegacyShades,
        imageAlt: "Legacy 805 Shutters shades header photo from the previous website"
      }
    ],
    sections: [
      {
        heading: "Owner: Ken Hill",
        body:
          "The previous 805 Shutters website identified Ken Hill as the public owner/author for the business and presented 805 Shutters as family-owned and operated. That local owner history now carries forward on the redesigned site with the same focus on personal service, product guidance, careful measuring, and professional installation."
      },
      {
        heading: "Family-Owned Local Service",
        body:
          "We are not a national call center or a one-size-fits-all installer. Customers work with a local team that understands Ventura County homes, coastal light, privacy needs, heat control, and the details that matter when choosing window treatments for daily use."
      },
      {
        heading: "Custom Measuring, Sales, And Installation",
        body:
          "Every project starts with the right measurements and product guidance. We help customers choose window treatments that fit their home, budget, light-control needs, privacy goals, and style. Our core services include plantation shutters, interior shutters, roller shades, Roman shades, woven shades, motorized shades, wood blinds, faux wood blinds, vertical blinds, commercial window coverings, and commercial roller shades."
      },
      {
        heading: "Trusted Reputation",
        body:
          "805 Shutters has a 5-star Yelp review reputation, with customers regularly mentioning responsive service, professional installation, knowledgeable recommendations, and a smooth experience from consultation through completion. You can review public customer feedback on Yelp, BBB, and MapQuest.",
        links: [
          {
            label: "Yelp reviews",
            href: "https://www.yelp.com/biz/805-shutters-shades-blinds-camarillo-2"
          },
          {
            label: "BBB profile",
            href: "https://www.bbb.org/us/ca/camarillo/profile/window-coverings/805-shutters-shades-blinds-1236-3001378"
          },
          {
            label: "MapQuest listing",
            href: "https://www.mapquest.com/us/california/805-shutters-shades-blinds-378112738"
          }
        ]
      },
      {
        heading: "Service Area",
        body:
          "We serve Camarillo, Thousand Oaks, Ventura, Oxnard, Simi Valley, Moorpark, Newbury Park, Westlake Village, Ojai, Santa Rosa Valley, Port Hueneme, Santa Paula, Fillmore, Oak Park, and nearby Ventura County communities."
      },
      {
        heading: "Start With A Free Consultation",
        body:
          "Call (805) 806-9344 or visit our contact page to schedule a free in-home consultation.",
        links: [{ label: "Contact 805 Shutters", href: "/contact/" }]
      }
    ],
    cta: "Schedule a free in-home consultation"
  },
  {
    path: "/contact/",
    title: "Contact 805 Shutters | Free In-Home Consultation",
    description:
      "Contact 805 Shutters for a free in-home consultation for custom shutters, shades, blinds, and commercial window coverings in Ventura County.",
    h1: "Contact 805 Shutters",
    eyebrow: "Free consultation",
    intro:
      "Tell us what rooms or windows you want to update and we will help compare product options for your space.",
    image: images.hero,
    imageAlt: "Custom shutters installed in a Ventura County living room",
    form: true,
    sections: [
      {
        heading: "Call Or Send A Request",
        body:
          "Call 805-806-9344 or send a consultation request with your city, product interest, and the best way to reach you."
      },
      {
        heading: "Local Ventura County Service",
        body:
          "805 Shutters serves Ventura County communities including Camarillo, Thousand Oaks, Ventura, Oxnard, Simi Valley, Moorpark, Newbury Park, Westlake Village, Ojai, Port Hueneme, Santa Paula, Fillmore, and Oak Park."
      }
    ]
  },
  {
    path: "/free-window-treatment-consultation/",
    title: "Free Window Treatment Consultation in Ventura County | 805 Shutters",
    description:
      "Request a free in-home consultation for custom shutters, shades, blinds, or commercial window coverings in Ventura County.",
    h1: "Free In-Home Window Treatment Consultation",
    eyebrow: "Ventura County",
    intro:
      "Get custom shutters, shades, blinds, or commercial window coverings measured and recommended by a local Ventura County team.",
    image: images.hero,
    imageAlt: "Window shutters and shades in a Ventura County home",
    form: true,
    sections: [
      {
        heading: "Why Customers Choose 805 Shutters",
        body:
          "805 Shutters is family-owned, local, and experienced with residential and commercial window treatment projects throughout Ventura County.",
        bullets: [
          "Over 30 years of local experience",
          "Custom measuring and professional installation",
          "Shutters, shades, blinds, and commercial coverings in one place",
          "Monthly payment options through Wisetack, including 0% APR plans for qualified customers",
          "Service across Camarillo, Thousand Oaks, Ventura, Oxnard, Simi Valley, Moorpark, Newbury Park, Westlake Village, Ojai, and nearby cities"
        ]
      },
      {
        heading: "How The Consultation Works",
        body:
          "We review the rooms, windows, privacy needs, light control goals, product options, materials, colors, and installation details before you buy."
      }
    ]
  },
  {
    path: "/financing/",
    title: "Window Treatment Financing in Ventura County | 0% APR Options | 805 Shutters",
    description:
      "Finance custom shutters, shades, blinds, and drapery in Ventura County with monthly payment options through Wisetack, including 0% APR plans for qualified customers.",
    h1: "Flexible Financing For Shutters, Shades & Blinds",
    eyebrow: "Pay over time",
    intro:
      "Get the custom window treatments your home needs now and pay over time with monthly payment options through Wisetack, including 0% APR plans for qualified customers.",
    image: images.hero,
    imageAlt: "Custom plantation shutters in a bright Ventura County living room",
    sections: [
      {
        heading: "Monthly Payments Through Wisetack",
        body:
          "805 Shutters partners with Wisetack, a consumer financing platform built for home services, so Ventura County homeowners can split a window treatment project into predictable monthly payments instead of paying everything up front.",
        bullets: [
          "Check your options in about a minute from your phone",
          "Checking eligibility does not impact your credit score",
          "Choose from multiple monthly payment plans",
          "No prepayment penalties, origination fees, or late fees",
          "0% APR plans available for qualified customers"
        ]
      },
      {
        heading: "How Financing Works",
        body:
          "Request a free in-home consultation and we will measure your windows and build your custom quote. If you want to pay over time, we text or email you a secure Wisetack link for your project. You pick the monthly plan that fits your budget, and we get to work - Wisetack pays us directly, and you simply make your monthly payments.",
        links: [{ label: "Book a free in-home consultation", href: "/book-consultation/" }]
      },
      {
        heading: "Why Homeowners Like Paying Over Time",
        body:
          "Custom shutters, shades, and drapery are a long-term upgrade to your home. Financing lets you do the whole project at once - every room, matching treatments, motorization if you want it - instead of phasing it over years. Ask about financing during your consultation and we will walk you through the options with no pressure and no obligation."
      },
      {
        heading: "Financing Disclosure",
        body:
          "All financing is subject to credit approval. Your terms may vary. Payment options through Wisetack are provided by Wisetack's lending partners. For example, a $5,500 purchase could cost $253.54 per month for 24 months, based on a 9.9% APR, or $1,833.33 per month for 3 months, based on a 0% APR. Offers range from 0 to 35.9% APR based on amount requested and creditworthiness. Not all merchants and lending partners participate in 0% interest programs. Terms range from 3 to 120 months and may vary based on merchant, lending partner, or transaction size. State interest rate caps may apply. No prepaid finance charges or participation fees. See additional terms at wisetack.com/faqs."
      }
    ],
    faqs: [
      {
        question: "Can I finance shutters, shades, or blinds in Ventura County?",
        answer:
          "Yes. 805 Shutters offers monthly payment options through Wisetack on custom shutters, shades, blinds, and drapery projects, including 0% APR plans for qualified customers. Ask about financing during your free in-home consultation."
      },
      {
        question: "Does checking my financing options affect my credit score?",
        answer:
          "No. Checking your options through Wisetack is a soft credit inquiry and does not impact your credit score. A quick application from your phone shows the monthly payment plans you qualify for."
      },
      {
        question: "Is there a fee or penalty for paying off financing early?",
        answer:
          "No. Wisetack financing has no prepayment penalties, no origination fees, and no late fees. You can pay off your plan early at any time."
      },
      {
        question: "How do I apply for window treatment financing?",
        answer:
          "Schedule a free in-home consultation with 805 Shutters. After we build your custom quote, we send you a secure Wisetack link by text or email. You check your options in about a minute and pick the monthly plan that works for you."
      }
    ],
    cta: "Request a free consultation"
  },
  {
    path: "/thank-you/",
    title: "Thank You | 805 Shutters",
    description:
      "Thank you for contacting 805 Shutters. Our Ventura County window treatment team will follow up soon.",
    h1: "Thank You",
    eyebrow: "Request received",
    intro:
      "Thanks for reaching out to 805 Shutters. We will follow up soon about your shutters, shades, blinds, drapery, or commercial window covering project.",
    image: images.shutters,
    imageAlt: "Finished custom shutters in a Ventura County home",
    noIndex: true,
    sections: [
      {
        heading: "Prefer To Talk Now?",
        body:
          "Call 805-806-9344 if you want to talk through your project right away. We can help compare products, service areas, timing, and next steps."
      },
      {
        heading: "What Happens Next",
        body:
          "We will review your request, confirm the best way to reach you, and help schedule a free consultation for the rooms or windows you want to update."
      }
    ],
    cta: "Explore window treatment options"
  },
  {
    path: "/privacy-policy/",
    title: "Privacy Policy | 805 Shutters",
    description:
      "Privacy policy and notice at collection for 805 Shutters website visitors and consultation requests.",
    h1: "Privacy Policy",
    eyebrow: "Notice at collection",
  intro:
      "This privacy policy explains how 805 Shutters collects and uses information submitted through this website, advertising forms, phone calls, and consultation requests.",
    image: images.shutters,
    imageAlt: "Custom shutters installed in a Ventura County home",
    noIndex: true,
    sections: [
      {
        heading: "Information We Collect",
        body:
          "We may collect your name, phone number, email address, city, project interest, notes you submit, page path, advertising campaign details, referral source, device/browser information, and similar website analytics information."
      },
      {
        heading: "How We Use Information",
        body:
          "We use this information to respond to consultation requests, schedule appointments, provide window treatment recommendations, improve advertising, measure website performance, prevent spam, and operate the business."
      },
      {
        heading: "Advertising And Analytics",
        body:
          "The website may use analytics and advertising tools, including Google and Meta technologies, to understand campaign performance and show relevant ads. These tools may use cookies or similar identifiers."
      },
      {
        heading: "Sharing",
        body:
          "We do not sell customer lead information. We may share information with service providers that help operate the website, lead database, advertising, analytics, hosting, email, scheduling, and customer follow-up."
      },
      {
        heading: "Your Choices",
        body:
          "You may request access, correction, or deletion of information you submitted by contacting 805 Shutters. California residents may have additional rights under California privacy law depending on how the law applies to the business."
      },
      {
        heading: "Contact",
        body:
          "For privacy requests or questions, call 805-806-9344 or use the contact form on this website."
      }
    ],
    cta: "Request a free consultation"
  },
  {
    path: "/faq/",
    title: "Shutters, Shades & Blinds FAQ | 805 Shutters",
    description:
      "Answers to common questions about custom shutters, shades, blinds, consultations, installation, and service areas in Ventura County.",
    h1: "Shutters, Shades and Blinds FAQ",
    eyebrow: "Questions",
    intro:
      "Answers to common questions about choosing and installing custom window treatments in Ventura County.",
    image: images.shutters,
    imageAlt: "Plantation shutters installed in a Ventura County room",
    sections: [
      {
        heading: "Do you serve my area?",
        body:
          "805 Shutters serves Ventura County and nearby communities including Camarillo, Thousand Oaks, Ventura, Oxnard, Simi Valley, Moorpark, Newbury Park, Westlake Village, Ojai, Santa Rosa Valley, Port Hueneme, Santa Paula, Oak Park, and Fillmore."
      },
      {
        heading: "Can you help compare shutters, shades, and blinds?",
        body:
          "Yes. The consultation is designed to compare product types, materials, privacy, light control, room style, cleaning needs, and budget."
      },
      {
        heading: "Do you make custom drapery and curtains?",
        body:
          "Yes. 805 Shutters plans, measures, and installs custom drapery and curtains across Ventura County — on their own or layered over shutters, shades, or blinds.",
        links: [{ label: "Custom drapery and curtains", href: "/drapery/" }]
      },
      {
        heading: "Do you install motorized shades?",
        body:
          "Yes. Motorized roller, honeycomb, and Roman shades are quoted during the same free consultation, including options compatible with common smart home systems.",
        links: [{ label: "Motorized window shades", href: "/motorized-window-shades-ventura-county/" }]
      },
      {
        heading: "Do you handle commercial projects?",
        body:
          "Yes. 805 Shutters installs commercial roller shades and window coverings for offices, retail spaces, restaurants, schools, medical spaces, and shared facilities."
      },
      {
        heading: "Do you offer financing?",
        body:
          "Yes. 805 Shutters offers monthly payment options through Wisetack, including 0% APR plans for qualified customers. Checking your options takes about a minute from your phone and does not impact your credit score.",
        links: [{ label: "Learn about financing", href: "/financing/" }]
      },
      {
        heading: "What are your business hours?",
        body:
          "Business hours are Monday through Saturday from 8:00 AM to 6:00 PM. Sunday is closed."
      }
    ]
  },
  {
    path: "/gallery/",
    title: "Window Treatment Gallery Ventura County | 805 Shutters",
    description:
      "Browse examples of shutters, shades, blinds, and window coverings installed by 805 Shutters in Ventura County.",
    h1: "Window Treatment Gallery",
    eyebrow: "Installed products",
    intro:
      "Browse examples of shutters, shades, blinds, and window coverings that match common Ventura County rooms and project goals.",
    image: images.hero,
    imageAlt: "Gallery of custom window treatments",
    gallery: oldWebsitePortfolioGallery,
    sections: [
      {
        heading: "Project Inspiration",
        body:
          "Use the gallery to compare product fit for living rooms, bedrooms, dining rooms, sliding doors, large windows, and commercial spaces."
      }
    ]
  },
  {
    path: "/reviews/",
    title: "805 Shutters Reviews | Ventura County Window Treatments",
    description:
      "Read reviews for 805 Shutters serving Ventura County with custom shutters, shades, blinds, and professional installation.",
    h1: "805 Shutters Reviews",
    eyebrow: "Customer proof",
    intro:
      "805 Shutters is a family-owned Ventura County company that has grown for more than 30 years on referrals and repeat customers. Reviews from real local projects are the best way to judge the work.",
    image: images.shutters,
    imageAlt: "Finished plantation shutters in a Ventura County home",
    sections: [
      {
        heading: "Where To Read Our Reviews",
        body:
          "805 Shutters reviews are published on independent platforms where every review comes from a real customer account.",
        links: [
          { label: "805 Shutters on Google Maps", href: site.googleMaps.url },
          { label: "805 Shutters on Yelp", href: site.social.yelp },
          { label: "Recent local projects with photos", href: "/recent-projects/" }
        ]
      },
      {
        heading: "What Local Customers Hire Us For",
        body:
          "Most reviews come from projects across Camarillo, Thousand Oaks, Moorpark, Simi Valley, Newbury Park, Westlake Village, Oxnard, Ventura, and nearby communities: plantation shutters in living areas, roller and honeycomb shades in bedrooms, motorized shades on tall glass, blinds for offices and rentals, and drapery that finishes the room.",
        links: [
          { label: "Custom shutters", href: "/shutters/" },
          { label: "Custom shades", href: "/shades/" },
          { label: "Custom blinds", href: "/blinds/" },
          { label: "Custom drapery and curtains", href: "/drapery/" }
        ]
      },
      {
        heading: "How The Work Earns The Review",
        body:
          "Every project starts with a free in-home consultation, real product samples, and a written quote that includes measuring and professional installation. The same local family team handles the project from first visit to final fit, and the finished windows are what customers describe in their reviews."
      },
      {
        heading: "Recently Completed A Project With Us?",
        body:
          "If 805 Shutters installed your shutters, shades, blinds, or drapery, a short review on Google or Yelp helps other Ventura County homeowners find local work they can trust. It takes about a minute, and every review is read by the family."
      }
    ],
    faqs: [
      {
        question: "Where can I read reviews of 805 Shutters?",
        answer:
          "805 Shutters reviews are published on Google and Yelp under '805 Shutters'. The recent projects page on this site also shows completed local installations with photos."
      },
      {
        question: "Does 805 Shutters serve my city?",
        answer:
          "805 Shutters serves all of Ventura County and the Conejo Valley, including Camarillo, Thousand Oaks, Moorpark, Simi Valley, Newbury Park, Westlake Village, Oak Park, Oxnard, Ventura, Port Hueneme, Ojai, Santa Paula, Santa Rosa Valley, and Fillmore."
      },
      {
        question: "How do I leave a review?",
        answer:
          "Search for '805 Shutters' on Google or Yelp and tap the review button. Customers also receive a direct review link by text after installation."
      }
    ],
    cta: "Schedule a free in-home consultation"
  },
  {
    path: "/recent-projects/",
    title: "Recent Window Treatment Projects | 805 Shutters",
    description:
      "Recent custom shutter, shade, blind, and window covering projects completed by 805 Shutters in Ventura County.",
    h1: "Recent Local Window Treatment Projects",
    eyebrow: "Project proof",
    intro:
      "Recent project pages help customers see what shutters and shades look like in real Ventura County spaces.",
    image: "/images/portfolio-enhanced/plantation-shutters-dining-room-wide.jpg",
    imageAlt: "White plantation shutters installed in a Ventura County dining room",
    gallery: [
      ...recentJobGallery,
      {
        image: "/images/portfolio-enhanced/plantation-shutters-dining-room-card.jpg",
        imageAlt: "White plantation shutters installed in a Ventura County dining room"
      },
      {
        image: "/images/portfolio-enhanced/dark-wood-plantation-shutters-reading-room-card.jpg",
        imageAlt: "Dark wood plantation shutters installed in a Ventura County reading room"
      },
      {
        image: "/images/portfolio-enhanced/arched-window-custom-shutters-card.jpg",
        imageAlt: "Custom arched plantation shutters installed in Ventura County"
      },
      {
        image: "/images/portfolio-enhanced/layered-shades-bedroom-window-card.jpg",
        imageAlt: "Layered window shades installed on a Ventura County bedroom window"
      },
      {
        image: "/images/portfolio-enhanced/roller-shade-large-window-card.jpg",
        imageAlt: "Roller shade covering a large Ventura County window"
      },
      {
        image: "/images/portfolio-enhanced/bedroom-sliding-door-shutters-card.jpg",
        imageAlt: "Custom shutters installed on a Ventura County bedroom sliding door"
      }
    ],
    sections: [
      {
        heading: "Recent local project examples",
        body:
          "Browse recent plantation shutter, arched shutter, roller shade, layered shade, and sliding door shutter projects completed for Ventura County homes."
      }
    ]
  }
];

const projectServiceArea =
  "805 Shutters serves Camarillo, Thousand Oaks, Ventura, Oxnard, Simi Valley, Moorpark, Newbury Park, Westlake Village, Ojai, Santa Rosa Valley, Port Hueneme, Santa Paula, Fillmore, Oak Park, and nearby Ventura County communities.";

const projectCompanyProof =
  "805 Shutters is a family-owned local business with over 30 years of experience measuring and installing custom shutters, shades, blinds, commercial roller shades, and window coverings across Ventura County and nearby communities.";

const recentProjectPages: SitePage[] = [
  {
    path: "/recent-projects/sliding-door-shutters-ventura-county/",
    title: "Sliding Door Shutters in Ventura County | 805 Shutters",
    description:
      "A recent local shutter project showing shutters used on a sliding door opening for privacy, light control, and a finished bedroom look.",
    h1: "Sliding Door Shutters in Ventura County",
    eyebrow: "Recent project",
    intro:
      "A recent local shutter project showing shutters used on a sliding door opening for privacy, light control, and a finished bedroom look.",
    image: "/images/portfolio-enhanced/bedroom-sliding-door-shutters-wide.jpg",
    imageAlt: "Custom shutters for a Ventura County bedroom sliding door installed by 805 Shutters.",
    gallery: [
      {
        image: "/images/portfolio-enhanced/bedroom-sliding-door-shutters-card.jpg",
        imageAlt: "Custom shutters for a Ventura County bedroom sliding door installed by 805 Shutters."
      }
    ],
    sections: [
      {
        heading: "Project details",
        body:
          "This project used shutters for a bedroom sliding door opening. The main goals were privacy, light control, easy access, and a clean built-in look.",
        bullets: ["Product: shutters for sliding doors", "Application: bedroom sliding door opening", "Benefits: privacy, light control, easy access, and a clean built-in look"]
      },
      {
        heading: "Why this window treatment worked",
        body:
          "Custom shutters for sliding doors can help Ventura County homeowners improve privacy, manage natural light, reduce glare, and create a more finished look around a bedroom sliding door opening."
      },
      {
        heading: "Local service area",
        body: projectServiceArea
      },
      {
        heading: "Can shutters be installed on sliding doors?",
        body:
          "Yes. Custom shutter solutions can be designed for many sliding door openings depending on the size, access needs, and room layout."
      },
      {
        heading: "Who installs sliding door shutters in Ventura County?",
        body:
          "805 Shutters installs custom shutters and window coverings for sliding doors throughout Ventura County."
      },
      {
        heading: "Can you help compare shutters, shades, and blinds for a sliding door?",
        body:
          "Yes. During a free consultation, 805 Shutters can help compare practical options for privacy, light control, and daily use."
      }
    ]
  },
  {
    path: "/recent-projects/roller-shades-large-window-ventura-county/",
    title: "Roller Shades for Large Windows in Ventura County | 805 Shutters",
    description:
      "A recent roller shade project showing a clean shade solution for a wide window opening with privacy and glare control.",
    h1: "Roller Shades for Large Windows in Ventura County",
    eyebrow: "Recent project",
    intro:
      "A recent roller shade project showing a clean shade solution for a wide window opening with privacy and glare control.",
    image: "/images/portfolio-enhanced/roller-shade-large-window-wide.jpg",
    imageAlt: "Roller shade covering a large Ventura County window installed by 805 Shutters.",
    gallery: [
      {
        image: "/images/portfolio-enhanced/roller-shade-large-window-card.jpg",
        imageAlt: "Roller shade covering a large Ventura County window installed by 805 Shutters."
      }
    ],
    sections: [
      {
        heading: "Project details",
        body:
          "This project used roller shades on a large window opening. The goals were privacy, glare control, clean lines, and easy daily use.",
        bullets: ["Product: roller shades", "Application: large window opening", "Benefits: privacy, glare control, clean lines, and easy daily use"]
      },
      {
        heading: "Why this window treatment worked",
        body:
          "Roller shades for large windows can help Ventura County homeowners improve privacy, manage natural light, reduce glare, and create a more finished look around wide window openings."
      },
      {
        heading: "Local service area",
        body: projectServiceArea
      },
      {
        heading: "Are roller shades a good choice for large windows?",
        body:
          "Yes. Roller shades work well on many large window openings because they provide broad coverage with a clean, minimal look."
      },
      {
        heading: "Does 805 Shutters install roller shades in Ventura County?",
        body:
          "Yes. 805 Shutters installs roller shades for homes and businesses throughout Ventura County."
      },
      {
        heading: "Do you install commercial roller shades?",
        body:
          "Yes. 805 Shutters also installs commercial roller shades and commercial window coverings."
      }
    ]
  },
  {
    path: "/recent-projects/layered-window-shades-ventura-county/",
    title: "Layered Window Shades in Ventura County | 805 Shutters",
    description:
      "A recent local shade project showing layered shades selected for a clean look, privacy, and softened natural light.",
    h1: "Layered Window Shades in Ventura County",
    eyebrow: "Recent project",
    intro:
      "A recent local shade project showing layered shades selected for a clean look, privacy, and softened natural light.",
    image: "/images/portfolio-enhanced/layered-shades-bedroom-window-wide.jpg",
    imageAlt: "Layered window shades on a Ventura County bedroom window installed by 805 Shutters.",
    gallery: [
      {
        image: "/images/portfolio-enhanced/layered-shades-bedroom-window-card.jpg",
        imageAlt: "Layered window shades on a Ventura County bedroom window installed by 805 Shutters."
      }
    ],
    sections: [
      {
        heading: "Project details",
        body:
          "This local shade project used layered window shades on a bedroom window. The goals were privacy, filtered light, soft style, and a clean window opening.",
        bullets: ["Product: layered window shades", "Application: bedroom window", "Benefits: privacy, filtered light, soft style, and a clean window opening"]
      },
      {
        heading: "Why this window treatment worked",
        body:
          "Layered window shades can help Ventura County homeowners improve privacy, manage natural light, reduce glare, and create a more finished look around bedroom windows."
      },
      {
        heading: "Shade planning details",
        body:
          "For layered shade projects, the consultation reviews fabric opacity, color, privacy, view-through, light filtering, room-darkening needs, control side, mounting depth, window trim, and the way the shade will look from both inside and outside the room. Those details help the finished product feel custom instead of generic."
      },
      {
        heading: "When layered shades are a strong fit",
        body:
          "Layered shades are often a good fit when a customer wants the softness of a shade with more flexible light control than a single flat fabric. They can work well in bedrooms, sitting rooms, and living spaces where privacy, filtered daylight, glare control, and a clean designer look all matter at the same time."
      },
      {
        heading: "Local service area",
        body: projectServiceArea
      },
      {
        heading: "Are layered shades good for bedrooms?",
        body:
          "Yes. Layered shades can soften sunlight, improve privacy, and create a clean finished look for bedroom windows."
      },
      {
        heading: "Does 805 Shutters install custom shades in Ventura County?",
        body:
          "Yes. 805 Shutters installs custom shades throughout Ventura County and nearby communities."
      },
      {
        heading: "Can I compare shades and shutters during one visit?",
        body:
          "Yes. A free in-home consultation can cover shutters, shades, blinds, and window covering options."
      }
    ]
  },
  {
    path: "/recent-projects/arched-plantation-shutters-ventura-county/",
    title: "Custom Arched Plantation Shutters in Ventura County | 805 Shutters",
    description:
      "A recent specialty-window project showing custom arched plantation shutters measured to fit curved window openings.",
    h1: "Custom Arched Plantation Shutters in Ventura County",
    eyebrow: "Recent project",
    intro:
      "A recent specialty-window project showing custom arched plantation shutters measured to fit curved window openings.",
    image: "/images/portfolio-enhanced/arched-window-custom-shutters-wide.jpg",
    imageAlt: "Custom arched plantation shutters in a Ventura County living room installed by 805 Shutters.",
    gallery: [
      {
        image: "/images/portfolio-enhanced/arched-window-custom-shutters-card.jpg",
        imageAlt: "Custom arched plantation shutters in a Ventura County living room installed by 805 Shutters."
      },
      {
        image: "/images/portfolio-enhanced/specialty-arch-window-shutters-card.jpg",
        imageAlt: "Specialty arch window shutters with custom fit in Ventura County by 805 Shutters."
      }
    ],
    sections: [
      {
        heading: "Project details",
        body:
          "This specialty-window project used custom arched plantation shutters for curved window openings. The goals were exact fit, architectural style, privacy, and light control.",
        bullets: ["Product: custom arched plantation shutters", "Application: specialty arched windows", "Benefits: exact fit, architectural style, privacy, and light control"]
      },
      {
        heading: "Why this window treatment worked",
        body:
          "Custom arched plantation shutters can help Ventura County homeowners improve privacy, manage natural light, reduce glare, and create a more finished look around arched living room and dining room windows."
      },
      {
        heading: "Local service area",
        body: projectServiceArea
      },
      {
        heading: "Can plantation shutters be made for arched windows?",
        body:
          "Yes. Plantation shutters can be custom measured and built for specialty arched windows and other non-standard window shapes."
      },
      {
        heading: "Who installs arched shutters in Ventura County?",
        body:
          "805 Shutters installs custom shutters for arched and specialty windows throughout Ventura County and nearby communities."
      },
      {
        heading: "Do specialty shutters require an in-home measurement?",
        body:
          "Yes. Specialty shapes should be measured in person so the shutters fit the opening correctly."
      }
    ]
  },
  {
    path: "/recent-projects/dark-wood-plantation-shutters-ventura-county/",
    title: "Dark Wood Plantation Shutters in Ventura County | 805 Shutters",
    description:
      "A recent local plantation shutter project showing dark wood shutters used for privacy, light control, and a warmer finished-room look.",
    h1: "Dark Wood Plantation Shutters in Ventura County",
    eyebrow: "Recent project",
    intro:
      "A recent local plantation shutter project showing dark wood shutters used for privacy, light control, and a warmer finished-room look.",
    image: "/images/portfolio-enhanced/dark-wood-plantation-shutters-reading-room-wide.jpg",
    imageAlt: "Dark wood plantation shutters in a Ventura County reading room installed by 805 Shutters.",
    gallery: [
      {
        image: "/images/portfolio-enhanced/dark-wood-plantation-shutters-reading-room-card.jpg",
        imageAlt: "Dark wood plantation shutters in a Ventura County reading room installed by 805 Shutters."
      },
      {
        image: "/images/portfolio-enhanced/dark-wood-plantation-shutters-living-room-card.jpg",
        imageAlt: "Dark wood plantation shutters across living room windows in Ventura County by 805 Shutters."
      }
    ],
    sections: [
      {
        heading: "Project details",
        body:
          "This local plantation shutter project used dark wood plantation shutters for residential living spaces. The goals were privacy, light control, room warmth, and a finished built-in look.",
        bullets: ["Product: dark wood plantation shutters", "Application: residential living spaces", "Benefits: privacy, light control, room warmth, and a finished built-in look"]
      },
      {
        heading: "Why this window treatment worked",
        body:
          "Dark wood plantation shutters can help Ventura County homeowners improve privacy, manage natural light, reduce glare, and create a more finished look around reading room and living room windows."
      },
      {
        heading: "Local service area",
        body: projectServiceArea
      },
      {
        heading: "Can 805 Shutters install dark wood plantation shutters in Ventura County?",
        body:
          "Yes. 805 Shutters installs custom plantation shutters for Ventura County homes, including dark wood looks and other finish options."
      },
      {
        heading: "Why choose dark wood shutters?",
        body:
          "Dark wood shutters can add contrast, warmth, privacy, and stronger visual definition around the window opening."
      },
      {
        heading: "Do you offer free in-home consultations?",
        body:
          "Yes. 805 Shutters offers free in-home consultations for shutters, shades, blinds, and window coverings."
      }
    ]
  },
  {
    path: "/recent-projects/plantation-shutters-ventura-county-project/",
    title: "Plantation Shutters Installed in a Ventura County Home | 805 Shutters",
    description:
      "White plantation shutters installed for a Ventura County home with better privacy, flexible light control, and custom fit for multiple window shapes.",
    h1: "Plantation Shutters Installed in a Ventura County Home",
    eyebrow: "Recent project",
    intro:
      "This local project shows white plantation shutters installed for a Ventura County home by 805 Shutters. The goal was a clean, finished look with better privacy, flexible light control, and a custom fit for multiple window shapes.",
    image: "/images/portfolio-enhanced/plantation-shutters-dining-room-wide.jpg",
    imageAlt: "White plantation shutters in a Ventura County dining room installed by 805 Shutters.",
    gallery: [
      {
        image: "/images/portfolio-enhanced/plantation-shutters-dining-room-card.jpg",
        imageAlt: "White plantation shutters in a Ventura County dining room installed by 805 Shutters."
      },
      {
        image: "/images/portfolio-enhanced/arched-plantation-shutters-living-room-card.jpg",
        imageAlt: "Custom arched plantation shutters in a Ventura County living room installed by 805 Shutters."
      }
    ],
    sections: [
      {
        heading: "Project details",
        body:
          "This project included custom measuring and plantation shutter installation. The rooms shown include dining room and living room windows in Ventura County.",
        bullets: [
          "Service: custom measuring and plantation shutter installation",
          "Product type: white plantation shutters",
          "Rooms shown: dining room and living room windows",
          "Area: Ventura County",
          "Company: family-owned local window treatment installer with over 30 years of experience"
        ]
      },
      {
        heading: "Why plantation shutters worked well here",
        body:
          "Plantation shutters are a strong choice for homeowners who want a permanent window treatment with a built-in look. They help manage privacy, reduce glare, control natural light, and create a clean frame around each window."
      },
      {
        heading: "Custom shutters for standard and arched windows",
        body:
          "Homes throughout Ventura County often have a mix of standard rectangular windows and specialty shapes. 805 Shutters measures each opening carefully so the finished shutters fit the architecture instead of looking like an afterthought."
      },
      {
        heading: "Measured before ordering",
        body:
          "Before shutters are ordered, the team checks frame depth, trim, sill conditions, louver clearance, panel swing, color, room use, and privacy goals. That detail helps the finished plantation shutters look built in and operate correctly after installation."
      },
      {
        heading: "Local experience",
        body: projectCompanyProof
      },
      {
        heading: "Who installs plantation shutters in Ventura County?",
        body:
          "805 Shutters installs custom plantation shutters for homeowners throughout Ventura County and nearby communities."
      },
      {
        heading: "Can plantation shutters be made for arched windows?",
        body:
          "Yes. Plantation shutters can be custom measured and fitted for specialty windows, including arched windows and other non-standard openings."
      },
      {
        heading: "Do you offer free in-home consultations?",
        body:
          "Yes. 805 Shutters offers free in-home consultations for shutters, shades, blinds, commercial roller shades, and other window coverings."
      }
    ]
  }
];

type CityPageOverride = Partial<Pick<SitePage, "title" | "description" | "intro" | "gallery" | "sections" | "faqs">>;

function shutterCityGallery(city: string): NonNullable<SitePage["gallery"]> {
  return [
    {
      image: "/images/portfolio-enhanced/plantation-shutters-dining-room-card.jpg",
      imageAlt: `White plantation shutters installed in a ${city} dining room`
    },
    {
      image: "/images/portfolio-enhanced/arched-window-custom-shutters-card.jpg",
      imageAlt: `Custom arched plantation shutters planned for a ${city} living room`
    },
    {
      image: "/images/portfolio-enhanced/bedroom-sliding-door-shutters-card.jpg",
      imageAlt: `Sliding door shutters for a ${city} bedroom opening`
    }
  ];
}

function shadeCityGallery(city: string): NonNullable<SitePage["gallery"]> {
  return [
    {
      image: "/images/portfolio-enhanced/roller-shade-large-window-card.jpg",
      imageAlt: `Roller shade on a large ${city} window for glare and privacy control`
    },
    {
      image: "/images/portfolio-enhanced/layered-shades-bedroom-window-card.jpg",
      imageAlt: `Layered window shades for a ${city} bedroom window`
    },
    {
      image: "/images/portfolio-enhanced/uploaded-bedroom-cellular-shades-card.jpg",
      imageAlt: `Cellular shades measured for a ${city} bedroom window`
    }
  ];
}

function blindsCityGallery(city: string): NonNullable<SitePage["gallery"]> {
  return [
    {
      image: "/images/805-portfolio-blinds-office.jpg",
      imageAlt: `Custom blinds filtering light in a ${city} office`
    },
    {
      image: "/images/product-previews/vertical-blinds-sliding-door.jpg",
      imageAlt: `Vertical blinds for a ${city} sliding door opening`
    },
    {
      image: "/images/product-previews/aluminum-blinds-window.jpg",
      imageAlt: `Aluminum blinds for practical light control in a ${city} room`
    }
  ];
}

function mixedWindowTreatmentGallery(city: string): NonNullable<SitePage["gallery"]> {
  return [
    {
      image: "/images/portfolio-enhanced/plantation-shutters-dining-room-card.jpg",
      imageAlt: `Plantation shutters for a ${city} dining room`
    },
    {
      image: "/images/portfolio-enhanced/roller-shade-large-window-card.jpg",
      imageAlt: `Roller shades for a large ${city} window`
    },
    {
      image: "/images/805-portfolio-blinds-office.jpg",
      imageAlt: `Custom blinds for a ${city} office or practical room`
    }
  ];
}

function windowCoveringCityGallery(city: string): NonNullable<SitePage["gallery"]> {
  return [
    {
      image: "/images/portfolio-enhanced/dark-wood-plantation-shutters-living-room-card.jpg",
      imageAlt: `Dark wood plantation shutters for a ${city} living room`
    },
    {
      image: "/images/portfolio-enhanced/uploaded-full-height-cellular-shades-card.jpg",
      imageAlt: `Full-height cellular shades for a ${city} window covering project`
    },
    {
      image: "/images/commercial-mode/commercial-small-office-roller-shades.jpg",
      imageAlt: `Commercial roller shades for a ${city} office window covering project`
    }
  ];
}

function priorityCityPage({
  title,
  description,
  intro,
  gallery,
  serviceLabel,
  city,
  localContext,
  productFit,
  useCases,
  links,
  faqs
}: {
  title: string;
  description: string;
  intro: string;
  gallery?: NonNullable<SitePage["gallery"]>;
  serviceLabel: string;
  city: string;
  localContext: string;
  productFit: string;
  useCases: string[];
  links: { label: string; href: string }[];
  faqs: PageFaq[];
}): CityPageOverride {
  return {
    title,
    description,
    intro,
    gallery,
    sections: [
      {
        heading: `${serviceLabel} for ${city} homes and businesses`,
        body: localContext,
        links: links.slice(0, 4)
      },
      {
        heading: "Room and opening fit",
        body: productFit,
        bullets: useCases
      },
      {
        heading: "Local proof and next step",
        body: `805 Shutters is a family-owned Ventura County window treatment company with more than 30 years of local measuring, product guidance, ordering, and installation experience. The ${city} consultation helps confirm product fit, measurements, colors, controls, timing, and budget before anything is ordered.`,
        links: [
          { label: "Recent local projects", href: "/recent-projects/" },
          { label: "805 Shutters reviews", href: "/reviews/" },
          { label: "Free in-home consultation", href: "/free-window-treatment-consultation/" },
          { label: `Contact 805 Shutters about ${city}`, href: "/contact/" }
        ]
      }
    ],
    faqs
  };
}

const priorityCityPageOverrides: Record<string, CityPageOverride> = {
  "/shutters/camarillo/": priorityCityPage({
    title: "Custom Shutters Camarillo | Plantation Shutters | 805 Shutters",
    description:
      "Custom shutters and plantation shutters for Camarillo homes. Family-owned Ventura County installer with free in-home consultation. Call 805-806-9344.",
    intro:
      "805 Shutters measures and installs custom shutters for Camarillo homes, including plantation shutters, specialty shutters, sliding door shutters, and whole-home shutter projects.",
    gallery: shutterCityGallery("Camarillo"),
    serviceLabel: "Custom shutters",
    city: "Camarillo",
    localContext:
      "Camarillo shutter projects often need durable privacy, flexible daylight, and a clean built-in look for bright family rooms, bedrooms, dining rooms, sliding doors, and homes near Mission Oaks, Las Posas, Village at the Park, Spanish Hills, and nearby Santa Rosa Valley.",
    productFit:
      "Plantation shutters can be a strong fit in Camarillo when the room needs structure, easy cleaning, long-term durability, and privacy without fabric. The consultation compares material, louver size, frame style, divider rails, panel swing, color, and how the shutter should work around doors, trim, handles, and furniture.",
    useCases: [
      "Plantation shutters for Camarillo living rooms and dining rooms",
      "Bedroom shutters for privacy and room-darkening support",
      "Sliding door shutters where access and durability both matter",
      "Specialty shutter planning for arches and non-standard windows"
    ],
    links: [
      { label: "Plantation shutters", href: "/shutters/plantation/" },
      { label: "Custom shutters in Ventura County", href: "/shutters/" },
      { label: "Plantation shutter project", href: "/recent-projects/plantation-shutters-ventura-county-project/" },
      { label: "Arched shutter project", href: "/recent-projects/arched-plantation-shutters-ventura-county/" }
    ],
    faqs: [
      {
        question: "Who installs plantation shutters in Camarillo?",
        answer:
          "805 Shutters installs custom plantation shutters for Camarillo homes and nearby Ventura County communities, with local measuring, product guidance, ordering, and professional installation."
      },
      {
        question: "Can shutters be planned for Camarillo sliding doors or specialty windows?",
        answer:
          "Yes. The consultation can review sliding doors, arches, specialty shapes, frame depth, handle clearance, panel swing, and daily access before the shutter order is placed."
      },
      {
        question: "Do Camarillo shutter consultations happen in the home?",
        answer:
          "Yes. In-home measuring helps confirm the exact opening, trim, light exposure, privacy goals, color direction, and installation details before final pricing."
      }
    ]
  }),
  "/shutters/thousand-oaks/": priorityCityPage({
    title: "Custom Shutters Thousand Oaks | Plantation Shutters | 805 Shutters",
    description:
      "Custom shutters and plantation shutters for Thousand Oaks homes. Local Ventura County measuring, product guidance, and free in-home consultation.",
    intro:
      "805 Shutters helps Thousand Oaks homeowners compare custom plantation shutters, specialty shutters, and whole-home shutter plans for Conejo Valley rooms and large window openings.",
    gallery: shutterCityGallery("Thousand Oaks"),
    serviceLabel: "Custom shutters",
    city: "Thousand Oaks",
    localContext:
      "Thousand Oaks shutter projects often involve larger living rooms, bedroom privacy needs, repeated front-facing windows, and bright Conejo Valley sun exposure. We help match shutter material, color, frame style, and louver size to the room before ordering.",
    productFit:
      "Plantation shutters work well for Thousand Oaks homes when customers want a permanent window treatment with clean lines, adjustable daylight, and a built-in look. The consultation reviews privacy, glare, cleaning, ventilation, specialty shapes, and whether the project should be completed room by room or across the whole home.",
    useCases: [
      "Plantation shutters for living rooms, dining rooms, and bedrooms",
      "Front-facing shutters for privacy and curb-facing consistency",
      "Shutter plans for repeated windows and large openings",
      "Specialty shape review for arched or non-standard windows"
    ],
    links: [
      { label: "Custom shutters in Ventura County", href: "/shutters/" },
      { label: "Plantation shutters", href: "/shutters/plantation/" },
      { label: "Dark wood plantation shutter project", href: "/recent-projects/dark-wood-plantation-shutters-ventura-county/" },
      { label: "Recent shutter projects", href: "/recent-projects/" }
    ],
    faqs: [
      {
        question: "Do you install plantation shutters in Thousand Oaks?",
        answer:
          "Yes. 805 Shutters measures and installs custom plantation shutters for Thousand Oaks homes and nearby Conejo Valley communities."
      },
      {
        question: "Are shutters good for bright Thousand Oaks rooms?",
        answer:
          "Shutters can be a strong fit for bright rooms because the louvers make daylight and privacy adjustable while keeping the opening clean and structured."
      },
      {
        question: "Can a Thousand Oaks shutter project be phased by room?",
        answer:
          "Yes. The consultation can compare whole-home shutter plans with phased room-by-room installation based on priorities, timing, and budget."
      }
    ]
  }),
  "/shutters/ventura/": priorityCityPage({
    title: "Custom Shutters Ventura CA | Plantation Shutters | 805 Shutters",
    description:
      "Custom shutters and plantation shutters for Ventura CA homes. Local measuring, product comparison, and free in-home consultation from 805 Shutters.",
    intro:
      "805 Shutters plans custom shutters for Ventura homes, from coastal bedrooms and hillside living rooms to standard windows, sliding doors, and specialty shapes.",
    gallery: shutterCityGallery("Ventura"),
    serviceLabel: "Custom shutters",
    city: "Ventura",
    localContext:
      "Ventura shutter projects often need privacy, glare control, and durable daily operation for coastal light, hillside views, family rooms, bedrooms, and sliding door openings. We review how the room is used before recommending material, frame, and louver choices.",
    productFit:
      "Plantation shutters can help Ventura rooms keep natural light adjustable while improving privacy and giving the window a finished frame. The in-home visit checks trim, sill conditions, frame depth, panel swing, color direction, and how much light or view the room should keep.",
    useCases: [
      "Bedroom shutters for privacy and stronger light control",
      "Living room shutters where views and daylight both matter",
      "Sliding door shutter planning for access and durability",
      "Specialty shutters for arched or unusual openings"
    ],
    links: [
      { label: "Custom shutters in Ventura County", href: "/shutters/" },
      { label: "Arched plantation shutter project", href: "/recent-projects/arched-plantation-shutters-ventura-county/" },
      { label: "Sliding door shutter project", href: "/recent-projects/sliding-door-shutters-ventura-county/" },
      { label: "Recent local projects", href: "/recent-projects/" }
    ],
    faqs: [
      {
        question: "Who installs custom shutters in Ventura CA?",
        answer:
          "805 Shutters installs custom shutters and plantation shutters for Ventura homes and nearby Ventura County communities."
      },
      {
        question: "Can shutters work in Ventura homes with coastal light?",
        answer:
          "Yes. Shutters can help manage bright light and privacy while keeping rooms clean and easy to maintain."
      },
      {
        question: "What is reviewed during a Ventura shutter consultation?",
        answer:
          "We review window size, frame depth, trim, material, color, louver size, privacy needs, light control, clearance, and installation details."
      }
    ]
  }),
  "/shutters/oxnard/": priorityCityPage({
    title: "Custom Shutters Oxnard | Plantation Shutters | 805 Shutters",
    description:
      "Custom shutters and plantation shutters for Oxnard homes. Local measuring, product guidance, and free in-home consultation from 805 Shutters.",
    intro:
      "805 Shutters helps Oxnard homeowners plan custom shutters for privacy, light control, sliding doors, family rooms, bedrooms, and whole-home updates.",
    gallery: shutterCityGallery("Oxnard"),
    serviceLabel: "Custom shutters",
    city: "Oxnard",
    localContext:
      "Oxnard shutter projects can include coastal homes, RiverPark rooms, family living spaces, bedrooms, dining rooms, and repeated windows that need consistent privacy and light control. We help choose the shutter style that fits the room and daily use.",
    productFit:
      "Plantation shutters give Oxnard homes a durable, structured window treatment that can handle everyday use while keeping daylight adjustable. The consultation compares shutter materials, colors, frame details, louver sizes, panel layout, and specialty opening needs.",
    useCases: [
      "Whole-home shutter updates for repeated windows",
      "Bedroom shutters for privacy and room-darkening support",
      "Sliding door shutters for access and durability",
      "Dining and living room shutters for a finished built-in look"
    ],
    links: [
      { label: "Custom shutters in Ventura County", href: "/shutters/" },
      { label: "Plantation shutters", href: "/shutters/plantation/" },
      { label: "Plantation shutter project", href: "/recent-projects/plantation-shutters-ventura-county-project/" },
      { label: "Recent window treatment projects", href: "/recent-projects/" }
    ],
    faqs: [
      {
        question: "Does 805 Shutters install plantation shutters in Oxnard?",
        answer:
          "Yes. 805 Shutters installs custom plantation shutters for Oxnard homes and nearby Ventura County communities."
      },
      {
        question: "Can Oxnard shutter projects include sliding doors?",
        answer:
          "Yes. Sliding door shutter options can be reviewed during the consultation, including access, panel layout, clearance, and daily operation."
      },
      {
        question: "Can I compare shutter materials before ordering?",
        answer:
          "Yes. The consultation compares materials, color, louver size, frame style, privacy, cleaning needs, and budget before final ordering."
      }
    ]
  }),
  "/shades/camarillo-ca/": priorityCityPage({
    title: "Window Shades Camarillo | Roller Shades and Custom Shades | 805 Shutters",
    description:
      "Custom window shades for Camarillo homes and businesses, including roller shades, honeycomb shades, woven shades, Roman shades, and motorized shades.",
    intro:
      "805 Shutters helps Camarillo customers choose custom shades for privacy, glare control, room-darkening, insulation, texture, and motorized convenience.",
    gallery: shadeCityGallery("Camarillo"),
    serviceLabel: "Custom window shades",
    city: "Camarillo",
    localContext:
      "Camarillo shade projects often start with bright afternoon light, patio doors, bedrooms, home offices, open living spaces, and rooms where customers want softer light without the built-in look of shutters.",
    productFit:
      "Roller shades keep large windows clean and simple, honeycomb shades add softness and insulation, woven shades bring texture, Roman shades add fabric detail, and motorized shades help with tall or repeated openings. We compare fabric opacity, color, view-through, mounting depth, and control side before ordering.",
    useCases: [
      "Roller shades for large Camarillo windows and patio doors",
      "Room-darkening shades for bedrooms and media rooms",
      "Honeycomb shades where softness and insulation matter",
      "Motorized shades for tall, repeated, or hard-to-reach openings"
    ],
    links: [
      { label: "Custom shades in Ventura County", href: "/shades/" },
      { label: "Large-window roller shade project", href: "/recent-projects/roller-shades-large-window-ventura-county/" },
      { label: "Layered window shade project", href: "/recent-projects/layered-window-shades-ventura-county/" },
      { label: "Book a shade consultation", href: "/book-consultation/" }
    ],
    faqs: [
      {
        question: "What window shades are popular in Camarillo?",
        answer:
          "Camarillo customers often compare roller shades, solar shades, honeycomb shades, woven shades, Roman shades, room-darkening fabrics, and motorized shade options."
      },
      {
        question: "Can shades help with glare in Camarillo homes?",
        answer:
          "Yes. Shade fabric, openness, color, and mounting style can be selected to reduce glare while balancing privacy, daylight, and view-through."
      },
      {
        question: "Do you measure custom shades in person?",
        answer:
          "Yes. In-person measuring helps confirm mounting depth, control side, window size, fabric direction, privacy needs, and room-darkening goals."
      }
    ]
  }),
  "/blinds/camarillo-ca/": priorityCityPage({
    title: "Custom Blinds Camarillo | Wood and Faux Wood Blinds | 805 Shutters",
    description:
      "Custom blinds for Camarillo homes, offices, rentals, and businesses. Compare wood, faux wood, aluminum, vertical, and softwood blinds.",
    intro:
      "805 Shutters installs custom blinds in Camarillo for practical privacy, adjustable light control, durable operation, and clean installation.",
    gallery: blindsCityGallery("Camarillo"),
    serviceLabel: "Custom blinds",
    city: "Camarillo",
    localContext:
      "Camarillo blind projects often include bedrooms, home offices, rentals, sliding doors, staff rooms, and practical spaces where adjustable slat control and straightforward maintenance matter more than a fabric treatment.",
    productFit:
      "Wood and faux wood blinds can work well for bedrooms, offices, and living spaces; vertical blinds can support sliding doors and wider openings; aluminum blinds can be a simple durable choice for practical rooms. The consultation checks window size, moisture exposure, control side, durability needs, and budget.",
    useCases: [
      "Wood and faux wood blinds for Camarillo bedrooms and offices",
      "Vertical blinds for sliding doors and wide openings",
      "Durable blind replacements for rentals or business spaces",
      "Aluminum blinds where simple light control is the priority"
    ],
    links: [
      { label: "Custom blinds in Ventura County", href: "/blinds/" },
      { label: "Ventura County blinds", href: "/blinds/ventura-county/" },
      { label: "Window treatments in Camarillo", href: "/window-treatments/camarillo-ca/" },
      { label: "Free consultation", href: "/free-window-treatment-consultation/" }
    ],
    faqs: [
      {
        question: "What types of blinds do you install in Camarillo?",
        answer:
          "805 Shutters installs wood blinds, faux wood blinds, aluminum blinds, vertical blinds, and softwood blind options for Camarillo homes and businesses."
      },
      {
        question: "Are blinds a good fit for rentals or offices?",
        answer:
          "Yes. Blinds can be a practical option for rentals, offices, staff rooms, and busy spaces that need adjustable privacy, durable operation, and a clean installed look."
      },
      {
        question: "Can you replace existing blinds in Camarillo?",
        answer:
          "Yes. We can review existing blind replacement needs, window count, mounting details, product consistency, controls, and budget during the consultation."
      }
    ]
  }),
  "/window-treatments/camarillo-ca/": priorityCityPage({
    title: "Window Treatments Camarillo | Shutters, Shades and Blinds | 805 Shutters",
    description:
      "Window treatments for Camarillo homes and businesses. Compare custom shutters, shades, blinds, drapery, exterior shades, and commercial coverings.",
    intro:
      "805 Shutters helps Camarillo customers compare window treatments room by room, including shutters, shades, blinds, drapery, exterior shades, and commercial coverings.",
    gallery: mixedWindowTreatmentGallery("Camarillo"),
    serviceLabel: "Window treatments",
    city: "Camarillo",
    localContext:
      "Camarillo window treatment projects often involve a mix of privacy, glare control, room-darkening, heat, patio doors, bedrooms, home offices, and whole-home design consistency. One consultation can compare several product types before final measuring.",
    productFit:
      "Shutters add structure and durability, shades soften light and glare, blinds offer adjustable slat control, drapery adds fabric and warmth, and exterior shades can help outdoor rooms or large openings. The recommendation depends on how each room is used.",
    useCases: [
      "Whole-home window treatment planning in Camarillo",
      "Bedrooms that need privacy or room-darkening support",
      "Living rooms and patio doors with bright light or glare",
      "Homes and offices comparing several products in one visit"
    ],
    links: [
      { label: "Camarillo shutters", href: "/shutters/camarillo/" },
      { label: "Camarillo shades", href: "/shades/camarillo-ca/" },
      { label: "Camarillo blinds", href: "/blinds/camarillo-ca/" },
      { label: "Recent local projects", href: "/recent-projects/" }
    ],
    faqs: [
      {
        question: "Can I compare shutters, shades, and blinds in Camarillo?",
        answer:
          "Yes. A Camarillo consultation can compare shutters, shades, blinds, drapery, exterior shades, and commercial products in one visit."
      },
      {
        question: "What window treatment is best for each room?",
        answer:
          "The best option depends on room use, privacy, glare, cleaning, style, budget, and whether the opening is a standard window, sliding door, large window, or specialty shape."
      },
      {
        question: "Do you offer free Camarillo window treatment consultations?",
        answer:
          "Yes. 805 Shutters offers free consultations for Camarillo window treatment projects before final measuring or ordering."
      }
    ]
  }),
  "/window-coverings/thousand-oaks-ca/": priorityCityPage({
    title: "Window Coverings Thousand Oaks | 805 Shutters",
    description:
      "Custom window coverings in Thousand Oaks for homes, offices, storefronts, medical spaces, and professional suites. Free local consultation.",
    intro:
      "805 Shutters installs custom window coverings in Thousand Oaks, including shutters, shades, blinds, drapery, exterior shades, and commercial shade systems.",
    gallery: windowCoveringCityGallery("Thousand Oaks"),
    serviceLabel: "Window coverings",
    city: "Thousand Oaks",
    localContext:
      "Thousand Oaks window covering projects can include residential rooms, professional offices, medical spaces, storefronts, and larger glass openings where glare, heat, privacy, durability, and appearance all matter.",
    productFit:
      "Window coverings can include plantation shutters, roller shades, honeycomb shades, woven shades, Roman shades, wood blinds, faux wood blinds, vertical blinds, drapery, exterior shades, and commercial roller shade systems. The consultation narrows the choice by room, window size, exposure, controls, and maintenance needs.",
    useCases: [
      "Residential shutters, shades, blinds, and drapery in Thousand Oaks",
      "Office and professional-suite coverings for glare and privacy",
      "Commercial roller shades for larger glass or repeated windows",
      "Room-by-room planning for privacy, heat, and light control"
    ],
    links: [
      { label: "Window coverings in Ventura County", href: "/window-coverings/" },
      { label: "Commercial window coverings", href: "/commercial-window-coverings/" },
      { label: "Commercial roller shades", href: "/commercial-roller-shades/" },
      { label: "Thousand Oaks shutters", href: "/shutters/thousand-oaks/" }
    ],
    faqs: [
      {
        question: "What window coverings do you install in Thousand Oaks?",
        answer:
          "805 Shutters installs shutters, shades, blinds, drapery, exterior shades, commercial roller shades, and other custom window coverings for Thousand Oaks homes and businesses."
      },
      {
        question: "Can window coverings help office glare in Thousand Oaks?",
        answer:
          "Yes. Roller shades, solar shades, blinds, and other commercial coverings can be reviewed for screen glare, heat, privacy, durability, and appearance."
      },
      {
        question: "Can one visit cover residential and commercial options?",
        answer:
          "Yes. The consultation can compare residential and commercial window covering options based on product type, room use, window count, controls, and budget."
      }
    ]
  }),
  "/blinds/ventura-county/": priorityCityPage({
    title: "Ventura County Blinds | Custom Wood and Faux Wood Blinds | 805 Shutters",
    description:
      "Custom blinds across Ventura County, including wood, faux wood, aluminum, vertical, and softwood blinds. Free local consultation from 805 Shutters.",
    intro:
      "805 Shutters installs custom blinds throughout Ventura County for homes, offices, rentals, sliding doors, and practical spaces that need adjustable privacy and light control.",
    gallery: blindsCityGallery("Ventura County"),
    serviceLabel: "Custom blinds",
    city: "Ventura County",
    localContext:
      "Ventura County blind projects range from Camarillo bedrooms and Ventura home offices to Oxnard rentals, Thousand Oaks professional suites, and practical rooms where durability, control, and budget are the priority.",
    productFit:
      "Custom blinds are useful when the room needs adjustable slats, privacy, easy daily operation, and straightforward maintenance. We compare wood, faux wood, aluminum, vertical, and softwood blinds by window size, moisture exposure, control side, room use, and budget.",
    useCases: [
      "Wood and faux wood blinds for bedrooms, offices, and living rooms",
      "Vertical blinds for sliding doors and wide openings",
      "Blind replacements for rentals, offices, and practical rooms",
      "Ventura County installation support from measuring through final fit"
    ],
    links: [
      { label: "Custom blinds", href: "/blinds/" },
      { label: "Camarillo blinds", href: "/blinds/camarillo-ca/" },
      { label: "Window treatments in Ventura County", href: "/window-treatments/" },
      { label: "Free consultation", href: "/free-window-treatment-consultation/" }
    ],
    faqs: [
      {
        question: "Who installs custom blinds in Ventura County?",
        answer:
          "805 Shutters installs custom blinds across Ventura County, including Camarillo, Thousand Oaks, Ventura, Oxnard, Simi Valley, Moorpark, Newbury Park, Westlake Village, Ojai, and nearby communities."
      },
      {
        question: "What blind styles can I compare?",
        answer:
          "You can compare wood blinds, faux wood blinds, aluminum blinds, vertical blinds, and softwood blind options based on privacy, durability, maintenance, and budget."
      },
      {
        question: "Can you help replace old blinds?",
        answer:
          "Yes. We can review existing blind replacement needs, measurements, mounting details, control side, product consistency, and installation timing."
      }
    ]
  })
};

const generatedCityPages: SitePage[] = cityPages.flatMap(([shutterSlug, caSlug, city]) => {
  const windowTreatmentPath = `/window-treatments/${caSlug}/`;
  return [
    cityProductPage({
      path: `/shutters/${shutterSlug}/`,
      city,
      product: "shutters",
      title: `Shutters in ${city} CA | ${city} Shutter Installation and Repair | 805 Shutters`,
      h1: `Custom Shutters in ${city}`,
      image: images.shutters
    }),
    cityProductPage({
      path: `/shades/${caSlug}/`,
      city,
      product: "shades",
      title: `Shades near ${city} CA - 805 Shutters`,
      h1: `Custom Window Shades in ${city}`,
      image: images.shades
    }),
    cityProductPage({
      path: `/blinds/${caSlug}/`,
      city,
      product: "blinds",
      title: `Blinds near ${city} CA - 805 Shutters`,
      h1: `Custom Blinds in ${city}`,
      image: images.blinds
    }),
    cityProductPage({
      path: `/drapery/${caSlug}/`,
      city,
      product: "drapery",
      title: `Custom Drapery & Curtains near ${city} CA - 805 Shutters`,
      h1: `Custom Drapery and Curtains in ${city}`,
      image: images.drapery
    }),
    cityProductPage({
      path: `/window-coverings/${caSlug}/`,
      city,
      product: "window-coverings",
      title: `Window Coverings near ${city} CA - 805 Shutters`,
      h1: `Window Coverings in ${city}`,
      image: images.hero
    }),
    cityProductPage({
      path: windowTreatmentPath,
      city,
      product: "window-treatments",
      title: `Window Treatments near ${city} CA - 805 Shutters`,
      h1: `Window Treatments in ${city}`,
      image: images.hero
    })
  ];
});

function cityProductPage({
  path,
  city,
  product,
  title,
  h1,
  image
}: {
  path: string;
  city: string;
  product: keyof typeof productFit;
  title: string;
  h1: string;
  image: string;
}): SitePage {
  const label = product.replace("-", " ");
  const regionalServiceArea =
    city === "Santa Clarita" ? "North Los Angeles County and Santa Clarita" : "Ventura County";
  const page: SitePage = {
    path,
    title,
    description: `${h1} measured and installed by 805 Shutters. Compare privacy, light control, colors, materials, controls, and local installation.`,
    h1,
    eyebrow: `${city} service area`,
    intro: `805 Shutters helps ${city} homeowners and businesses compare custom ${label} options for privacy, light control, room style, and budget.`,
    image,
    imageAlt: `${h1} by 805 Shutters`,
    sections: [
      {
        heading: `Custom ${label} for ${city} spaces`,
        body: productFit[product]
      },
      {
        heading: "Local consultation",
        body:
          "The consultation covers window measurements, product fit, material choices, color, control options, installation details, and next steps."
      },
      {
        heading: "Room-by-room recommendations",
        body: `For ${city} projects, 805 Shutters reviews how each room is used before recommending ${label}. Bedrooms may need more privacy or room darkening, living areas may need glare control without losing natural light, and sliding doors or large windows may need products that stay easy to operate every day.`
      },
      {
        heading: "Products compared during the visit",
        body:
          "The same appointment can compare plantation shutters, roller shades, honeycomb shades, wood and faux wood blinds, vertical blinds, drapery, and commercial roller shades. That makes it easier to choose the right product for the room instead of guessing from pictures alone."
      },
      ...legacyProductSections(product, city, label),
      {
        heading: `${regionalServiceArea} installation support`,
        body: `805 Shutters serves ${city} and nearby ${regionalServiceArea} communities with measuring, product guidance, ordering, and professional installation. The goal is to help you understand cost, timing, materials, controls, and long-term maintenance before the project moves forward.`
      }
    ],
    cta: "Schedule a free in-home consultation"
  };

  const override = priorityCityPageOverrides[path];
  return override ? { ...page, ...override } : page;
}

const commercialCityContext: Record<string, string> = {
  Camarillo:
    "Camarillo business parks, the Premium Outlets, light-industrial flex space off Las Posas, and medical and professional offices",
  Fillmore:
    "downtown Fillmore storefronts, citrus and agricultural packing facilities, and small professional offices",
  Moorpark:
    "Moorpark commerce-center offices, light-industrial space along the 118, and neighborhood retail and professional suites",
  "Newbury Park":
    "Newbury Park biotech and business parks along Rancho Conejo, professional offices, and retail centers off the 101",
  "Oak Park":
    "Oak Park professional offices, retail centers, and medical and dental suites near the Thousand Oaks border",
  Ojai:
    "Ojai boutique storefronts, hospitality and wellness businesses, galleries, and professional offices along the Arcade",
  Oxnard:
    "Oxnard industrial and warehouse corridors, Port of Hueneme logistics facilities, agricultural operations, The Collection retail, and growing office space",
  "Port Hueneme":
    "Port Hueneme harbor and logistics businesses, base-adjacent offices, and local storefronts",
  "Santa Paula":
    "Santa Paula agricultural and packing operations, historic downtown storefronts, and professional offices",
  "Santa Rosa Valley":
    "Santa Rosa Valley professional offices, agricultural properties, and the nearby Camarillo and Thousand Oaks business corridors",
  "Simi Valley":
    "Simi Valley industrial parks, the Madera and Cochran retail corridors, professional offices, and tenant-improvement build-outs",
  "Thousand Oaks":
    "Thousand Oaks corporate campuses, biotech and professional offices along the 101, retail centers, and medical buildings near Los Robles",
  Ventura:
    "downtown Ventura storefronts, Main Street retail, harbor-area businesses, and county, professional, and medical offices",
  "Westlake Village":
    "Westlake Village corporate campuses and financial offices along the 101, hospitality properties, and medical and professional suites"
};

function commercialCityPage({ city, caSlug }: { city: string; caSlug: string }): SitePage {
  const context = commercialCityContext[city] ?? `${city} offices, storefronts, schools, and commercial properties`;
  const otherHubs = commercialHubCities.filter((hub) => hub.caSlug !== caSlug).slice(0, 3);

  return {
    path: `/commercial-window-coverings/${caSlug}/`,
    title: `Commercial Window Coverings ${city} CA | Office, Retail & Warehouse Shades | 805 Shutters`,
    description: `Commercial window coverings for ${city} offices, storefronts, schools, medical spaces, and warehouses. Roller shades, solar shades, blinds, and a free commercial shade audit from 805 Shutters.`,
    h1: `Commercial Window Coverings in ${city}`,
    eyebrow: `${city} commercial`,
    intro: `805 Shutters helps ${context} control glare, heat, privacy, and appearance with commercial roller shades, solar shades, blinds, and window coverings measured and installed by a local Ventura County team.`,
    image: images.commercialHero,
    imageAlt: `Commercial window coverings for a sunlit ${city} workspace`,
    gallery: [
      {
        image: images.commercialStorefront,
        imageAlt: `Southern California storefront near ${city} for commercial solar shade planning`
      },
      {
        image: images.commercialWarehouse,
        imageAlt: `Industrial warehouse with high windows for ${city} commercial shade planning`
      },
      {
        image: images.commercialSchool,
        imageAlt: `Southern California school campus near ${city} for classroom shade replacement planning`
      }
    ],
    sections: [
      {
        heading: `Commercial Spaces We Serve In ${city}`,
        body: `805 Shutters installs commercial window coverings throughout ${city}, including ${context}. Whether the project is a single suite or a full building, we match the shade or blind to how the space is used, who sees it, and the sun it takes.`,
        bullets: [
          "Offices, suites, and tenant improvements",
          "Storefronts, lobbies, and retail spaces",
          "Medical, dental, and professional offices",
          "Schools, childcare, and public facilities",
          "Warehouses, flex space, and industrial offices",
          "Property managers and multi-tenant buildings"
        ]
      },
      {
        heading: `Glare, Heat, And Privacy Control For ${city} Buildings`,
        body: `${city} businesses deal with strong Southern California sun, screen glare in offices, heat load on west- and south-facing glass, and privacy on street-facing windows. The right commercial roller shade, solar shade, or blind keeps the space comfortable and professional without making it feel closed off — and worn or damaged blinds get replaced cleanly.`
      },
      {
        heading: "Commercial Roller Shades, Solar Shades, And Blinds",
        body: `For ${city} projects, product recommendations can include commercial roller shades, solar shades, blackout shades, honeycomb shades, faux wood blinds, vertical blinds, motorized shades, and phased replacement programs. The best fit depends on window size, mounting conditions, fabric openness, color, operation, building use, and how the glass should look from the street.`
      },
      {
        heading: `Free Commercial Shade Audit For ${city} Businesses`,
        body: `The free commercial shade audit walks the property and reviews window count, glare, heat, privacy, damaged coverings, safety concerns, replacement priorities, and target timing. After the walkthrough, 805 Shutters recommends product options and provides budget direction before final measuring — for a single ${city} office or a multi-building program.`
      },
      {
        heading: `Do you install commercial window coverings in ${city}?`,
        body: `Yes. 805 Shutters installs commercial roller shades, solar shades, blinds, and window coverings for ${city} offices, storefronts, schools, medical spaces, warehouses, and shared facilities, with local measuring and professional installation.`
      },
      {
        heading: `Can you phase a ${city} commercial project?`,
        body: `Yes. ${city} projects can be broken into priority rooms, buildings, or issues so the highest-impact glare, heat, privacy, or safety problems are handled first while staying inside budget and tenant schedules.`
      },
      {
        heading: `How do ${city} commercial quotes work?`,
        body: `Most ${city} commercial quotes start with a site audit, then a field measure, then a written proposal that lists product type, room and window count, fabric and color, operation, exclusions, and installation timing so the scope is clear before anything is ordered.`
      },
      {
        heading: "Explore More Commercial Window Coverings",
        body: `See the full commercial program and compare related ${city}-area pages.`,
        links: [
          { label: "Commercial window coverings (full overview)", href: "/commercial-window-coverings/" },
          { label: "Commercial roller shades", href: "/commercial-roller-shades/" },
          { label: `Window treatments in ${city}`, href: `/window-treatments/${caSlug}/` },
          ...otherHubs.map((hub) => ({
            label: `Commercial window coverings in ${hub.city}`,
            href: `/commercial-window-coverings/${hub.caSlug}/`
          }))
        ]
      }
    ],
    cta: `Schedule a free commercial shade audit in ${city}`
  };
}

const commercialCityPages: SitePage[] = cityPages.map(([, caSlug, city]) =>
  commercialCityPage({ city, caSlug })
);

const commercialCityNamesByPath = new Map(
  commercialCityPages.map((page, index) => [page.path, cityPages[index][2]] as const)
);

export function commercialCityName(path: string): string | null {
  return commercialCityNamesByPath.get(normalizePath(path)) ?? null;
}

function isResidentialLocationPage(path: string) {
  return /^\/(shutters|shades|blinds|drapery|window-coverings|window-treatments)\/[^/]+\/$/.test(path);
}

function searchDepthSections(page: SitePage): PageSection[] {
  const isCommercialCityPage =
    page.path.startsWith("/commercial-window-coverings/") && page.path !== "/commercial-window-coverings/";
  if (
    page.noIndex ||
    isCommercialCityPage ||
    isResidentialLocationPage(page.path) ||
    page.path === "/financing/" ||
    (page.path.startsWith("/recent-projects/") && page.path !== "/recent-projects/")
  ) {
    return page.sections;
  }
  const existingHeadings = new Set(page.sections.map((section) => section.heading));

  if (page.path === "/commercial-window-coverings/" || page.path === "/commercial-roller-shades/") {
    const commercialAdditions: PageSection[] = [
      {
        heading: "Before A Commercial Project Is Ordered",
        body:
          "Before a commercial shade, blind, or window covering project is ordered, 805 Shutters confirms window count, mount conditions, field dimensions, bracket or frame details, fabric and color direction, control side, safety requirements, access needs, work hours, tenant constraints, and whether the project should be completed in one phase or by priority area."
      },
      {
        heading: "What We Review During A Commercial Shade Audit",
        body:
          "Commercial shade audits review glare, heat, privacy, street-facing appearance, employee comfort, screen visibility, damaged coverings, cleaning needs, operation preferences, room-darkening requirements, and how the windows perform at different times of day."
      },
      {
        heading: "Compare Commercial Options In One Visit",
        body:
          "The same walkthrough can compare commercial roller shades, solar shades, blackout shades, honeycomb shades, faux wood blinds, vertical blinds, motorized shades, and phased replacement programs so the product plan fits the building instead of forcing one default answer."
      },
      {
        heading: "Local Commercial Service Area",
        body:
          "805 Shutters supports commercial projects throughout Ventura County, including Camarillo, Thousand Oaks, Ventura, Oxnard, Simi Valley, Moorpark, Newbury Park, Westlake Village, Ojai, Port Hueneme, Santa Paula, Santa Rosa Valley, Oak Park, Fillmore, and nearby communities."
      },
      {
        heading: "Commercial Quote Details That Affect Pricing",
        body:
          "Commercial pricing depends on product type, fabric openness, color, window size, installation height, mounting surface, manual or motorized operation, access conditions, room count, removal of old coverings, scheduling restrictions, and whether the buyer needs a single-room replacement, full-building plan, or tenant-improvement package."
      },
      {
        heading: "Commercial Consultation Next Step",
        body:
          "A commercial consultation is the fastest way to turn product research into a clear scope. The visit helps confirm measurements, project priorities, product tradeoffs, installation details, budget direction, and the best next step before a quote or order is finalized."
      }
    ];

    return [
      ...page.sections,
      ...commercialAdditions.filter((section) => !existingHeadings.has(section.heading))
    ];
  }

  const additions: PageSection[] = [
    {
      heading: "Before A Project Is Ordered",
      body:
        "Before any shutter, shade, blind, drapery, or commercial window covering is ordered, 805 Shutters confirms opening size, mount location, frame or bracket details, material and color choices, control side, child-safety needs, room-darkening goals, and access around doors, trim, handles, and furniture. That checklist helps prevent reorders, protects the installation schedule, and gives each customer a clear record of what is being built for every room. It also makes it easier to compare product options, lead times, care requirements, and long-term value before the order moves forward."
    },
    {
      heading: "What We Review",
      body: `${page.h1} consultations include measurements, mounting details, privacy goals, sun exposure, room use, color direction, material options, controls, cleaning needs, and installation timing. 805 Shutters uses that information to recommend products that fit the room instead of pushing one default answer.`
    },
    {
      heading: "Compare Options In One Visit",
      body:
        "Many homes need more than one window treatment type. Shutters may be right for structure and long-term durability, shades may be better for softness or glare control, blinds can offer flexible adjustment, and drapery can finish a room with fabric and warmth."
    },
    {
      heading: "Local Service Area",
      body:
        "805 Shutters works throughout Ventura County, including Camarillo, Thousand Oaks, Ventura, Oxnard, Simi Valley, Moorpark, Newbury Park, Westlake Village, Ojai, Port Hueneme, Santa Paula, Santa Rosa Valley, Oak Park, Fillmore, and nearby communities."
    },
    {
      heading: "Product Details That Affect The Quote",
      body:
        "The final recommendation depends on more than window size. We review whether the space is a home, office, storefront, medical space, restaurant, school, rental, or specialty room; whether the customer wants privacy, light filtering, room darkening, heat control, glare reduction, ventilation, security, appeal, or a designer finish; and whether wood, faux wood, composite, aluminum, woven fabric, roller fabric, drapery, or exterior shade material is the best fit. We also discuss how the treatment should look from inside, outside, and alongside nearby furniture or doors."
    },
    {
      heading: "Free Consultation Next Step",
      body:
        "A free consultation is the fastest way to turn product research into a clear plan. The visit helps confirm measurements, room priorities, product tradeoffs, installation details, and the best next step before a quote or order is finalized."
    }
  ];
  return [
    ...page.sections,
    ...additions.filter((section) => !existingHeadings.has(section.heading))
  ];
}

function withSearchDepth(page: SitePage): SitePage {
  return {
    ...page,
    sections: searchDepthSections(page)
  };
}

const specialtyPages: SitePage[] = [
  cityProductPage({
    path: "/blinds/ventura-county/",
    city: "Ventura County",
    product: "blinds",
    title: "Ventura County Blinds | Custom Blinds | 805 Shutters",
    h1: "Custom Blinds in Ventura County",
    image: images.blinds
  }),
  cityProductPage({
    path: "/window-treatments/camarillo/",
    city: "Camarillo",
    product: "window-treatments",
    title: "Window Treatments Camarillo CA | 805 Shutters",
    h1: "Window Treatments in Camarillo CA",
    image: images.hero
  }),
  cityProductPage({
    path: "/ventura-county-window-treatments-camarillo-blinds-shades-shutters/",
    city: "Ventura County",
    product: "window-treatments",
    title: "Ventura County Window Treatments | 805 Shutters",
    h1: "Ventura County Window Treatments",
    image: images.hero
  }),
  cityProductPage({
    path: "/shutters/plantation/",
    city: "Ventura County",
    product: "shutters",
    title: "Plantation Shutters | Plantation Shutter Installation | 805 Shutters",
    h1: "Plantation Shutters in Ventura County",
    image: images.shutters
  }),
  cityProductPage({
    path: "/shutters/interior-shutters-camarillo/",
    city: "Camarillo",
    product: "shutters",
    title: "Interior Shutters Camarillo | 805 Shutters",
    h1: "Interior Shutters in Camarillo",
    image: images.shutters
  }),
  cityProductPage({
    path: "/shutters/wood-shutters-camarillo/",
    city: "Camarillo",
    product: "shutters",
    title: "Wood Shutters Camarillo | 805 Shutters",
    h1: "Wood Shutters in Camarillo",
    image: images.shutters
  })
];

export const homePage: SitePage = withSearchDepth({
  path: "/",
  title: "Custom Shutters, Blinds, Shades & Drapery Ventura County | 805 Shutters",
  description:
    "805 Shutters installs custom shutters, blinds, shades, drapery, and commercial window coverings across Ventura County. Free in-home consultation.",
  h1: "Custom Shutters, Blinds, Shades & Drapery in Ventura County",
  eyebrow: "Family-owned since 1995",
  intro:
    "805 Shutters helps Ventura County homeowners and businesses choose custom window treatments that fit their rooms, light, privacy, and budget.",
  image: images.hero,
  imageAlt: "Custom shades and drapery in a bright Ventura County living room",
  sections: [
    {
      heading: "Local Window Treatment Installation",
      body:
        "Our local team measures, recommends, and installs plantation shutters, roller shades, honeycomb shades, wood and faux wood blinds, drapery, vertical blinds, and commercial window coverings across Ventura County.",
      links: [
        { label: "Motorized window shades", href: "/motorized-window-shades-ventura-county/" },
        { label: "Book a free in-home consultation", href: "/book-consultation/" }
      ]
    },
    {
      heading: "Flexible Monthly Payments",
      body:
        "Pay over time with monthly payment options through Wisetack, including 0% APR plans for qualified customers. Checking your options takes about a minute and does not impact your credit score.",
      links: [{ label: "Learn about financing", href: "/financing/" }]
    },
    {
      heading: "Popular Service Areas",
      body:
        "805 Shutters serves Camarillo, Thousand Oaks, Ventura, Oxnard, Simi Valley, Moorpark, Newbury Park, Westlake Village, Ojai, and nearby communities.",
      links: site.areas.map((area) => ({
        label: `Window treatments in ${area}`,
        href: `/window-treatments/${area.toLowerCase().replace(/ /g, "-")}-ca/`
      }))
    }
  ],
  cta: "Schedule a free in-home consultation"
});

export const allPages = [
  homePage,
  ...parentPages,
  ...supportPages,
  ...generatedCityPages,
  ...commercialCityPages,
  ...specialtyPages,
  ...recentProjectPages
].map(withSearchDepth);

export function normalizePath(path: string) {
  if (path === "/") {
    return path;
  }
  return `/${path.replace(/^\/|\/$/g, "")}/`;
}

export function getPageByPath(path: string) {
  const normalized = normalizePath(path);
  return allPages.find((page) => page.path === normalized);
}

export function getPageBySlug(slug?: string[]) {
  if (!slug || slug.length === 0) {
    return homePage;
  }
  return getPageByPath(`/${slug.join("/")}/`);
}

export function slugForPath(path: string) {
  return normalizePath(path)
    .replace(/^\/|\/$/g, "")
    .split("/")
    .filter(Boolean);
}
