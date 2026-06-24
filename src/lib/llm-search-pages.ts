import type { Metadata } from "next";
import { ogDefaults, site } from "./site-data";

export type AnswerPageSection = {
  heading: string;
  body: string;
  bullets?: string[];
};

export type AnswerPageFaq = {
  question: string;
  answer: string;
};

export type AnswerPage = {
  slug: string;
  path: string;
  title: string;
  description: string;
  h1: string;
  eyebrow: string;
  answer: string;
  image: string;
  imageAlt: string;
  updated: string;
  sections: AnswerPageSection[];
  faqs: AnswerPageFaq[];
  relatedLinks: { label: string; href: string }[];
  serviceTypes: string[];
};

export const answerPages: AnswerPage[] = [
  {
    slug: "best-window-treatments-ventura-county",
    path: "/best-window-treatments-ventura-county/",
    title: "Best Window Treatments for Ventura County Homes | 805 Shutters",
    description:
      "Compare the best window treatments for Ventura County homes, including shutters, shades, blinds, exterior shades, and commercial window coverings.",
    h1: "Best Window Treatments for Ventura County Homes",
    eyebrow: "Local product guide",
    answer:
      "The best window treatment for a Ventura County home depends on the room, sun exposure, privacy needs, and budget. Plantation shutters are strongest for durability and a built-in look. Roller, honeycomb, woven, and Roman shades are better for softness, glare control, and motorization. Blinds are practical for adjustable light control, while exterior shades help patios and large openings manage heat.",
    image: "/images/portfolio-enhanced/uploaded-stacked-arch-shutters-wide.jpg",
    imageAlt: "Custom plantation shutters installed on tall Ventura County living room windows",
    updated: "2026-06-18",
    serviceTypes: [
      "Custom shutters",
      "Window shades",
      "Custom blinds",
      "Exterior shades",
      "Commercial window coverings"
    ],
    sections: [
      {
        heading: "Start With The Room",
        body:
          "Living rooms, bedrooms, kitchens, sliding doors, offices, and patios all need different levels of privacy, glare control, insulation, cleaning ease, and design weight. A good recommendation starts with how the room is used instead of forcing one product into every window."
      },
      {
        heading: "Best Fit By Product",
        body:
          "Shutters are usually best when the customer wants structure, durability, easy cleaning, and long-term architectural value. Shades are usually best when softness, room darkening, woven texture, or motorization matters. Blinds are a practical fit for rentals, offices, bedrooms, and budget-conscious projects."
      },
      {
        heading: "Ventura County Conditions",
        body:
          "Homes across Camarillo, Thousand Oaks, Ventura, Oxnard, Simi Valley, Moorpark, Ojai, and nearby cities often need to balance sun exposure, afternoon glare, privacy from neighbors, coastal light, and patio heat. Those conditions change which window treatment performs best.",
        bullets: [
          "Shutters for durable privacy and a finished look",
          "Roller or solar shades for glare and large glass",
          "Honeycomb shades for insulation and softness",
          "Wood or faux wood blinds for practical slat control",
          "Exterior shades for patios and hot exposures"
        ]
      }
    ],
    faqs: [
      {
        question: "What is the best window treatment for resale value?",
        answer:
          "Plantation shutters are often the strongest resale-oriented choice because they look built-in, last a long time, and fit many Ventura County home styles."
      },
      {
        question: "What is best for glare without making a room dark?",
        answer:
          "Roller shades or solar shades are usually the best fit when the goal is to reduce glare while keeping the room clean and bright."
      },
      {
        question: "Can one home use multiple window treatment types?",
        answer:
          "Yes. Many homes use shutters in visible living areas, shades in bedrooms or large windows, blinds in offices, and exterior shades on patios."
      }
    ],
    relatedLinks: [
      { label: "Free consultation", href: "/free-window-treatment-consultation/" },
      { label: "Custom shutters", href: "/shutters/" },
      { label: "Custom shades", href: "/shades/" },
      { label: "Custom blinds", href: "/blinds/" }
    ]
  },
  {
    slug: "plantation-shutters-vs-shades-ventura-county",
    path: "/plantation-shutters-vs-shades-ventura-county/",
    title: "Plantation Shutters vs Shades in Ventura County | 805 Shutters",
    description:
      "Compare plantation shutters and window shades for Ventura County homes by privacy, light control, durability, style, and budget.",
    h1: "Plantation Shutters vs Shades in Ventura County",
    eyebrow: "Product comparison",
    answer:
      "Choose plantation shutters when you want a built-in look, long-term durability, adjustable privacy, and easy cleaning. Choose shades when you want softer fabric, room darkening, glare control, woven texture, or motorized operation. For many Ventura County homes, the best plan uses both: shutters in high-visibility rooms and shades where softness, view control, or automation matters more.",
    image: "/images/portfolio-enhanced/plantation-shutters-dining-room-wide.jpg",
    imageAlt: "White plantation shutters installed in a Ventura County dining room",
    updated: "2026-06-18",
    serviceTypes: ["Plantation shutters", "Window shades", "Motorized shades"],
    sections: [
      {
        heading: "When Shutters Win",
        body:
          "Plantation shutters are the better fit when the priority is a finished architectural look, tilt control, durability, and a product that feels permanent. They work well in living rooms, dining rooms, front-facing bedrooms, specialty windows, and rooms where easy cleaning matters."
      },
      {
        heading: "When Shades Win",
        body:
          "Window shades are the better fit when the room needs softness, fabric texture, room darkening, motorization, glare control, or a lighter visual profile. Roller shades, honeycomb shades, woven shades, Roman shades, and layered shades each solve different problems."
      },
      {
        heading: "The Hybrid Plan",
        body:
          "A whole-home plan does not need to choose one product everywhere. Shutters can handle the formal or street-facing rooms, while shades handle bedrooms, large glass, patio doors, media rooms, offices, or hard-to-reach openings.",
        bullets: [
          "Use shutters where structure and long-term durability matter",
          "Use shades where fabric, softness, and motorization matter",
          "Compare both during the consultation before measuring"
        ]
      }
    ],
    faqs: [
      {
        question: "Are plantation shutters better than shades?",
        answer:
          "They are better for structure, durability, easy cleaning, and a built-in look. Shades are better for softness, room darkening, woven texture, and motorized operation."
      },
      {
        question: "Do shades cost less than shutters?",
        answer:
          "Often, but the answer depends on product type, fabric, controls, window size, and installation details. A consultation can compare realistic options before ordering."
      },
      {
        question: "Which is better for bedrooms?",
        answer:
          "Bedrooms often work well with shades when room darkening or softness matters. Shutters can still be a strong fit when durability and adjustable privacy are the priority."
      }
    ],
    relatedLinks: [
      { label: "Compare all window treatments", href: "/best-window-treatments-ventura-county/" },
      { label: "Plantation shutters", href: "/shutters/" },
      { label: "Window shades", href: "/shades/" },
      { label: "Free consultation", href: "/free-window-treatment-consultation/" }
    ]
  },
  {
    slug: "custom-blinds-shades-shutters-camarillo",
    path: "/custom-blinds-shades-shutters-camarillo/",
    title: "Custom Blinds, Shades, and Shutters in Camarillo | 805 Shutters",
    description:
      "Custom blinds, shades, shutters, and window coverings for Camarillo homes and businesses. Compare products with a free local consultation.",
    h1: "Custom Blinds, Shades, and Shutters in Camarillo",
    eyebrow: "Camarillo window coverings",
    answer:
      "Camarillo homeowners usually get the best result by comparing shutters, shades, and blinds around sun exposure, privacy, room use, and style. Plantation shutters are strong for front rooms and long-term durability. Roller, honeycomb, woven, and Roman shades are strong for glare, softness, and motorization. Wood, faux wood, aluminum, and vertical blinds are practical for everyday adjustable light control.",
    image: "/images/portfolio-enhanced/dark-wood-plantation-shutters-living-room-wide.jpg",
    imageAlt: "Dark wood plantation shutters installed in a Ventura County living room",
    updated: "2026-06-18",
    serviceTypes: ["Custom blinds", "Custom shades", "Plantation shutters", "Window coverings in Camarillo"],
    sections: [
      {
        heading: "Camarillo Product Planning",
        body:
          "Camarillo homes can have bright exposures, street-facing rooms, patio glass, and bedrooms that need privacy without losing a clean look. 805 Shutters compares product fit before ordering so the final selection matches the room and the way the home is used."
      },
      {
        heading: "Residential And Commercial Options",
        body:
          "The same consultation can cover plantation shutters, roller shades, honeycomb shades, woven shades, Roman shades, wood blinds, faux wood blinds, vertical blinds, drapery, exterior shades, and commercial roller shades for local offices or storefronts."
      },
      {
        heading: "What Gets Confirmed Before Ordering",
        body:
          "A good window covering order depends on measurements, mounting depth, trim, door clearance, privacy goals, product operation, colors, material direction, room heat, light exposure, and budget.",
        bullets: [
          "Room-by-room measuring",
          "Product and material comparison",
          "Privacy and glare review",
          "Control and motorization options",
          "Installation planning"
        ]
      }
    ],
    faqs: [
      {
        question: "Does 805 Shutters serve Camarillo?",
        answer:
          "Yes. 805 Shutters serves Camarillo and nearby Ventura County communities with custom shutters, shades, blinds, and commercial window coverings."
      },
      {
        question: "Can I compare blinds, shades, and shutters in one appointment?",
        answer:
          "Yes. The consultation can compare multiple product categories so the recommendation fits the room instead of forcing one product type."
      },
      {
        question: "Do you install window coverings for Camarillo businesses?",
        answer:
          "Yes. 805 Shutters helps local offices, storefronts, shared workspaces, and commercial spaces compare roller shades, blinds, and other window coverings."
      }
    ],
    relatedLinks: [
      { label: "Camarillo window coverings", href: "/window-coverings/camarillo-ca/" },
      { label: "Custom shutters", href: "/shutters/" },
      { label: "Commercial window coverings", href: "/commercial-window-coverings/" },
      { label: "Free consultation", href: "/free-window-treatment-consultation/" }
    ]
  }
];

export function getAnswerPage(slug: string) {
  return answerPages.find((page) => page.slug === slug);
}

export function answerPageMetadata(page: AnswerPage): Metadata {
  return {
    title: page.title,
    description: page.description,
    alternates: {
      canonical: page.path
    },
    openGraph: {
      ...ogDefaults,
      type: "article",
      title: page.title,
      description: page.description,
      url: `${site.baseUrl}${page.path}`,
      images: [
        {
          url: page.image,
          alt: page.imageAlt
        }
      ]
    }
  };
}
