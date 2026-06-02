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
  sections: PageSection[];
  cta?: string;
  form?: boolean;
};

export const site = {
  name: "805 Shutters, Shades & Blinds",
  shortName: "805 Shutters",
  phone: "805-806-9344",
  phoneHref: "tel:8058069344",
  baseUrl: process.env.NEXT_PUBLIC_SITE_URL || "https://www.805shutters.com",
  serviceArea: "Ventura County",
  areas: [
    "Camarillo",
    "Thousand Oaks",
    "Ventura",
    "Oxnard",
    "Simi Valley",
    "Moorpark",
    "Ojai",
    "Santa Rosa Valley",
    "Port Hueneme",
    "Santa Paula",
    "Oak Park",
    "Fillmore"
  ]
};

export const images = {
  hero:
    "https://i0.wp.com/www.805shutters.com/wp-content/uploads/2016/10/shutters-eclipse4.jpg?w=1600&ssl=1",
  shutters:
    "https://i0.wp.com/www.805shutters.com/wp-content/uploads/2016/10/shutters-eclipse4.jpg?w=900&ssl=1",
  shades:
    "https://i0.wp.com/www.805shutters.com/wp-content/uploads/2016/10/Shades-Honeycomb.jpg?w=900&ssl=1",
  blinds:
    "https://i0.wp.com/www.805shutters.com/wp-content/uploads/2016/10/blinds-vert2.jpg?w=900&ssl=1",
  project:
    "https://i0.wp.com/www.805shutters.com/wp-content/uploads/2016/10/Shades-Honeycomb.jpg?w=1200&ssl=1"
};

export const services: Service[] = [
  {
    title: "Custom Shutters",
    shortTitle: "Shutters",
    slug: "shutters",
    description:
      "Plantation shutters, wood shutters, specialty shapes, sliding door shutters, and whole-home shutter upgrades.",
    image: images.shutters,
    imageAlt: "White plantation shutters installed in a Ventura County bedroom"
  },
  {
    title: "Custom Window Shades",
    shortTitle: "Shades",
    slug: "shades",
    description:
      "Roller shades, honeycomb shades, Roman shades, woven wood shades, layered shades, and motorized options.",
    image: images.shades,
    imageAlt: "Honeycomb window shades installed in a Ventura County living room"
  },
  {
    title: "Custom Blinds",
    shortTitle: "Blinds",
    slug: "blinds",
    description:
      "Wood, faux wood, aluminum, vertical, and softwood blinds measured and installed for local homes and businesses.",
    image: images.blinds,
    imageAlt: "Vertical blinds installed on a large sliding door"
  },
  {
    title: "Commercial Window Coverings",
    shortTitle: "Commercial",
    slug: "commercial-window-coverings",
    description:
      "Commercial roller shades and window treatments for offices, storefronts, schools, medical spaces, and shared workspaces.",
    image: images.shades,
    imageAlt: "Commercial roller shades installed in a Ventura County office"
  }
];

const cityPages = [
  ["camarillo", "camarillo-ca", "Camarillo"],
  ["fillmore", "fillmore-ca", "Fillmore"],
  ["moorpark", "moorpark-ca", "Moorpark"],
  ["oak-park", "oak-park-ca", "Oak Park"],
  ["ojai", "ojai-ca", "Ojai"],
  ["oxnard", "oxnard-ca", "Oxnard"],
  ["port-hueneme", "port-hueneme-ca", "Port Hueneme"],
  ["santa-paula", "santa-paula-ca", "Santa Paula"],
  ["santa-rosa-valley", "santa-rosa-valley-ca", "Santa Rosa Valley"],
  ["simi-valley", "simi-valley-ca", "Simi Valley"],
  ["thousand-oaks", "thousand-oaks-ca", "Thousand Oaks"],
  ["ventura", "ventura-ca", "Ventura"]
] as const;

const productFit = {
  shutters:
    "Plantation shutters are a durable fit for living rooms, bedrooms, specialty windows, and whole-home upgrades where clean lines and easy maintenance matter.",
  shades:
    "Window shades work well when the priority is glare control, privacy, softness, motorization, or a lighter look than shutters or blinds.",
  blinds:
    "Custom blinds are practical for bedrooms, offices, rentals, and everyday spaces where adjustable light control and budget flexibility are important.",
  "window-coverings":
    "Window coverings include shutters, shades, blinds, and commercial treatments, so the recommendation can fit the room instead of forcing one product type.",
  "window-treatments":
    "Window treatments are selected around the room, light exposure, privacy needs, material preference, and the level of daily use."
};

const parentPages: SitePage[] = [
  {
    path: "/shutters/",
    title: "Custom Shutters Ventura County | Plantation Shutters | 805 Shutters",
    description:
      "Custom shutters and plantation shutters for Ventura County homes. Local measuring, installation, and free in-home consultations from 805 Shutters.",
    h1: "Custom Shutters in Ventura County",
    eyebrow: "Plantation shutters",
    intro:
      "805 Shutters measures and installs custom shutters for Ventura County homes, from classic plantation shutters to specialty shapes, sliding door shutters, and whole-home upgrades.",
    image: images.shutters,
    imageAlt: "White plantation shutters installed in a Ventura County home",
    sections: [
      {
        heading: "Built For The Room",
        body:
          "Every shutter project starts with the window, the light, and the way the room is used. We help compare materials, louver size, frame style, color, privacy, cleaning needs, and budget before installation."
      },
      {
        heading: "Local Shutter Service Areas",
        body:
          "Our team works across Camarillo, Thousand Oaks, Ventura, Oxnard, Simi Valley, Moorpark, Ojai, and nearby Ventura County communities.",
        bullets: site.areas
      }
    ]
  },
  {
    path: "/shades/",
    title: "Custom Window Shades Ventura County | 805 Shutters",
    description:
      "Custom roller shades, honeycomb shades, woven wood shades, Roman shades, and motorized shades for Ventura County homes and businesses.",
    h1: "Custom Window Shades in Ventura County",
    eyebrow: "Light control and privacy",
    intro:
      "805 Shutters helps Ventura County customers choose custom shades for privacy, glare control, insulation, style, and motorized convenience.",
    image: images.shades,
    imageAlt: "Custom honeycomb shades installed in a Ventura County sitting room",
    sections: [
      {
        heading: "Shade Options",
        body:
          "Choose from roller shades, honeycomb shades, woven wood shades, Roman shades, layered shades, light-filtering fabrics, room-darkening options, and motorized controls."
      },
      {
        heading: "Measured And Installed Locally",
        body:
          "We measure each opening, review fabric and control choices, and install shades for homes and businesses throughout Ventura County."
      }
    ]
  },
  {
    path: "/blinds/",
    title: "Custom Blinds Ventura County | Wood, Faux Wood and Vertical Blinds",
    description:
      "Shop custom blinds in Ventura County including wood, faux wood, aluminum, and vertical blinds. Free local consultation and professional installation.",
    h1: "Custom Blinds in Ventura County",
    eyebrow: "Measured blinds",
    intro:
      "805 Shutters installs custom blinds for Ventura County homes and businesses, including wood, faux wood, aluminum, vertical, and softwood options.",
    image: images.blinds,
    imageAlt: "Vertical blinds installed on a large Ventura County sliding door",
    sections: [
      {
        heading: "Practical Light Control",
        body:
          "Blinds are a flexible choice for bedrooms, offices, rentals, and busy living spaces where adjustable privacy and light control are the priority."
      },
      {
        heading: "Local Installation",
        body:
          "Our team confirms measurements, mounting details, control options, and product fit before installation."
      }
    ]
  },
  {
    path: "/window-treatments/",
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
          "We help match the product to the room: shutters for structure, shades for softness and glare control, blinds for flexible adjustment, and commercial coverings for larger spaces."
      }
    ]
  },
  {
    path: "/window-coverings/",
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
          "From plantation shutters and roller shades to vertical blinds and commercial roller shades, the recommendation is based on light, privacy, maintenance, durability, and design."
      }
    ]
  },
  {
    path: "/commercial-window-coverings/",
    title: "Commercial Window Coverings Ventura County | 805 Shutters",
    description:
      "Commercial window coverings for offices, storefronts, restaurants, schools, and medical spaces in Ventura County.",
    h1: "Commercial Window Coverings in Ventura County",
    eyebrow: "Business window treatments",
    intro:
      "805 Shutters installs commercial window coverings for Ventura County businesses that need glare control, privacy, durability, and a professional look.",
    image: images.shades,
    imageAlt: "Commercial window coverings installed in a Ventura County office",
    sections: [
      {
        heading: "Built For Workspaces",
        body:
          "We help offices, storefronts, restaurants, schools, medical spaces, and shared facilities select window coverings that hold up to daily use."
      }
    ]
  },
  {
    path: "/commercial-roller-shades/",
    title: "Commercial Roller Shades Ventura County | 805 Shutters",
    description:
      "Commercial roller shades for Ventura County offices, storefronts, schools, medical spaces, restaurants, and shared facilities.",
    h1: "Commercial Roller Shades in Ventura County",
    eyebrow: "Commercial roller shades",
    intro:
      "Commercial roller shades help control glare, heat, and privacy while keeping offices and customer-facing spaces clean and professional.",
    image: images.shades,
    imageAlt: "Commercial roller shades for a large window",
    sections: [
      {
        heading: "Shade Systems For Business",
        body:
          "We review openness factor, fabric color, mounting conditions, manual or motorized controls, and room-by-room requirements before installation."
      }
    ]
  }
];

const supportPages: SitePage[] = [
  {
    path: "/about/",
    title: "About 805 Shutters | Family-Owned Ventura County Window Treatments",
    description:
      "Learn about 805 Shutters, a family-owned Ventura County company installing shutters, shades, blinds, and commercial window coverings.",
    h1: "Family-Owned Window Treatment Company",
    eyebrow: "Est. 1995",
    intro:
      "805 Shutters, Shades & Blinds is a local Ventura County window treatment company focused on product guidance, careful measuring, and professional installation.",
    image: images.hero,
    imageAlt: "805 Shutters family-owned local showroom style installation",
    sections: [
      {
        heading: "Local Experience",
        body:
          "The team helps homeowners and businesses compare shutters, shades, blinds, and commercial window coverings with clear recommendations for each room."
      }
    ]
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
          "Service across Camarillo, Thousand Oaks, Ventura, Oxnard, Simi Valley, Moorpark, Ojai, and nearby cities"
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
          "805 Shutters serves Ventura County and nearby communities including Camarillo, Thousand Oaks, Ventura, Oxnard, Simi Valley, Moorpark, Ojai, Santa Rosa Valley, Port Hueneme, Santa Paula, Oak Park, and Fillmore."
      },
      {
        heading: "Can you help compare shutters, shades, and blinds?",
        body:
          "Yes. The consultation is designed to compare product types, materials, privacy, light control, room style, cleaning needs, and budget."
      },
      {
        heading: "Do you handle commercial projects?",
        body:
          "Yes. 805 Shutters installs commercial roller shades and window coverings for offices, retail spaces, restaurants, schools, medical spaces, and shared facilities."
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
      "Read reviews for 805 Shutters, Shades & Blinds serving Ventura County with custom shutters, shades, blinds, and professional installation.",
    h1: "805 Shutters Reviews",
    eyebrow: "Customer proof",
    intro:
      "Reviews and referrals are central to how local customers choose 805 Shutters for window treatment projects.",
    image: images.shutters,
    imageAlt: "Finished plantation shutters in a Ventura County home",
    sections: [
      {
        heading: "Local Service Matters",
        body:
          "The new site should keep review proof close to consultation calls, service pages, and product comparison pages so visitors do not have to hunt for trust signals."
      }
    ]
  },
  {
    path: "/recent-projects/",
    title: "Recent Window Treatment Projects | 805 Shutters",
    description:
      "Recent custom shutter, shade, blind, and window covering projects completed by 805 Shutters in Ventura County.",
    h1: "Recent Local Window Treatment Projects",
    eyebrow: "Project proof",
    intro:
      "Recent project pages help customers see what different products look like in real Ventura County spaces.",
    image: images.project,
    imageAlt: "Recent custom window treatment project in Ventura County",
    sections: [
      {
        heading: "Use Projects For SEO And Trust",
        body:
          "Project pages should include the product type, room, city when accurate, installation details, alt text, and links back to the relevant service page."
      }
    ]
  }
];

const recentProjectPages: SitePage[] = [
  ["arched-plantation-shutters-ventura-county", "Custom Arched Plantation Shutters in Ventura County"],
  ["dark-wood-plantation-shutters-ventura-county", "Dark Wood Plantation Shutters in Ventura County"],
  ["layered-window-shades-ventura-county", "Layered Window Shades in Ventura County"],
  ["plantation-shutters-ventura-county-project", "Plantation Shutters Installed in a Ventura County Home"],
  ["roller-shades-large-window-ventura-county", "Roller Shades for Large Windows in Ventura County"],
  ["sliding-door-shutters-ventura-county", "Sliding Door Shutters in Ventura County"]
].map(([slug, title]) => ({
  path: `/recent-projects/${slug}/`,
  title: `${title} | 805 Shutters`,
  description: `${title} by 805 Shutters, Shades & Blinds in Ventura County.`,
  h1: title,
  eyebrow: "Recent project",
  intro:
    "This project page is reserved for install photos, room details, product notes, and links to the matching service page during the rebuild.",
  image: images.project,
  imageAlt: `${title} by 805 Shutters`,
  sections: [
    {
      heading: "Migration Note",
      body:
        "Before launch, replace this starter copy with the actual project image set, city, product, installation notes, and internal links."
    }
  ]
}));

const generatedCityPages: SitePage[] = cityPages.flatMap(([shutterSlug, caSlug, city]) => {
  const windowTreatmentPath = `/window-treatments/${caSlug}/`;
  return [
    cityProductPage({
      path: `/shutters/${shutterSlug}/`,
      city,
      product: "shutters",
      title: `Shutters in ${city} | 805 Shutters`,
      h1: `Custom Shutters in ${city}`,
      image: images.shutters
    }),
    cityProductPage({
      path: `/shades/${caSlug}/`,
      city,
      product: "shades",
      title: `Custom Shades in ${city} CA | 805 Shutters`,
      h1: `Custom Window Shades in ${city}`,
      image: images.shades
    }),
    cityProductPage({
      path: `/blinds/${caSlug}/`,
      city,
      product: "blinds",
      title: `Custom Blinds in ${city} CA | 805 Shutters`,
      h1: `Custom Blinds in ${city}`,
      image: images.blinds
    }),
    cityProductPage({
      path: `/window-coverings/${caSlug}/`,
      city,
      product: "window-coverings",
      title: `Window Coverings in ${city} CA | 805 Shutters`,
      h1: `Window Coverings in ${city}`,
      image: images.hero
    }),
    cityProductPage({
      path: windowTreatmentPath,
      city,
      product: "window-treatments",
      title: `Window Treatments in ${city} CA | 805 Shutters`,
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
  return {
    path,
    title,
    description: `${h1} measured and installed by 805 Shutters. Free consultation for ${city} homes and businesses.`,
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
      }
    ],
    cta: "Schedule a free in-home consultation"
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

export const homePage: SitePage = {
  path: "/",
  title: "Custom Shutters, Shades & Blinds Ventura County | 805 Shutters",
  description:
    "805 Shutters installs custom shutters, shades, blinds, and commercial window coverings across Ventura County. Free in-home consultation. Call 805-806-9344.",
  h1: "Custom Shutters, Shades & Blinds in Ventura County",
  eyebrow: "Family-owned since 1995",
  intro:
    "805 Shutters, Shades & Blinds helps Ventura County homeowners and businesses choose custom window treatments that fit their rooms, light, privacy, and budget.",
  image: images.hero,
  imageAlt: "Custom white shutters installed in a Ventura County living room",
  sections: [
    {
      heading: "Local Window Treatment Installation",
      body:
        "Our local team measures, recommends, and installs plantation shutters, roller shades, honeycomb shades, wood and faux wood blinds, vertical blinds, and commercial window coverings across Ventura County."
    },
    {
      heading: "Popular Service Areas",
      body:
        "805 Shutters serves Camarillo, Thousand Oaks, Ventura, Oxnard, Simi Valley, Moorpark, Ojai, and nearby communities.",
      bullets: site.areas
    }
  ],
  cta: "Schedule a free in-home consultation"
};

export const allPages = [
  homePage,
  ...parentPages,
  ...supportPages,
  ...generatedCityPages,
  ...specialtyPages,
  ...recentProjectPages
];

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
