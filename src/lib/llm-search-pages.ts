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
          "Homes across Camarillo, Thousand Oaks, Ventura, Oxnard, Simi Valley, Moorpark, Newbury Park, Westlake Village, Ojai, and nearby cities often need to balance sun exposure, afternoon glare, privacy from neighbors, coastal light, and patio heat. Those conditions change which window treatment performs best.",
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
      { label: "Custom blinds", href: "/blinds/" },
      { label: "Coastal window treatments", href: "/coastal-window-treatments-ventura-county/" },
      { label: "Installation timeline", href: "/window-treatment-installation-timeline-ventura-county/" },
      { label: "Cost guide", href: "/window-treatment-cost-guide-ventura-county/" }
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
  },
  {
    slug: "commercial-roller-shades-ventura-county",
    path: "/commercial-roller-shades-ventura-county/",
    title: "Commercial Roller Shades in Ventura County | 805 Shutters",
    description:
      "Who installs commercial roller shades in Ventura County? Compare shade options for offices, storefronts, schools, medical spaces, and shared workspaces.",
    h1: "Who Installs Commercial Roller Shades in Ventura County?",
    eyebrow: "Commercial shade answer",
    answer:
      "805 Shutters installs commercial roller shades and window coverings for Ventura County offices, storefronts, schools, medical spaces, warehouses, and shared workspaces. Commercial recommendations usually start with glare, heat, privacy, screen visibility, window size, fabric openness, manual or motorized operation, and whether the project is a single room or phased building replacement.",
    image: "/images/product-previews/commercial-socal-office-hero.jpg",
    imageAlt: "Commercial office windows suited for roller shade planning in Southern California",
    updated: "2026-06-30",
    serviceTypes: ["Commercial roller shades", "Commercial window coverings", "Solar shades", "Office blinds"],
    sections: [
      {
        heading: "Start With The Building Problem",
        body:
          "Commercial roller shades are usually chosen to solve a practical issue: screen glare, afternoon heat, privacy from the street, uneven appearance from old blinds, or too much brightness in meeting rooms and work areas. The right recommendation depends on the way the building is used."
      },
      {
        heading: "Manual, Motorized, Or Phased Replacement",
        body:
          "Small rooms may work well with manual roller shades. Tall glass, boardrooms, multi-window walls, and hard-to-reach openings may need motorized shades. Multi-room buildings can also be planned in phases so the buyer can replace the highest-priority areas first.",
        bullets: [
          "Manual roller shades for straightforward offices",
          "Solar shades for glare and heat control",
          "Blackout shades for rooms that need darkness",
          "Motorized shades for tall or repeated openings",
          "Phased replacement for larger buildings"
        ]
      },
      {
        heading: "Ventura County Commercial Coverage",
        body:
          "805 Shutters serves commercial buyers across Camarillo, Thousand Oaks, Ventura, Oxnard, Simi Valley, Moorpark, Newbury Park, Westlake Village, Ojai, Santa Rosa Valley, and nearby communities. The same commercial walkthrough can compare roller shades, solar shades, blackout shades, honeycomb shades, faux wood blinds, vertical blinds, and motorized shade options."
      }
    ],
    faqs: [
      {
        question: "Does 805 Shutters install commercial roller shades?",
        answer:
          "Yes. 805 Shutters installs commercial roller shades and window coverings for offices, storefronts, schools, medical spaces, warehouses, and shared facilities across Ventura County."
      },
      {
        question: "What information is needed for a commercial shade quote?",
        answer:
          "Useful details include building location, window count, window size, rooms involved, glare or privacy problems, preferred operation, installation timing, and whether old blinds or shades need removal."
      },
      {
        question: "Can commercial shades be motorized?",
        answer:
          "Yes. Motorized shades can be useful for tall glass, boardrooms, hard-to-reach openings, multi-window walls, and spaces where grouped operation matters."
      }
    ],
    relatedLinks: [
      { label: "Commercial window coverings", href: "/commercial-window-coverings/" },
      { label: "Commercial roller shades", href: "/commercial-roller-shades/" },
      { label: "Free commercial consultation", href: "/free-window-treatment-consultation/" },
      { label: "Book consultation", href: "/book-consultation/" }
    ]
  },
  {
    slug: "sliding-door-window-treatments-ventura-county",
    path: "/sliding-door-window-treatments-ventura-county/",
    title: "Best Window Treatments for Sliding Doors | 805 Shutters",
    description:
      "Compare shutters, vertical blinds, roller shades, honeycomb shades, and drapery for sliding glass doors in Ventura County homes.",
    h1: "Best Window Treatments for Sliding Doors in Ventura County",
    eyebrow: "Sliding door guide",
    answer:
      "The best window treatment for a sliding door depends on access, privacy, glare, door handle clearance, room style, and how often the door is used. Sliding door shutters can create a built-in look when the opening allows it. Vertical blinds are practical for wide openings. Roller, solar, honeycomb, or panel-style shades can work well when the goal is softness, glare control, or a cleaner modern profile.",
    image: "/images/portfolio-enhanced/bedroom-sliding-door-shutters-wide.jpg",
    imageAlt: "Custom shutters installed on a Ventura County bedroom sliding door",
    updated: "2026-06-30",
    serviceTypes: ["Sliding door shutters", "Vertical blinds", "Window shades", "Custom window coverings"],
    sections: [
      {
        heading: "Access Comes First",
        body:
          "A sliding door treatment has to look good and stay easy to use. The consultation checks traffic flow, handle clearance, stack space, wall space, mounting depth, privacy, and whether the customer needs the treatment to move completely away from the opening."
      },
      {
        heading: "Common Sliding Door Options",
        body:
          "Bypass shutters can work when the customer wants a structured built-in look. Vertical blinds remain practical for wide openings. Roller or solar shades can simplify large glass, while honeycomb and fabric options can add softness or insulation.",
        bullets: [
          "Bypass shutters for a finished architectural look",
          "Vertical blinds for practical daily access",
          "Roller or solar shades for clean glare control",
          "Honeycomb shades for softness and insulation",
          "Drapery when fabric and warmth are the priority"
        ]
      },
      {
        heading: "Local Conditions Matter",
        body:
          "Ventura County sliding doors often face patios, bright exposures, bedrooms, family rooms, and backyard glass. Sun angle, privacy from neighbors, pets, kids, and cleaning expectations can change the recommendation."
      }
    ],
    faqs: [
      {
        question: "Can shutters be installed on sliding glass doors?",
        answer:
          "Yes, many sliding door openings can use custom shutter solutions, but the consultation needs to confirm opening size, clearance, traffic flow, and daily access needs first."
      },
      {
        question: "Are vertical blinds still a good choice for sliding doors?",
        answer:
          "Vertical blinds can still be a practical choice for wide sliding doors, rentals, offices, and rooms where easy access and adjustable privacy matter most."
      },
      {
        question: "What is best for glare on a patio door?",
        answer:
          "Roller shades, solar shades, and some honeycomb or fabric options can work well for glare, depending on how much view-through, privacy, and room darkening the customer wants."
      }
    ],
    relatedLinks: [
      { label: "Sliding door shutter project", href: "/recent-projects/sliding-door-shutters-ventura-county/" },
      { label: "Custom shutters", href: "/shutters/" },
      { label: "Custom blinds", href: "/blinds/" },
      { label: "Free consultation", href: "/free-window-treatment-consultation/" }
    ]
  },
  {
    slug: "motorized-window-shades-ventura-county",
    path: "/motorized-window-shades-ventura-county/",
    title: "Motorized Window Shades in Ventura County | 805 Shutters",
    description:
      "When are motorized window shades worth it? Compare motorized roller, solar, honeycomb, and room-darkening shade options for Ventura County homes and businesses.",
    h1: "When Are Motorized Window Shades Worth It?",
    eyebrow: "Motorized shade answer",
    answer:
      "Motorized window shades are worth considering when windows are tall, repeated, hard to reach, used every day, or exposed to strong sun. They can help living rooms, patio-view windows, offices, boardrooms, bedrooms, and commercial spaces control glare, privacy, heat, and room darkening without adjusting each shade by hand.",
    image: "/images/video-posters/motorized-roller-shades-living-room-view.jpg",
    imageAlt: "Motorized roller shades installed across living room patio-view windows",
    updated: "2026-06-30",
    serviceTypes: ["Motorized shades", "Roller shades", "Solar shades", "Room-darkening shades"],
    sections: [
      {
        heading: "Where Motorization Helps Most",
        body:
          "Motorization is most useful on tall windows, repeated window banks, hard-to-reach openings, rooms with strong sun exposure, and commercial spaces where consistent shade position matters. It can also help customers who want a cleaner look without visible cords."
      },
      {
        heading: "Products That Can Be Motorized",
        body:
          "Motorized options can include roller shades, solar shades, room-darkening shades, honeycomb shades, and other shade systems depending on the opening, fabric, power option, and control preference.",
        bullets: [
          "Roller shades for clean lines",
          "Solar shades for glare and view control",
          "Room-darkening shades for bedrooms and media rooms",
          "Honeycomb shades for softness and insulation",
          "Grouped controls for repeated openings"
        ]
      },
      {
        heading: "What To Confirm Before Ordering",
        body:
          "The consultation should confirm window size, mounting surface, battery or hardwired power, control grouping, remote or app expectations, fabric opacity, color, and how the shades should behave at different times of day."
      }
    ],
    faqs: [
      {
        question: "Do motorized shades need wiring?",
        answer:
          "Not always. Some motorized shades can use battery power, while other installations may use hardwired power depending on the product, window access, and project goals."
      },
      {
        question: "Can multiple motorized shades move together?",
        answer:
          "Yes. Many motorized shade plans can group several shades so a wall of windows or a room moves together."
      },
      {
        question: "Are motorized shades only for homes?",
        answer:
          "No. Motorized shades can also be useful in offices, boardrooms, storefronts, medical spaces, and other commercial rooms with tall glass or repeated windows."
      }
    ],
    relatedLinks: [
      { label: "Custom shades", href: "/shades/" },
      { label: "Commercial roller shades", href: "/commercial-roller-shades/" },
      { label: "Best window treatments", href: "/best-window-treatments-ventura-county/" },
      { label: "Book consultation", href: "/book-consultation/" }
    ]
  },
  {
    slug: "coastal-window-treatments-ventura-county",
    path: "/coastal-window-treatments-ventura-county/",
    title: "Best Window Treatments for Coastal Homes in Ventura County | 805 Shutters",
    description:
      "Compare window treatments for coastal homes in Ventura, Oxnard, and Port Hueneme. Which shutters, shades, and blinds hold up to salt air, moisture, and strong sun.",
    h1: "Best Window Treatments for Coastal Ventura County Homes",
    eyebrow: "Coastal product guide",
    answer:
      "Coastal homes in Ventura, Oxnard, and Port Hueneme need window treatments that resist salt air, moisture, and strong afternoon sun. Composite and faux wood shutters or blinds are usually better than natural wood near the beach because they resist warping and swelling. Solar shades cut glare and UV fading while keeping the ocean view, and exterior shades protect patios from sea breeze and heat. Natural wood remains a good fit a few miles inland.",
    image: "/images/editorial-scroll/coastal-living-roller-shades.jpg",
    imageAlt: "Roller shades filtering bright coastal light in a Ventura County living room",
    updated: "2026-07-02",
    serviceTypes: [
      "Custom shutters",
      "Window shades",
      "Custom blinds",
      "Exterior shades"
    ],
    sections: [
      {
        heading: "What Salt Air And Moisture Do To Window Treatments",
        body:
          "Homes near the water in Ventura, Oxnard Shores, Hollywood Beach, Silver Strand, and Port Hueneme deal with salt in the air, morning marine layer moisture, and hardware corrosion over time. Natural wood can swell, warp, or crack faster in that environment, and cheap metal components can pit or stick. Material choice matters more at the coast than anywhere else in the county."
      },
      {
        heading: "Products That Hold Up At The Coast",
        body:
          "Composite and faux wood shutters give the plantation shutter look with much better moisture resistance. Faux wood blinds handle bathrooms and kitchens near the water. Roller and solar shade fabrics resist humidity, and quality hardware avoids the corrosion problems that stop older blinds from operating smoothly.",
        bullets: [
          "Composite or faux wood shutters instead of natural wood at the beach",
          "Solar shades that cut glare and UV fading while keeping the view",
          "Faux wood blinds for coastal bathrooms and kitchens",
          "Exterior shades rated for wind on patios and balconies",
          "Room-darkening shades for bedrooms with bright morning light"
        ]
      },
      {
        heading: "Protecting Views And Furniture",
        body:
          "Most coastal buyers want to keep the view while stopping glare and fade. Solar shades are measured by openness factor: a lower openness blocks more glare, a higher openness keeps the view sharper. UV exposure through large west-facing glass also fades floors and furniture, which is why many coastal living rooms pair a solar shade for daytime with drapery or a second shade for evening privacy."
      },
      {
        heading: "Where Natural Wood Still Makes Sense",
        body:
          "A few miles inland — Camarillo, Thousand Oaks, Westlake Village, Moorpark, Simi Valley — the marine influence drops off and natural wood shutters and blinds perform well. The free consultation looks at the home's actual exposure before recommending material, rather than applying one rule to the whole county."
      }
    ],
    faqs: [
      {
        question: "Do plantation shutters work in beach homes?",
        answer:
          "Yes, but composite or faux wood shutters are usually the better choice within a mile or two of the water because they resist the swelling and warping that salt air and moisture cause in natural wood."
      },
      {
        question: "What window treatment protects furniture from fading near the coast?",
        answer:
          "Solar shades block most UV while keeping the view, which makes them the usual first choice for large west-facing coastal windows. Room-darkening shades or layered drapery add further protection where full coverage matters."
      },
      {
        question: "Can I keep my ocean view and still cut glare?",
        answer:
          "Yes. Solar shades come in different openness levels, so you can choose how much view to keep versus how much glare to block. A consultation can compare openness samples against your actual window and light."
      }
    ],
    relatedLinks: [
      { label: "Best window treatments", href: "/best-window-treatments-ventura-county/" },
      { label: "Custom shutters", href: "/shutters/" },
      { label: "Window treatments in Ventura", href: "/window-treatments/ventura-ca/" },
      { label: "Window treatments in Oxnard", href: "/window-treatments/oxnard-ca/" },
      { label: "Free consultation", href: "/free-window-treatment-consultation/" }
    ]
  },
  {
    slug: "window-treatment-installation-timeline-ventura-county",
    path: "/window-treatment-installation-timeline-ventura-county/",
    title: "How Long Does Window Treatment Installation Take? | 805 Shutters",
    description:
      "How long custom shutters, shades, and blinds take in Ventura County from free consultation through manufacturing to installation day, and what affects the timeline.",
    h1: "How Long Does Window Treatment Installation Take in Ventura County?",
    eyebrow: "Process and timeline",
    answer:
      "Most custom window treatment projects in Ventura County take a few weeks from consultation to installed product. The free in-home consultation and measuring visit takes about an hour. Custom shutters, shades, and blinds are then manufactured to the exact window measurements, which typically takes several weeks depending on the product and material. Installation day itself is usually quick: most homes are completed in a few hours, and larger whole-home projects within a day.",
    image: "/images/portfolio-enhanced/bay-window-plantation-shutters-front-card.jpg",
    imageAlt: "Finished plantation shutter installation on a Ventura County bay window",
    updated: "2026-07-02",
    serviceTypes: [
      "Custom shutters",
      "Window shades",
      "Custom blinds",
      "Drapery",
      "Commercial window coverings"
    ],
    sections: [
      {
        heading: "Step 1: Free In-Home Consultation And Measuring",
        body:
          "The project starts with a free consultation at the home or business. The visit covers how each room is used, product and material comparisons with real samples, precise window measurements, and pricing. Most consultations take about an hour, and the measurements taken during this visit are the ones the order is built from."
      },
      {
        heading: "Step 2: Custom Manufacturing",
        body:
          "Every product is made to order for the exact window, so manufacturing is the longest part of the timeline. Lead times vary by product, material, and finish: simpler shades and blinds generally arrive faster, while custom-painted or specialty-shaped shutters take longer. The quote includes the expected timeline for the specific products ordered, and 805 Shutters tracks the order and schedules installation as soon as it arrives.",
        bullets: [
          "Shades and blinds are usually the faster products to arrive",
          "Custom shutters take longer because each panel is built to the window",
          "Specialty shapes, custom paint matches, and motorization can add time",
          "Commercial projects can be phased so busy areas are done first"
        ]
      },
      {
        heading: "Step 3: Installation Day",
        body:
          "Installation is the fastest step. A typical room of shades or blinds is installed in well under an hour, most whole-home shutter projects are finished in a few hours, and even large installations rarely need more than a day. The installer mounts, levels, and adjusts every unit, walks through operation and care, and hauls away packaging."
      },
      {
        heading: "What Can Change The Timeline",
        body:
          "The main variables are product type, material and finish choices, motorization, specialty window shapes, and seasonal manufacturer volume. Repairs or replacements of existing treatments can sometimes move faster. If a project has a hard deadline — a move-in date, a rental turnover, or a commercial opening — mention it during the consultation so product choices can match the date."
      }
    ],
    faqs: [
      {
        question: "How long does the in-home consultation take?",
        answer:
          "About an hour for most homes. The visit includes product samples, measurements, and pricing, and there is no charge or obligation."
      },
      {
        question: "Why do custom window treatments take weeks to arrive?",
        answer:
          "Because each shutter panel, shade, and blind is manufactured to the exact measurements of your windows rather than pulled from a warehouse shelf. That is also why they fit and operate better than ready-made products."
      },
      {
        question: "How long is installation day?",
        answer:
          "Most single rooms take under an hour, whole-home projects a few hours, and large or commercial installations up to a day. The installer adjusts every unit and shows you how to operate it before leaving."
      }
    ],
    relatedLinks: [
      { label: "Book consultation", href: "/book-consultation/" },
      { label: "Free consultation request", href: "/free-window-treatment-consultation/" },
      { label: "Window treatment comparison guide", href: "/window-treatment-comparison-guide/" },
      { label: "Custom shutters", href: "/shutters/" }
    ]
  },
  {
    slug: "window-treatment-cost-guide-ventura-county",
    path: "/window-treatment-cost-guide-ventura-county/",
    title: "How Much Do Custom Window Treatments Cost? | 805 Shutters",
    description:
      "What drives the cost of custom shutters, shades, and blinds in Ventura County: product type, materials, window size, and options. How to get an exact price free.",
    h1: "How Much Do Custom Window Treatments Cost in Ventura County?",
    eyebrow: "Cost guide",
    answer:
      "The cost of custom window treatments depends on the product type, the material and finish, the size and number of windows, and options like motorization or specialty shapes. As a general rule, blinds are the most budget-friendly product, shades span a wide range depending on fabric and lift system, and plantation shutters are the largest upfront investment but last the longest and add the most permanent value. Because every product is made to order for measured windows, exact pricing comes from a free in-home consultation — 805 Shutters is a competitively priced local company, and the quote includes measuring, the product, and professional installation.",
    image: "/images/portfolio-enhanced/two-story-shutter-installation-detail-card.jpg",
    imageAlt: "Custom plantation shutters installed on tall Ventura County windows",
    updated: "2026-07-02",
    serviceTypes: [
      "Custom shutters",
      "Window shades",
      "Custom blinds",
      "Drapery",
      "Exterior shades",
      "Commercial window coverings"
    ],
    sections: [
      {
        heading: "What Actually Drives The Price",
        body:
          "Two homes asking for the same product can get very different quotes, because the price is built from the windows themselves. The main factors are the product type, the material, the total number of windows, and how large or unusual each opening is.",
        bullets: [
          "Product type: blinds, shades, drapery, shutters, and exterior shades each price differently",
          "Material and finish: faux wood and composite generally cost less than natural wood; specialty fabrics and custom paint matches cost more",
          "Window size and count: larger glass and more openings raise the total",
          "Specialty shapes: arches, angles, skylights, and extra-wide sliders take more material and labor",
          "Motorization: powered lift systems add cost per window but matter most on tall or hard-to-reach glass"
        ]
      },
      {
        heading: "Relative Cost By Product",
        body:
          "Without quoting a specific home, the products rank fairly consistently. Blinds are usually the most budget-friendly way to cover a window well. Shades cover the widest range: a simple roller shade is economical, while designer fabrics, room-darkening systems, and motorized banks of shades sit at the higher end. Drapery depends heavily on fabric and length. Plantation shutters are typically the largest upfront investment, and they also last the longest, look built-in, and are the product most often called out as adding resale value. Exterior shades price by size, motor, and wind rating."
      },
      {
        heading: "Why Custom Window Treatment Prices Are Not Listed Online",
        body:
          "Custom shutters, shades, and blinds are manufactured to the exact measurements of each window, so there is no shelf price that would be honest for every home. Published 'starting at' prices usually describe the smallest possible window in the most basic material, without measuring or installation. A written quote from an in-home visit is the real number: it reflects your actual windows, the material you chose, and professional installation, with no surprise added at the end."
      },
      {
        heading: "How To Get An Exact Price — And Manage The Budget",
        body:
          "The free in-home consultation is how the exact price gets set: windows are measured, materials compared with real samples, and the quote is written on the spot with no obligation. If the total needs to fit a budget, there are honest ways to do it without giving up quality.",
        bullets: [
          "Mix products by room: shutters in the visible living areas, economical shades or blinds in bedrooms and utility rooms",
          "Phase the project: do the front-facing windows first and the rest later",
          "Choose faux wood or composite where the look is nearly identical to natural wood",
          "Motorize only the windows that are genuinely hard to reach"
        ]
      }
    ],
    faqs: [
      {
        question: "Why don't window treatment companies list prices online?",
        answer:
          "Because every custom shutter, shade, and blind is made to the measured size of each window, a published price list would be wrong for most homes. The accurate number is a written quote from an in-home measuring visit, which 805 Shutters provides free with no obligation."
      },
      {
        question: "Which window treatment is the most budget-friendly?",
        answer:
          "Blinds are usually the most economical way to cover a window well, followed by simple roller and honeycomb shades. Faux wood blinds in particular deliver a clean look at a practical price."
      },
      {
        question: "Are plantation shutters worth the higher cost?",
        answer:
          "For many Ventura County homes, yes. Shutters are the most durable product, they look built-in, they are easy to clean, and they are the window treatment most often credited with adding resale value. They cost more upfront and tend to be the last window treatment the home needs."
      },
      {
        question: "Does the quote include installation?",
        answer:
          "Yes. The written quote from the free consultation covers the measured product and professional installation, so the number you approve is the number you pay."
      }
    ],
    relatedLinks: [
      { label: "Free consultation", href: "/free-window-treatment-consultation/" },
      { label: "Book a consultation time", href: "/book-consultation/" },
      { label: "Window treatment comparison guide", href: "/window-treatment-comparison-guide/" },
      { label: "Best window treatments", href: "/best-window-treatments-ventura-county/" },
      { label: "Installation timeline", href: "/window-treatment-installation-timeline-ventura-county/" }
    ]
  },
  {
    slug: "custom-drapery-curtains-ventura-county",
    path: "/custom-drapery-curtains-ventura-county/",
    title: "Custom Drapery and Curtains Near Moorpark & Thousand Oaks | 805 Shutters",
    description:
      "Custom drapery and curtains for Ventura County homes, including Moorpark, Thousand Oaks, Camarillo, and Simi Valley. Compare drapery panels, curtain styles, sheers, blackout linings, and hardware with a free in-home consultation.",
    h1: "Custom Drapery and Curtains in Ventura County",
    eyebrow: "Soft window treatments",
    answer:
      "805 Shutters designs and installs custom drapery and curtains for homes across Ventura County, including Moorpark, Thousand Oaks, Camarillo, Simi Valley, Newbury Park, and Westlake Village. A free in-home consultation compares drapery panel styles, curtain fabrics, sheers, room-darkening and blackout linings, fullness, and hardware — on their own or layered over shutters, shades, or blinds — with measuring and professional installation included.",
    image: "/images/805-portfolio-drapery-living-room.jpg",
    imageAlt: "Custom drapery panels layered with shades in a Ventura County living room",
    updated: "2026-07-07",
    serviceTypes: ["Custom drapery", "Custom curtains", "Window shades", "Custom shutters"],
    sections: [
      {
        heading: "Drapery And Curtain Styles To Compare",
        body:
          "Custom drapery is built around the room, so the consultation starts by comparing panel styles and how the fabric should hang, stack, and frame the window.",
        bullets: [
          "Pleated drapery panels for a tailored, structured look",
          "Relaxed curtain panels for softer, more casual rooms",
          "Sheers for daytime light with privacy",
          "Room-darkening and blackout linings for bedrooms and media rooms",
          "Stationary side panels that add height and warmth around large windows and sliders"
        ]
      },
      {
        heading: "Drapery Alone Or Layered With Shutters And Shades",
        body:
          "Many Ventura County projects combine soft and hard treatments: drapery panels layered over roller or Roman shades for privacy plus softness, or stationary curtain panels framing plantation shutters to finish the room. Because 805 Shutters carries shutters, shades, blinds, and drapery, one consultation can plan the whole window instead of treating each product separately."
      },
      {
        heading: "Local In-Home Service",
        body:
          "805 Shutters is a family-owned Ventura County company. The free consultation brings fabric direction, hardware options, and measuring to your home in Moorpark, Thousand Oaks, Camarillo, Simi Valley, Oxnard, Ventura, Ojai, Newbury Park, Westlake Village, and nearby communities, and the written quote includes professional installation."
      }
    ],
    faqs: [
      {
        question: "Who makes custom drapery and curtains near Moorpark and Thousand Oaks?",
        answer:
          "805 Shutters plans, measures, and installs custom drapery and curtains for homes in Moorpark, Thousand Oaks, and across Ventura County, with a free in-home design consultation."
      },
      {
        question: "What is the difference between drapery and curtains?",
        answer:
          "In practice the terms overlap: drapery usually refers to heavier, often lined, floor-length panels, while curtains are typically lighter, unlined fabric panels. A consultation compares both approaches for the room's privacy, light control, and style goals."
      },
      {
        question: "Can drapery and curtains be combined with shades or shutters?",
        answer:
          "Yes. Layering drapery panels over shades, or framing shutters with stationary panels, is one of the most requested looks — it adds softness and height while keeping the practical light control of the hard treatment."
      },
      {
        question: "Do you bring fabric samples to the consultation?",
        answer:
          "Yes. The in-home consultation reviews fabric direction, lining, fullness, hardware, and measurements at your windows, so the finished panels fit the room exactly."
      }
    ],
    relatedLinks: [
      { label: "Custom drapery and curtains", href: "/drapery/" },
      { label: "Custom shades", href: "/shades/" },
      { label: "Custom shutters", href: "/shutters/" },
      { label: "Free consultation", href: "/free-window-treatment-consultation/" },
      { label: "Book a consultation time", href: "/book-consultation/" },
      { label: "Best window treatments", href: "/best-window-treatments-ventura-county/" }
    ]
  },
  {
    slug: "shutters-near-me-ventura-county",
    path: "/shutters-near-me-ventura-county/",
    title: "Shutters Near Me | Local Shutter Company for Moorpark, Thousand Oaks & Ventura County | 805 Shutters",
    description:
      "Looking for shutters near you in Ventura County? 805 Shutters is a local, family-owned shutter company installing custom plantation shutters in Moorpark, Thousand Oaks, Camarillo, Simi Valley, and nearby cities with free in-home consultations.",
    h1: "Shutters Near Me: A Local Ventura County Shutter Company",
    eyebrow: "Local service area",
    answer:
      "If you are searching for shutters near you in Ventura County, 805 Shutters is a local, family-owned shutter company that measures, builds, and installs custom plantation shutters in Moorpark, Thousand Oaks, Camarillo, Simi Valley, Newbury Park, Westlake Village, Oxnard, Ventura, Ojai, and surrounding communities. There is no showroom trip required — the free consultation brings samples and measuring to your home, and the written quote includes professional installation.",
    image: "/images/portfolio-enhanced/uploaded-stacked-arch-shutters-wide.jpg",
    imageAlt: "Custom plantation shutters installed on tall Ventura County living room windows",
    updated: "2026-07-07",
    serviceTypes: ["Custom shutters", "Plantation shutters", "Shutter installation"],
    sections: [
      {
        heading: "The Showroom Comes To You",
        body:
          "Because every shutter is made to the measured size of each window, the useful first step is an in-home visit, not a store. 805 Shutters brings material samples, colors, louver sizes, and frame styles to your home, measures each opening, and writes the quote on the spot with no obligation.",
        bullets: [
          "Free in-home consultation with real samples",
          "Wood, composite, and specialty-shape plantation shutters",
          "Sliding door, arched, and two-story window solutions",
          "Professional installation included in the written quote"
        ]
      },
      {
        heading: "Cities We Serve",
        body:
          "805 Shutters installs custom shutters throughout Ventura County and the Conejo Valley. Each city page below covers local service details.",
        bullets: [
          "Moorpark, Thousand Oaks, and Newbury Park",
          "Camarillo and Santa Rosa Valley",
          "Simi Valley, Oak Park, and Westlake Village",
          "Oxnard, Ventura, Port Hueneme, Ojai, Santa Paula, and Fillmore"
        ]
      },
      {
        heading: "Why Choose A Local Shutter Company",
        body:
          "805 Shutters is family-owned and based in Ventura County, with more than 30 years of local experience. The people who measure your windows are the same local team that stands behind the installation — not a national call center. Recent local projects and customer reviews are published on the site."
      }
    ],
    faqs: [
      {
        question: "Who installs plantation shutters near Moorpark and Thousand Oaks?",
        answer:
          "805 Shutters is a family-owned Ventura County company that measures and installs custom plantation shutters in Moorpark, Thousand Oaks, and the surrounding Conejo Valley, with free in-home consultations."
      },
      {
        question: "Is there a shutter showroom near me?",
        answer:
          "805 Shutters brings the showroom to you: the free consultation includes material samples, colors, louver sizes, and frame styles at your own windows, which is more accurate than judging products under showroom lighting."
      },
      {
        question: "How do I get a shutter quote near me?",
        answer:
          "Book a free in-home consultation online or by phone. Windows are measured during the visit and the written quote — product plus professional installation — is provided with no obligation."
      },
      {
        question: "Do you also install shades, blinds, and drapery?",
        answer:
          "Yes. The same consultation can compare plantation shutters, roller and honeycomb shades, motorized shades, wood and faux wood blinds, and custom drapery and curtains, room by room."
      }
    ],
    relatedLinks: [
      { label: "Custom shutters", href: "/shutters/" },
      { label: "Shutters in Moorpark", href: "/shutters/moorpark/" },
      { label: "Shutters in Thousand Oaks", href: "/shutters/thousand-oaks/" },
      { label: "Shutters in Camarillo", href: "/shutters/camarillo/" },
      { label: "Customer reviews", href: "/reviews/" },
      { label: "Free consultation", href: "/free-window-treatment-consultation/" },
      { label: "Book a consultation time", href: "/book-consultation/" }
    ]
  },
  {
    slug: "blinds-near-me-ventura-county",
    path: "/blinds-near-me-ventura-county/",
    title: "Blinds Near Me | Custom Blinds for Moorpark, Thousand Oaks & Ventura County | 805 Shutters",
    description:
      "Looking for custom blinds near you? 805 Shutters measures and installs wood, faux wood, aluminum, and vertical blinds in Moorpark, Thousand Oaks, Camarillo, Simi Valley, and across Ventura County with free in-home consultations.",
    h1: "Blinds Near Me: Custom Blinds Installed Across Ventura County",
    eyebrow: "Local service area",
    answer:
      "If you are searching for blinds near you in Ventura County, 805 Shutters is a local, family-owned company that measures and installs custom wood, faux wood, aluminum, vertical, and softwood blinds in Moorpark, Thousand Oaks, Camarillo, Simi Valley, Newbury Park, Westlake Village, Oxnard, Ventura, Ojai, and surrounding communities. The free in-home consultation brings samples to your windows and the written quote includes professional installation.",
    image: "/images/805-portfolio-blinds-office.jpg",
    imageAlt: "Warm wood blinds filtering light in a Ventura County home office",
    updated: "2026-07-07",
    serviceTypes: ["Custom blinds", "Wood blinds", "Faux wood blinds", "Vertical blinds"],
    sections: [
      {
        heading: "Measured At Your Windows, Not Bought Off A Shelf",
        body:
          "Ready-made blinds rarely fit real windows well. 805 Shutters measures each opening during a free in-home visit, compares materials and control options with real samples, and orders blinds built to those exact sizes.",
        bullets: [
          "Wood and faux wood blinds for bedrooms, offices, and living rooms",
          "Vertical blinds for sliding doors and wide openings",
          "Aluminum and softwood options for practical rooms and rentals",
          "Cordless and easy-control options for homes with kids and pets"
        ]
      },
      {
        heading: "Cities We Serve",
        body:
          "805 Shutters installs custom blinds throughout Ventura County and the Conejo Valley, including Moorpark, Thousand Oaks, Newbury Park, Camarillo, Santa Rosa Valley, Simi Valley, Oak Park, Westlake Village, Oxnard, Ventura, Port Hueneme, Ojai, Santa Paula, and Fillmore."
      },
      {
        heading: "Blind Replacement Made Simple",
        body:
          "Replacing old, damaged, or discolored blinds is one of the most common local requests. The same visit can measure every window, match products across rooms, and schedule installation so the whole home is consistent."
      }
    ],
    faqs: [
      {
        question: "Who installs custom blinds near Moorpark and Thousand Oaks?",
        answer:
          "805 Shutters is a family-owned Ventura County company that measures and installs custom blinds in Moorpark, Thousand Oaks, and the surrounding Conejo Valley, with free in-home consultations."
      },
      {
        question: "Are custom blinds worth it compared to store-bought?",
        answer:
          "Custom blinds are made to the measured size of each window, so they fit cleanly, operate smoothly, and look consistent across the home — without the gaps, cut-down slats, and returns that come with off-the-shelf sizes."
      },
      {
        question: "How do I get a blinds quote near me?",
        answer:
          "Book a free in-home consultation online or by phone. Windows are measured during the visit and the written quote — product plus professional installation — is provided with no obligation."
      }
    ],
    relatedLinks: [
      { label: "Custom blinds", href: "/blinds/" },
      { label: "Blinds in Moorpark", href: "/blinds/moorpark-ca/" },
      { label: "Blinds in Thousand Oaks", href: "/blinds/thousand-oaks-ca/" },
      { label: "Blinds in Camarillo", href: "/blinds/camarillo-ca/" },
      { label: "Free consultation", href: "/free-window-treatment-consultation/" },
      { label: "Book a consultation time", href: "/book-consultation/" }
    ]
  },
  {
    slug: "window-shades-near-me-ventura-county",
    path: "/window-shades-near-me-ventura-county/",
    title: "Window Shades Near Me | Roller, Roman & Motorized Shades for Ventura County | 805 Shutters",
    description:
      "Looking for window shades near you? 805 Shutters measures and installs roller, honeycomb, Roman, woven wood, and motorized shades in Moorpark, Thousand Oaks, Camarillo, Simi Valley, and across Ventura County.",
    h1: "Window Shades Near Me: Custom Shades Installed Across Ventura County",
    eyebrow: "Local service area",
    answer:
      "If you are searching for window shades near you in Ventura County, 805 Shutters is a local, family-owned company that measures and installs custom roller shades, honeycomb shades, Roman shades, woven wood shades, and motorized shades in Moorpark, Thousand Oaks, Camarillo, Simi Valley, Newbury Park, Westlake Village, Oxnard, Ventura, Ojai, and surrounding communities. The free in-home consultation compares fabrics and lift systems at your own windows.",
    image: "/images/805-portfolio-shades-bedroom.jpg",
    imageAlt: "Relaxed Roman shades over a wide bedroom window in a Ventura County home",
    updated: "2026-07-07",
    serviceTypes: ["Window shades", "Roller shades", "Roman shades", "Motorized shades"],
    sections: [
      {
        heading: "Shade Styles Compared In Your Home",
        body:
          "The right shade depends on the room: glare control, room darkening, insulation, texture, or automation. The free consultation brings fabric samples and lift-system options to your windows.",
        bullets: [
          "Roller and solar shades for glare control and clean lines",
          "Honeycomb shades for insulation and bedrooms",
          "Roman and woven wood shades for softness and texture",
          "Motorized shades for tall, wide, or hard-to-reach glass"
        ]
      },
      {
        heading: "Cities We Serve",
        body:
          "805 Shutters installs custom window shades throughout Ventura County and the Conejo Valley, including Moorpark, Thousand Oaks, Newbury Park, Camarillo, Santa Rosa Valley, Simi Valley, Oak Park, Westlake Village, Oxnard, Ventura, Port Hueneme, Ojai, Santa Paula, and Fillmore."
      },
      {
        heading: "Motorization Without The Guesswork",
        body:
          "Motorized and smart-home-compatible shades are quoted during the same visit, so power options, remotes, and app or voice control are planned around the actual windows instead of added later."
      }
    ],
    faqs: [
      {
        question: "Who installs window shades near Moorpark and Thousand Oaks?",
        answer:
          "805 Shutters is a family-owned Ventura County company that measures and installs custom window shades in Moorpark, Thousand Oaks, and the surrounding Conejo Valley, with free in-home consultations."
      },
      {
        question: "Can I get motorized shades near me?",
        answer:
          "Yes. 805 Shutters installs motorized roller, honeycomb, and Roman shades across Ventura County, including options compatible with common smart home systems."
      },
      {
        question: "How do I get a shade quote near me?",
        answer:
          "Book a free in-home consultation online or by phone. Windows are measured during the visit and the written quote — product plus professional installation — is provided with no obligation."
      }
    ],
    relatedLinks: [
      { label: "Custom shades", href: "/shades/" },
      { label: "Motorized window shades", href: "/motorized-window-shades-ventura-county/" },
      { label: "Shades in Moorpark", href: "/shades/moorpark-ca/" },
      { label: "Shades in Thousand Oaks", href: "/shades/thousand-oaks-ca/" },
      { label: "Free consultation", href: "/free-window-treatment-consultation/" },
      { label: "Book a consultation time", href: "/book-consultation/" }
    ]
  },
  {
    slug: "window-treatment-company-near-me-ventura-county",
    path: "/window-treatment-company-near-me-ventura-county/",
    title: "Window Treatment Company Near Me | Local Ventura County Experts | 805 Shutters",
    description:
      "Looking for a window treatment company near you? 805 Shutters is a family-owned Ventura County company installing custom shutters, shades, blinds, and drapery in Moorpark, Thousand Oaks, Camarillo, Simi Valley, and nearby cities.",
    h1: "A Local Window Treatment Company Serving Ventura County",
    eyebrow: "Local service area",
    answer:
      "805 Shutters is a local, family-owned window treatment company serving all of Ventura County — Moorpark, Thousand Oaks, Camarillo, Simi Valley, Newbury Park, Westlake Village, Oxnard, Ventura, Ojai, and surrounding communities. One free in-home consultation can compare custom plantation shutters, roller and honeycomb shades, motorized shades, wood and faux wood blinds, and custom drapery and curtains, with measuring and professional installation included.",
    image: "/images/805-hero-window-treatments.jpg",
    imageAlt: "Custom window treatments in a bright Ventura County living room",
    updated: "2026-07-07",
    serviceTypes: [
      "Custom shutters",
      "Window shades",
      "Custom blinds",
      "Custom drapery",
      "Commercial window coverings"
    ],
    sections: [
      {
        heading: "One Local Company For Every Window",
        body:
          "Because 805 Shutters carries shutters, shades, blinds, drapery, and exterior and commercial shades, the recommendation fits each room instead of forcing one product everywhere.",
        bullets: [
          "Plantation shutters for living areas and durability",
          "Roller, honeycomb, Roman, and motorized shades",
          "Wood, faux wood, aluminum, and vertical blinds",
          "Custom drapery and curtains, alone or layered",
          "Exterior shades and commercial roller shades"
        ]
      },
      {
        heading: "Why Local Matters",
        body:
          "805 Shutters is family-owned and based in Ventura County with more than 30 years of local experience. The people who measure your windows are the same local team that installs and stands behind the finished project — not a national call center or a rotating franchise crew."
      },
      {
        heading: "Cities We Serve",
        body:
          "Moorpark, Thousand Oaks, Newbury Park, Camarillo, Santa Rosa Valley, Simi Valley, Oak Park, Westlake Village, Oxnard, Ventura, Port Hueneme, Ojai, Santa Paula, and Fillmore."
      }
    ],
    faqs: [
      {
        question: "What window treatment company serves Moorpark and Thousand Oaks?",
        answer:
          "805 Shutters is a family-owned Ventura County window treatment company serving Moorpark, Thousand Oaks, and the surrounding Conejo Valley with custom shutters, shades, blinds, and drapery, and free in-home consultations."
      },
      {
        question: "Do you charge for the in-home consultation?",
        answer:
          "No. The in-home consultation, measuring, and the written quote are free, with no obligation."
      },
      {
        question: "Do you handle commercial projects?",
        answer:
          "Yes. 805 Shutters installs commercial roller shades and window coverings for offices, storefronts, schools, and medical spaces across Ventura County."
      }
    ],
    relatedLinks: [
      { label: "Shutters near me", href: "/shutters-near-me-ventura-county/" },
      { label: "Window shades near me", href: "/window-shades-near-me-ventura-county/" },
      { label: "Blinds near me", href: "/blinds-near-me-ventura-county/" },
      { label: "Custom drapery and curtains", href: "/custom-drapery-curtains-ventura-county/" },
      { label: "Customer reviews", href: "/reviews/" },
      { label: "Free consultation", href: "/free-window-treatment-consultation/" },
      { label: "Book a consultation time", href: "/book-consultation/" }
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
