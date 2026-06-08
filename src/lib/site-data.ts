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
  gallery?: {
    image: string;
    imageAlt: string;
  }[];
  sections: PageSection[];
  cta?: string;
  form?: boolean;
  noIndex?: boolean;
};

export const site = {
  name: "805 Shutters",
  shortName: "805 Shutters",
  phone: "805-806-9344",
  phoneHref: "tel:8058069344",
  email: "805@805shutters.com",
  emailHref: "mailto:805@805shutters.com",
  social: {
    facebook: "https://www.facebook.com/805shutters",
    instagram: "https://www.instagram.com/805shutters/"
  },
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
  hero: "/images/805-hero-window-treatments.png",
  shutters:
    "/images/portfolio-enhanced/uploaded-stacked-arch-shutters-wide.jpg",
  shades: "/images/805-portfolio-shades-bedroom.jpg",
  blinds: "/images/805-portfolio-blinds-office.jpg",
  drapery: "/images/805-portfolio-drapery-living-room.jpg",
  exteriorShades: "/images/editorial-scroll/ocean-terrace-exterior-shades.jpg",
  project:
    "https://i0.wp.com/www.805shutters.com/wp-content/uploads/2024/04/window-coverings-ventura-california-windows-covering-store-installation-1.jpg?w=900&ssl=1"
};

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
    title: "Custom Drapery",
    shortTitle: "Drapery",
    slug: "drapery",
    description:
      "Soft drapery and fabric window treatment planning for rooms that need warmth, privacy, light control, and a finished designer look.",
    image: images.drapery,
    imageAlt: "Soft fabric window treatments in a Ventura County living room"
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
    imageAlt: "Stacked arched and rectangular shutters installed on tall living room windows",
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
    path: "/drapery/",
    title: "Custom Drapery Ventura County | 805 Shutters",
    description:
      "Custom drapery and fabric window treatment planning for Ventura County homes. Compare soft treatments, privacy, light control, and room style.",
    h1: "Custom Drapery in Ventura County",
    eyebrow: "Soft window treatments",
    intro:
      "805 Shutters helps Ventura County customers plan custom drapery and fabric window treatments that soften rooms, add privacy, and complete the design around shutters, shades, or blinds.",
    image: images.drapery,
    imageAlt: "Custom drapery and shades in a Ventura County living room",
    sections: [
      {
        heading: "Layered Window Treatment Design",
        body:
          "Drapery can add warmth, texture, room-darkening support, privacy, and a finished look alongside shutters, shades, or blinds."
      },
      {
        heading: "Local Planning",
        body:
          "The consultation covers room goals, fabric direction, privacy, light control, hardware, measurements, and how drapery fits with the rest of the home."
      }
    ]
  },
  {
    path: "/exterior-shades/",
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
          "Exterior shades can help manage heat, glare, privacy, and sun exposure around patios, sliding doors, outdoor rooms, and large window openings."
      },
      {
        heading: "Measured For The Opening",
        body:
          "The consultation covers the opening, mounting conditions, exposure, fabric direction, operation preferences, and how the shade should perform throughout the day."
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
      "Recent project pages help customers see what shutters and shades look like in real Ventura County spaces.",
    image: "/images/portfolio-enhanced/plantation-shutters-dining-room-wide.jpg",
    imageAlt: "White plantation shutters installed in a Ventura County dining room",
    gallery: [
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
  "805 Shutters, Shades & Blinds serves Camarillo, Thousand Oaks, Ventura, Oxnard, Simi Valley, Moorpark, Ojai, Santa Rosa Valley, Port Hueneme, Santa Paula, Fillmore, Oak Park, and nearby Ventura County communities.";

const projectCompanyProof =
  "805 Shutters, Shades & Blinds is a family-owned local business with over 30 years of experience measuring and installing custom shutters, shades, blinds, commercial roller shades, and window coverings across Ventura County and nearby communities.";

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
    imageAlt: "Custom shutters for a Ventura County bedroom sliding door installed by 805 Shutters Shades and Blinds.",
    gallery: [
      {
        image: "/images/portfolio-enhanced/bedroom-sliding-door-shutters-card.jpg",
        imageAlt: "Custom shutters for a Ventura County bedroom sliding door installed by 805 Shutters Shades and Blinds."
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
          "805 Shutters, Shades & Blinds installs custom shutters and window coverings for sliding doors throughout Ventura County."
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
    imageAlt: "Roller shade covering a large Ventura County window installed by 805 Shutters Shades and Blinds.",
    gallery: [
      {
        image: "/images/portfolio-enhanced/roller-shade-large-window-card.jpg",
        imageAlt: "Roller shade covering a large Ventura County window installed by 805 Shutters Shades and Blinds."
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
          "Yes. 805 Shutters, Shades & Blinds installs roller shades for homes and businesses throughout Ventura County."
      },
      {
        heading: "Do you install commercial roller shades?",
        body:
          "Yes. 805 Shutters, Shades & Blinds also installs commercial roller shades and commercial window coverings."
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
    imageAlt: "Layered window shades on a Ventura County bedroom window installed by 805 Shutters Shades and Blinds.",
    gallery: [
      {
        image: "/images/portfolio-enhanced/layered-shades-bedroom-window-card.jpg",
        imageAlt: "Layered window shades on a Ventura County bedroom window installed by 805 Shutters Shades and Blinds."
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
          "Yes. 805 Shutters, Shades & Blinds installs custom shades throughout Ventura County and nearby communities."
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
    imageAlt: "Custom arched plantation shutters in a Ventura County living room installed by 805 Shutters Shades and Blinds.",
    gallery: [
      {
        image: "/images/portfolio-enhanced/arched-window-custom-shutters-card.jpg",
        imageAlt: "Custom arched plantation shutters in a Ventura County living room installed by 805 Shutters Shades and Blinds."
      },
      {
        image: "/images/portfolio-enhanced/specialty-arch-window-shutters-card.jpg",
        imageAlt: "Specialty arch window shutters with custom fit in Ventura County by 805 Shutters Shades and Blinds."
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
          "805 Shutters, Shades & Blinds installs custom shutters for arched and specialty windows throughout Ventura County and nearby communities."
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
    imageAlt: "Dark wood plantation shutters in a Ventura County reading room installed by 805 Shutters Shades and Blinds.",
    gallery: [
      {
        image: "/images/portfolio-enhanced/dark-wood-plantation-shutters-reading-room-card.jpg",
        imageAlt: "Dark wood plantation shutters in a Ventura County reading room installed by 805 Shutters Shades and Blinds."
      },
      {
        image: "/images/portfolio-enhanced/dark-wood-plantation-shutters-living-room-card.jpg",
        imageAlt: "Dark wood plantation shutters across living room windows in Ventura County by 805 Shutters Shades and Blinds."
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
          "Yes. 805 Shutters, Shades & Blinds installs custom plantation shutters for Ventura County homes, including dark wood looks and other finish options."
      },
      {
        heading: "Why choose dark wood shutters?",
        body:
          "Dark wood shutters can add contrast, warmth, privacy, and stronger visual definition around the window opening."
      },
      {
        heading: "Do you offer free in-home consultations?",
        body:
          "Yes. 805 Shutters, Shades & Blinds offers free in-home consultations for shutters, shades, blinds, and window coverings."
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
      "This local project shows white plantation shutters installed for a Ventura County home by 805 Shutters, Shades & Blinds. The goal was a clean, finished look with better privacy, flexible light control, and a custom fit for multiple window shapes.",
    image: "/images/portfolio-enhanced/plantation-shutters-dining-room-wide.jpg",
    imageAlt: "White plantation shutters in a Ventura County dining room installed by 805 Shutters Shades and Blinds.",
    gallery: [
      {
        image: "/images/portfolio-enhanced/plantation-shutters-dining-room-card.jpg",
        imageAlt: "White plantation shutters in a Ventura County dining room installed by 805 Shutters Shades and Blinds."
      },
      {
        image: "/images/portfolio-enhanced/arched-plantation-shutters-living-room-card.jpg",
        imageAlt: "Custom arched plantation shutters in a Ventura County living room installed by 805 Shutters Shades and Blinds."
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
          "Homes throughout Ventura County often have a mix of standard rectangular windows and specialty shapes. 805 Shutters, Shades & Blinds measures each opening carefully so the finished shutters fit the architecture instead of looking like an afterthought."
      },
      {
        heading: "Local experience",
        body: projectCompanyProof
      },
      {
        heading: "Who installs plantation shutters in Ventura County?",
        body:
          "805 Shutters, Shades & Blinds installs custom plantation shutters for homeowners throughout Ventura County and nearby communities."
      },
      {
        heading: "Can plantation shutters be made for arched windows?",
        body:
          "Yes. Plantation shutters can be custom measured and fitted for specialty windows, including arched windows and other non-standard openings."
      },
      {
        heading: "Do you offer free in-home consultations?",
        body:
          "Yes. 805 Shutters, Shades & Blinds offers free in-home consultations for shutters, shades, blinds, commercial roller shades, and other window coverings."
      }
    ]
  }
];

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
      {
        heading: "Ventura County installation support",
        body: `805 Shutters serves ${city} and nearby Ventura County communities with measuring, product guidance, ordering, and professional installation. The goal is to help you understand cost, timing, materials, controls, and long-term maintenance before the project moves forward.`
      }
    ],
    cta: "Schedule a free in-home consultation"
  };
}

function searchDepthSections(page: SitePage): PageSection[] {
  if (page.noIndex || (page.path.startsWith("/recent-projects/") && page.path !== "/recent-projects/")) {
    return page.sections;
  }
  const existingHeadings = new Set(page.sections.map((section) => section.heading));
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
        "805 Shutters works throughout Ventura County, including Camarillo, Thousand Oaks, Ventura, Oxnard, Simi Valley, Moorpark, Ojai, Port Hueneme, Santa Paula, Santa Rosa Valley, Oak Park, Fillmore, and nearby communities."
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
        "Our local team measures, recommends, and installs plantation shutters, roller shades, honeycomb shades, wood and faux wood blinds, drapery, vertical blinds, and commercial window coverings across Ventura County."
    },
    {
      heading: "Popular Service Areas",
      body:
        "805 Shutters serves Camarillo, Thousand Oaks, Ventura, Oxnard, Simi Valley, Moorpark, Ojai, and nearby communities.",
      bullets: site.areas
    }
  ],
  cta: "Schedule a free in-home consultation"
});

export const allPages = [
  homePage,
  ...parentPages,
  ...supportPages,
  ...generatedCityPages,
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
