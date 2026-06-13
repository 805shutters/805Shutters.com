"use client";

import Link from "next/link";
import { useCommercialMode } from "./CommercialModeProvider";
import { LeadForm } from "./LeadForm";
import { ServiceGrid } from "./ServiceGrid";
import { TrackedPhoneLink } from "./TrackedPhoneLink";
import { AppointmentBooking } from "./booking/AppointmentBooking";
import { CrmHomeLogin } from "./crm/CrmHomeLogin";
import { HomeHeroCarousel, type HomeHeroSlide } from "./HomeHeroCarousel";
import { SitePage, site } from "@/lib/site-data";
import {
  commercialApplications,
  commercialFaqs,
  commercialHomeSections,
  commercialModeImages,
  commercialProcessSteps,
  commercialProofPoints,
  commercializePage
} from "@/lib/commercial-mode-data";

type PortfolioStory = {
  eyebrow: string;
  title: string;
  body: string;
  image: string;
  imageAlt: string;
  imageWidth?: number;
  imageHeight?: number;
  href: string;
  tone?: "bright";
  video?: string;
};

type InstalledPortfolioPhoto = {
  category: string;
  title: string;
  image: string;
  imageAlt: string;
  video?: string;
};

const portfolioStories: PortfolioStory[] = [
  {
    eyebrow: "Exterior Shades",
    title: "Outdoor rooms, filtered beautifully.",
    body:
      "Exterior shades soften coastal glare while keeping the view wide open and relaxed.",
    image: "/images/editorial-scroll/ocean-terrace-exterior-shades.jpg",
    imageAlt: "Bright ocean terrace with exterior shades and sheer drapery",
    imageWidth: 1806,
    imageHeight: 871,
    href: "/exterior-shades/",
    tone: "bright"
  },
  {
    eyebrow: "Shades",
    title: "Quiet shade movement, real install.",
    body:
      "Live Ventura County footage shows roller shades softening the room while keeping the garden view calm.",
    image: "/images/video-posters/ventura-county-roller-shades-bedroom-live.jpg",
    imageAlt: "Roller shades installed in a Ventura County bedroom with a garden view",
    video: "/videos/ventura-county-roller-shades-bedroom-live.mp4",
    href: "/shades/"
  },
  {
    eyebrow: "Shades",
    title: "Color, softness, daylight.",
    body:
      "Woven shades and linen drapery keep the room glowing while the garden stays part of the scene.",
    image: "/images/editorial-scroll/garden-living-woven-shades.jpg",
    imageAlt: "Bright living room with woven shades, linen drapery, and a garden view",
    imageWidth: 1798,
    imageHeight: 875,
    href: "/shades/",
    tone: "bright"
  },
  {
    eyebrow: "Shutters",
    title: "Dining rooms with a better line.",
    body:
      "Plantation shutters make repeated windows feel intentional, balanced, and finished.",
    image: "/images/portfolio-enhanced/plantation-shutters-dining-room-wide.jpg",
    imageAlt: "White plantation shutters installed in a Ventura County dining room",
    href: "/shutters/"
  },
  {
    eyebrow: "Drapery",
    title: "Bedrooms made lighter.",
    body:
      "Layered drapery and roller shades create privacy without losing the clean poolside view.",
    image: "/images/editorial-scroll/poolside-bedroom-roller-shades.jpg",
    imageAlt: "Poolside bedroom with roller shades and white drapery",
    imageWidth: 1761,
    imageHeight: 893,
    href: "/drapery/",
    tone: "bright"
  },
  {
    eyebrow: "Shades",
    title: "One large shade, quietly done.",
    body:
      "A single roller shade softens the room, controls glare, and keeps the opening visually calm.",
    image: "/images/portfolio-enhanced/roller-shade-large-window-wide.jpg",
    imageAlt: "Roller shade covering a large Ventura County window",
    href: "/shades/"
  },
  {
    eyebrow: "Outdoor",
    title: "Sunset comfort, all year.",
    body:
      "Filtered exterior shade turns hot afternoon light into a room you can live in longer.",
    image: "/images/editorial-scroll/sunset-patio-exterior-shades.jpg",
    imageAlt: "Sunset patio with exterior shades and ocean views",
    imageWidth: 1672,
    imageHeight: 941,
    href: "/exterior-shades/",
    tone: "bright"
  },
  {
    eyebrow: "Shutters",
    title: "Specialty shapes, measured precisely.",
    body:
      "Arched openings need custom planning so the shutter follows the room instead of fighting it.",
    image: "/images/portfolio-enhanced/specialty-arch-window-shutters-wide.jpg",
    imageAlt: "Specialty arch window shutters custom fit in a Ventura County home",
    href: "/shutters/"
  },
  {
    eyebrow: "Woven Shades",
    title: "Warm texture at every window.",
    body:
      "Natural woven shades bring texture, control, and softness into open kitchens and breakfast rooms.",
    image: "/images/editorial-scroll/breakfast-room-woven-shades.jpg",
    imageAlt: "Breakfast room with woven shades and warm natural light",
    imageWidth: 1672,
    imageHeight: 941,
    href: "/shades/",
    tone: "bright"
  },
  {
    eyebrow: "Shutters",
    title: "Reading rooms with warmth.",
    body:
      "Dark wood shutters make a smaller room feel grounded while keeping daylight adjustable.",
    image: "/images/portfolio-enhanced/dark-wood-plantation-shutters-reading-room-wide.jpg",
    imageAlt: "Dark wood plantation shutters in a Ventura County reading room",
    href: "/shutters/"
  },
  {
    eyebrow: "Roller Shades",
    title: "Clean lines, endless view.",
    body:
      "Wide roller shades keep ocean-facing glass composed, functional, and quietly luxurious.",
    image: "/images/editorial-scroll/coastal-living-roller-shades.jpg",
    imageAlt: "Coastal living room with wide roller shades and ocean view",
    imageWidth: 1672,
    imageHeight: 941,
    href: "/shades/",
    tone: "bright"
  }
];

const commercialPortfolioStories: PortfolioStory[] = [
  {
    eyebrow: "Commercial Roller Shades",
    title: "Workspaces with controlled daylight.",
    body:
      "Neutral roller shades reduce glare and heat while keeping offices clean, bright, and professional.",
    image: commercialModeImages.smallOffice,
    imageAlt: "Commercial office with neutral roller shades filtering daylight",
    imageWidth: 1672,
    imageHeight: 941,
    href: "/commercial-roller-shades/",
    tone: "bright"
  },
  {
    eyebrow: "Storefronts",
    title: "Street-facing glass, handled cleanly.",
    body:
      "Solar shades soften exposure, protect interiors, and keep retail and lobby spaces usable during bright hours.",
    image: commercialModeImages.storefront,
    imageAlt: "Commercial storefront interior with solar roller shades",
    imageWidth: 1672,
    imageHeight: 941,
    href: "/commercial-window-coverings/",
    tone: "bright"
  },
  {
    eyebrow: "Medical Offices",
    title: "Privacy without making rooms feel closed.",
    body:
      "Commercial privacy shades help waiting rooms, treatment areas, and office suites feel calmer and more controlled.",
    image: commercialModeImages.medical,
    imageAlt: "Medical office waiting area with commercial privacy shades",
    imageWidth: 1672,
    imageHeight: 941,
    href: "/commercial-window-coverings/",
    tone: "bright"
  },
  {
    eyebrow: "Honeycomb Shades",
    title: "Soft privacy and insulation for work rooms.",
    body:
      "Honeycomb shades give offices, schools, and medical suites a softer look with practical privacy and temperature control.",
    image: commercialModeImages.honeycomb,
    imageAlt: "Commercial office windows fitted with honeycomb cellular shades",
    imageWidth: 1600,
    imageHeight: 900,
    href: "/commercial-window-coverings/",
    tone: "bright"
  },
  {
    eyebrow: "Schools And Facilities",
    title: "Durable shade plans for daily use.",
    body:
      "Cordless commercial shades support classrooms, shared rooms, and facilities that need practical light control.",
    image: commercialModeImages.school,
    imageAlt: "Southern California school campus with palms at golden hour",
    imageWidth: 1920,
    imageHeight: 1080,
    href: "/commercial-window-coverings/"
  },
  {
    eyebrow: "Faux Wood Blinds",
    title: "Durable blinds for practical commercial spaces.",
    body:
      "Faux wood blinds work well for offices, rental turns, staff rooms, and budget-conscious properties that still need a finished look.",
    image: commercialModeImages.fauxWood,
    imageAlt: "Commercial office windows fitted with faux wood blinds",
    imageWidth: 1672,
    imageHeight: 941,
    href: "/commercial-window-coverings/",
    tone: "bright"
  },
  {
    eyebrow: "Warehouses And Industrial",
    title: "Shade programs built for working buildings.",
    body:
      "High window bands, office build-outs, and staff areas in warehouses and industrial parks get practical, durable light control.",
    image: commercialModeImages.industrialWarehouse,
    imageAlt: "Bright industrial warehouse interior with high window bands",
    imageWidth: 1920,
    imageHeight: 1080,
    href: "/commercial-window-coverings/",
    tone: "bright"
  },
  {
    eyebrow: "Conference Rooms",
    title: "Presentation-ready privacy.",
    body:
      "Blackout and solar shade combinations make meetings, screens, and video calls easier to control.",
    image: commercialModeImages.conference,
    imageAlt: "Commercial conference room with blackout roller shades",
    imageWidth: 1672,
    imageHeight: 941,
    href: "/commercial-roller-shades/"
  }
];

const homeHeroSlides = (page: SitePage): HomeHeroSlide[] => [
  {
    label: "Original Home Photo",
    image: "/images/homepage-flow/main-homepage-photo.png",
    imageAlt: page.imageAlt
  },
  {
    label: "Shutters",
    tagline: "Frame the room with custom-fit shutters.",
    image: "/images/homepage-flow/shutters.png",
    imageAlt: "Arched dining room windows fitted with white plantation shutters"
  },
  {
    label: "Honeycomb Shades",
    tagline: "True room darkening rest",
    image: "/images/editorial-scroll/room-darkening-honeycomb-shades.png",
    imageAlt: "Dark blackout honeycomb shades lowered in a warm bedroom"
  },
  {
    label: "Drapery",
    tagline: "Add softness, height, and a finished designer look.",
    image: "/images/homepage-flow/drapery.jpg",
    imageAlt: "Coastal living room with soft custom drapery panels"
  },
  {
    label: "Roller Shades",
    tagline: "Keep the view, control the glare.",
    image: "/images/homepage-flow/roller-shades.jpg",
    imageAlt: "Coastal living room with wide roller shades and ocean view"
  },
  {
    label: "Bamboo Shades",
    tagline: "Bring color and natural texture into the light.",
    image: "/images/homepage-flow/bamboo-shades.jpg",
    imageAlt: "Bright living room with colored woven bamboo shades and linen drapery"
  },
  {
    label: "Faux Wood Blinds",
    tagline: "Classic wood-look control built for daily use.",
    image: "/images/homepage-flow/faux-wood-blinds.png",
    imageAlt: "Office windows fitted with warm faux wood blinds"
  },
  {
    label: "Exterior Patio Shades",
    tagline: "Turn harsh sun into usable outdoor space.",
    image: "/images/homepage-flow/exterior-patio-shades.jpg",
    imageAlt: "Sunset patio with exterior shades and ocean views"
  },
  {
    label: "Vertical Blinds",
    tagline: "Cover wide doors with smooth, practical control.",
    image: "/images/homepage-flow/vertical-blinds.png",
    imageAlt: "Sliding patio door fitted with cream vertical blinds"
  },
  {
    label: "Mini Blinds",
    tagline: "Slim lines for simple everyday privacy.",
    image: "/images/homepage-flow/mini-blinds.png",
    imageAlt: "Coastal home office windows fitted with slim white mini blinds"
  },
  {
    label: "Layered Shades",
    tagline: "Shift from filtered light to privacy in one treatment.",
    image: "/images/homepage-flow/layered-kitchen-shades.png",
    imageAlt: "Layered shades matched to colorful marble in a bright kitchen"
  },
  {
    label: "Sheer Shades",
    tagline: "Soften the sun while keeping the room open.",
    image: "/images/homepage-flow/sheer-shades.png",
    imageAlt: "Living room windows fitted with translucent sheer shades"
  },
  {
    label: "Natural Shades",
    tagline: "Warm woven texture for bright rooms.",
    image: "/images/homepage-flow/natural-shades.jpg",
    imageAlt: "Breakfast room with natural woven shades and warm light"
  },
  {
    label: "Panel Track Shades",
    tagline: "Wide panels that make sliding doors feel clean.",
    image: "/images/homepage-flow/panel-track-shades.png",
    imageAlt: "Sliding glass door fitted with wide panel track shades"
  },
  {
    label: "Vertical Cellular Shades",
    tagline: "Insulated comfort for wide patio doors.",
    image: "/images/homepage-flow/vertical-cellular-shades.png",
    imageAlt: "Sliding glass door fitted with vertical cellular shades"
  },
  {
    label: "Skylight Shades",
    tagline: "Tame overhead heat without losing daylight.",
    image: "/images/homepage-flow/skylight-shades.png",
    imageAlt: "Kitchen skylights fitted with light-filtering shades"
  },
  {
    label: "Skylight Shutters",
    tagline: "Make angled light easier to control.",
    image: "/images/homepage-flow/skylight-shutters.png",
    imageAlt: "Angled skylights fitted with white louvered shutters"
  }
];

const commercialHomeHeroSlides = (): HomeHeroSlide[] => [
  {
    label: "Commercial Hero",
    image: commercialModeImages.hero,
    imageAlt: "Sunlit Southern California office floor with tall shaded windows"
  },
  {
    label: "Commercial Blackout Shades",
    image: commercialModeImages.conference,
    imageAlt: "Commercial conference room with dark blackout roller shades"
  },
  {
    label: "Commercial Storefront",
    image: commercialModeImages.storefront,
    imageAlt: "Commercial storefront fitted with solar roller shades"
  },
  {
    label: "Commercial Honeycomb Shades",
    image: commercialModeImages.honeycomb,
    imageAlt: "Commercial office windows fitted with honeycomb cellular shades"
  },
  {
    label: "Commercial Faux Wood Blinds",
    image: commercialModeImages.fauxWood,
    imageAlt: "Commercial office windows fitted with faux wood blinds"
  }
];

const installedPortfolioPhotos: InstalledPortfolioPhoto[] = [
  {
    category: "Shades",
    title: "Layered Bedroom Shades",
    image: "/images/portfolio-enhanced/layered-shades-bedroom-window-card.jpg",
    imageAlt: "Layered window shades installed on a Ventura County bedroom window"
  },
  {
    category: "Shades",
    title: "Motorized Roller Shades",
    image: "/images/video-posters/motorized-roller-shades-patio-view.jpg",
    imageAlt: "Motorized roller shades installed over patio-view windows",
    video: "/videos/motorized-roller-shades-patio-view-loop.m4v"
  },
  {
    category: "Shades",
    title: "Corner Cellular Shades",
    image: "/images/portfolio-enhanced/uploaded-corner-cellular-shades-card.jpg",
    imageAlt: "Cellular shades installed on two corner windows in a Ventura County home"
  },
  {
    category: "Shades",
    title: "Bedroom Cellular Shades",
    image: "/images/portfolio-enhanced/uploaded-bedroom-cellular-shades-card.jpg",
    imageAlt: "Cellular shades installed on two bedroom windows beside a door"
  },
  {
    category: "Shades",
    title: "Twin Cellular Shades",
    image: "/images/portfolio-enhanced/uploaded-twin-cellular-shades-card.jpg",
    imageAlt: "Twin cellular shades installed on side-by-side bedroom windows"
  },
  {
    category: "Shutters",
    title: "Office Plantation Shutters",
    image: "/images/portfolio-enhanced/uploaded-office-plantation-shutters-card.jpg",
    imageAlt: "White plantation shutters installed over office corner windows"
  },
  {
    category: "Shades",
    title: "Corner Room Cellular Shades",
    image: "/images/portfolio-enhanced/uploaded-corner-room-cellular-shades-card.jpg",
    imageAlt: "Cellular shades installed across a corner room window grouping"
  },
  {
    category: "Shades",
    title: "Full-Height Cellular Shades",
    image: "/images/portfolio-enhanced/uploaded-full-height-cellular-shades-card.jpg",
    imageAlt: "Full-height cellular shades installed on corner room windows"
  },
  {
    category: "Shutters",
    title: "Arched Window Shutters",
    image: "/images/portfolio-enhanced/arched-window-custom-shutters-card.jpg",
    imageAlt: "Custom arched plantation shutters in a Ventura County living room"
  },
  {
    category: "Shutters",
    title: "Bedroom Sliding Door Shutters",
    image: "/images/portfolio-enhanced/bedroom-sliding-door-shutters-card.jpg",
    imageAlt: "Custom shutters installed on a Ventura County bedroom sliding door"
  },
  {
    category: "Shutters",
    title: "Arched Shutter Detail",
    image: "/images/portfolio-enhanced/uploaded-arched-shutter-detail-card.jpg",
    imageAlt: "Custom arched shutter installed in a Ventura County room"
  },
  {
    category: "Shutters",
    title: "Single Arch Shutter",
    image: "/images/portfolio-enhanced/uploaded-single-arch-shutter-card.jpg",
    imageAlt: "Single arched plantation shutter installed in a Ventura County home"
  },
  {
    category: "Shutters",
    title: "Shutter Panel Detail",
    image: "/images/portfolio-enhanced/uploaded-shutter-panel-detail-card.jpg",
    imageAlt: "Close detail of a custom shutter panel beside a door in a Ventura County home"
  },
  {
    category: "Shutters",
    title: "Two-Story Living Room Shutters",
    image: "/images/portfolio-enhanced/uploaded-two-story-living-room-shutters-card.jpg",
    imageAlt: "Two-story living room windows fitted with custom plantation shutters"
  },
  {
    category: "Shutters",
    title: "Stacked Arch Shutters",
    image: "/images/portfolio-enhanced/uploaded-stacked-arch-shutters-card.jpg",
    imageAlt: "Stacked arched and rectangular shutters installed on tall living room windows"
  }
];

const commercialInstalledPortfolioPhotos: InstalledPortfolioPhoto[] = [
  {
    category: "Office Shades",
    title: "Commercial Office Roller Shades",
    image: commercialModeImages.hero,
    imageAlt: "Commercial office windows fitted with neutral roller shades"
  },
  {
    category: "Storefronts",
    title: "Solar Shades For Street-Facing Glass",
    image: commercialModeImages.storefront,
    imageAlt: "Retail storefront interior with commercial solar shades"
  },
  {
    category: "Medical Offices",
    title: "Privacy Shades For Waiting Areas",
    image: commercialModeImages.medical,
    imageAlt: "Medical office waiting area with privacy roller shades"
  },
  {
    category: "Schools",
    title: "Cordless Facility Roller Shades",
    image: commercialModeImages.school,
    imageAlt: "Southern California school campus with palms at golden hour"
  },
  {
    category: "Honeycomb Shades",
    title: "Cellular Shades For Offices",
    image: commercialModeImages.honeycomb,
    imageAlt: "Commercial office windows fitted with honeycomb cellular shades"
  },
  {
    category: "Faux Wood Blinds",
    title: "Durable Blinds For Property Turns",
    image: commercialModeImages.fauxWood,
    imageAlt: "Commercial office windows fitted with faux wood blinds"
  },
  {
    category: "Warehouses",
    title: "Shade Programs For Industrial Space",
    image: commercialModeImages.industrialWarehouse,
    imageAlt: "Bright industrial warehouse interior with high window bands"
  },
  {
    category: "Conference Rooms",
    title: "Blackout Shades For Presentations",
    image: commercialModeImages.conference,
    imageAlt: "Commercial conference room with blackout roller shades"
  }
];

function SectionLinks({ links }: { links?: { label: string; href: string }[] }) {
  if (!links?.length) {
    return null;
  }
  return (
    <ul className="seo-link-list">
      {links.map((link) => (
        <li key={link.href}>
          <Link href={link.href}>{link.label}</Link>
        </li>
      ))}
    </ul>
  );
}

type ShutterOption = {
  label: string;
  image: string;
  imageAlt: string;
  body: string;
};

type ShutterOptionGroup = {
  id: string;
  label: string;
  heading: string;
  body: string;
  image: string;
  imageAlt: string;
  options: ShutterOption[];
};

const shutterOptionGroups: ShutterOptionGroup[] = [
  {
    id: "material",
    label: "Material",
    heading: "Choose the shutter material around finish, durability, and room use.",
    body:
      "The material decision affects the final look, weight, cleaning routine, and how the shutter handles daily use. The consultation compares painted, stained, and composite options against the room, light exposure, trim, and budget.",
    image: "/images/portfolio-enhanced/dark-wood-plantation-shutters-living-room-wide.jpg",
    imageAlt: "Dark stained wood plantation shutters installed across living room windows",
    options: [
      {
        label: "Stained wood",
        image: "/images/portfolio-enhanced/dark-wood-plantation-shutters-living-room-wide.jpg",
        imageAlt: "Dark stained wood plantation shutters installed across living room windows",
        body: "A richer natural finish for rooms where warmth, grain, and furniture tone should carry through the window treatment."
      },
      {
        label: "Painted wood",
        image: "/images/portfolio-enhanced/plantation-shutters-dining-room-wide.jpg",
        imageAlt: "Painted white plantation shutters installed in a dining room",
        body: "A classic painted finish that keeps shutter lines crisp against trim, casing, and lighter room palettes."
      },
      {
        label: "Poly composite",
        image: "/images/portfolio-enhanced/uploaded-office-plantation-shutters-wide.jpg",
        imageAlt: "Composite plantation shutters installed on office windows",
        body: "A practical material direction for everyday rooms that need durability, easy cleaning, and a consistent painted look."
      },
      {
        label: "MDF composite",
        image: "/images/portfolio-enhanced/uploaded-shutter-panel-detail-wide.jpg",
        imageAlt: "Close detail of painted shutter louvers and rails",
        body: "A budget-aware painted shutter option for standard openings where a clean finished face matters most."
      }
    ]
  },
  {
    id: "louver-sizes",
    label: "Louver Sizes",
    heading: "Pick the louver scale that controls view, privacy, and proportion.",
    body:
      "Smaller louvers create a tighter traditional line, while larger louvers open the view and feel cleaner on bigger windows. We review the window height, room style, sightline, and privacy goal before the order is built.",
    image: "/images/portfolio-enhanced/uploaded-shutter-panel-detail-wide.jpg",
    imageAlt: "Close detail of plantation shutter louvers and panel rails",
    options: [
      {
        label: "1 7/8 inch",
        image: "/images/portfolio-enhanced/uploaded-shutter-panel-detail-wide.jpg",
        imageAlt: "Close detail of narrow plantation shutter louvers",
        body: "A smaller traditional scale for tighter window proportions and a more detailed shutter face."
      },
      {
        label: "2 1/2 inch",
        image: "/images/portfolio-enhanced/plantation-shutters-dining-room-wide.jpg",
        imageAlt: "White plantation shutters across dining room windows",
        body: "A balanced classic louver size that works well on many standard residential windows."
      },
      {
        label: "3 1/2 inch",
        image: "/images/portfolio-enhanced/arched-plantation-shutters-living-room-wide.jpg",
        imageAlt: "Large living room windows with plantation shutters",
        body: "A common larger louver choice when the goal is a cleaner line and more open view through the shutter."
      },
      {
        label: "4 1/2 inch",
        image: "/images/portfolio-enhanced/uploaded-two-story-living-room-shutters-wide.jpg",
        imageAlt: "Tall living room shutters on two-story windows",
        body: "A broader louver scale for taller glass, larger rooms, and a quieter modern shutter pattern."
      },
      {
        label: "5 1/2 inch",
        image: "/images/portfolio-enhanced/dark-wood-plantation-shutters-living-room-wide.jpg",
        imageAlt: "Large stained wood plantation shutters in a living room",
        body: "The widest direction for statement openings where maximum view and strong proportion matter."
      }
    ]
  },
  {
    id: "style",
    label: "Style",
    heading: "Match the frame and stile detail to the architecture of the room.",
    body:
      "Traditional shutter details add a more classic built-in look. Contemporary details keep the face flatter and quieter, which works well with cleaner trim, larger glass, and modern interiors.",
    image: "/images/portfolio-enhanced/plantation-shutters-dining-room-wide.jpg",
    imageAlt: "White plantation shutters installed in a Ventura County dining room",
    options: [
      {
        label: "Traditional style (beaded frames and stile)",
        image: "/images/portfolio-enhanced/plantation-shutters-dining-room-wide.jpg",
        imageAlt: "Traditional white plantation shutters with divided window panels",
        body: "A more detailed shutter face that feels architectural, classic, and finished with traditional trim."
      },
      {
        label: "Contemporary (flat frames and stile)",
        image: "/images/portfolio-enhanced/uploaded-office-plantation-shutters-wide.jpg",
        imageAlt: "Clean white plantation shutters in a bright office",
        body: "A flatter visual direction for cleaner rooms, wider glass, and a quieter modern profile."
      }
    ]
  },
  {
    id: "doors",
    label: "Doors",
    heading: "Plan shutter operation around the way the door is used every day.",
    body:
      "Sliding doors, French doors, and wide openings need a shutter plan that keeps access comfortable. We compare bypass, bifold, and French door layouts around handle clearance, furniture, traffic flow, and panel swing.",
    image: "/images/portfolio-enhanced/bedroom-sliding-door-shutters-wide.jpg",
    imageAlt: "Custom shutters installed on a Ventura County bedroom sliding door",
    options: [
      {
        label: "Bypass",
        image: "/images/portfolio-enhanced/bedroom-sliding-door-shutters-wide.jpg",
        imageAlt: "Bypass-style shutters covering a bedroom sliding door",
        body: "A sliding shutter approach for patio doors and wide openings where panel swing would interrupt furniture or traffic."
      },
      {
        label: "Bifold",
        image: "/images/portfolio-enhanced/uploaded-two-story-living-room-shutters-wide.jpg",
        imageAlt: "Wide multi-panel shutters on tall living room windows",
        body: "A folding layout for larger openings where panels need to stack open more compactly."
      },
      {
        label: "French doors",
        image: "/images/portfolio-enhanced/bedroom-sliding-door-shutters-natural.jpg",
        imageAlt: "Custom door shutters with warm natural light",
        body: "A door-mounted plan that accounts for handles, clearance, swing direction, and daily access."
      }
    ]
  },
  {
    id: "specialty-shapes",
    label: "Specialty Shapes",
    heading: "Custom shapes follow the opening instead of hiding it.",
    body:
      "Arches, rakes, circles, ovals, octagons, and custom shapes need precise templates and careful planning. The goal is a shutter that respects the architecture while still operating cleanly.",
    image: "/images/portfolio-enhanced/specialty-arch-window-shutters-wide.jpg",
    imageAlt: "Specialty arched plantation shutters custom fit in a Ventura County home",
    options: [
      {
        label: "Arched shutters",
        image: "/images/portfolio-enhanced/specialty-arch-window-shutters-wide.jpg",
        imageAlt: "Specialty arched plantation shutters custom fit in a home",
        body: "A custom template follows the curve so the shutter works with the architecture instead of covering it up."
      },
      {
        label: "Raked shutters",
        image: "/images/portfolio-enhanced/arched-window-custom-shutters-wide.jpg",
        imageAlt: "Custom specialty shutters on angled and arched windows",
        body: "An angled shutter layout for raked or sloped openings where standard rectangular panels do not fit."
      },
      {
        label: "Sunburst",
        image: "/images/portfolio-enhanced/uploaded-stacked-arch-shutters-wide.jpg",
        imageAlt: "Stacked specialty arch shutters with custom upper detail",
        body: "A decorative upper treatment for arched openings that need a finished focal point."
      },
      {
        label: "Circle",
        image: "/images/portfolio-enhanced/uploaded-single-arch-shutter-wide.jpg",
        imageAlt: "Single specialty arched shutter with custom shaped detail",
        body: "A specialty template direction for round architectural openings that need measured custom fabrication."
      },
      {
        label: "Oval",
        image: "/images/portfolio-enhanced/uploaded-arched-shutter-detail-wide.jpg",
        imageAlt: "Close view of specialty shutter detail and shaped frame",
        body: "A shaped-frame approach for softer specialty openings where the shutter must follow the reveal."
      },
      {
        label: "Octagon",
        image: "/images/portfolio-enhanced/arched-plantation-shutters-living-room-wide.jpg",
        imageAlt: "Custom shutters installed on specialty living room windows",
        body: "A custom measured option for geometric windows that need clean edges and controlled light."
      },
      {
        label: "Custom shapes",
        image: "/images/portfolio-enhanced/arched-window-custom-shutters-natural.jpg",
        imageAlt: "Natural view of custom shutters on specialty shaped windows",
        body: "A measured-from-template path for unusual openings that do not match standard shutter dimensions."
      }
    ]
  }
];

export function PageSections({ page }: { page: SitePage }) {
  const { isCommercialMode } = useCommercialMode();

  if (page.path === "/commercial-window-coverings/") {
    return <CommercialSeoPage page={page} />;
  }

  if (!isCommercialMode && page.path === "/shutters/") {
    return <ShuttersCategoryPage page={page} />;
  }

  const activePage = isCommercialMode ? commercializePage(page) : page;

  if (activePage.path === "/") {
    return <HomePageSections page={activePage} commercialMode={isCommercialMode} />;
  }

  return (
    <>
      <section className="page-editorial">
        <div className="content-wrap page-editorial-panel">
          <div className="page-editorial-copy">
            <p className="eyebrow">{activePage.eyebrow}</p>
            <h1>{activePage.h1}</h1>
            <p className="lede">{activePage.intro}</p>
            <div className="hero-actions">
              <Link className="button primary" href="/free-window-treatment-consultation/">
                Free Consultation
              </Link>
              <TrackedPhoneLink className="button secondary hero-phone" location={`${activePage.path} hero`}>
                Call {site.phone}
              </TrackedPhoneLink>
            </div>
          </div>
          <div className="page-editorial-media">
            <img src={activePage.image} alt={activePage.imageAlt} />
          </div>
        </div>
      </section>

      {activePage.gallery?.length ? (
        <section className="content-wrap page-gallery" aria-label={`${activePage.h1} photos`}>
          {activePage.gallery.map((item) => (
            <figure className="page-gallery-item" key={item.image}>
              <img src={item.image} alt={item.imageAlt} loading="lazy" decoding="async" />
            </figure>
          ))}
        </section>
      ) : null}

      {activePage.path === "/" ? <ServiceGrid commercialMode={isCommercialMode} /> : null}

      <section className="content-wrap section-stack">
        {activePage.sections.map((section) => (
          <article className="copy-block" key={section.heading}>
            <h2>{section.heading}</h2>
            <p>{section.body}</p>
            {section.bullets ? (
              <ul className="tag-list">
                {section.bullets.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
            <SectionLinks links={section.links} />
          </article>
        ))}
      </section>

      {activePage.form ? (
        <section className="form-band">
          <div className="content-wrap form-layout">
            <div>
              <p className="eyebrow">Start here</p>
              <h2>Request Your Free Consultation</h2>
              <p>
                Send the project details and {isCommercialMode ? "805 Commercial" : "805 Shutters"} will follow up. Prefer to talk now?{" "}
                <TrackedPhoneLink location={`${activePage.path} form copy`}>Call {site.phone}</TrackedPhoneLink>.
              </p>
            </div>
            <LeadForm />
          </div>
        </section>
      ) : (
        <section className="cta-band">
          <div className="content-wrap cta-layout">
            <div>
              <p className="eyebrow">Next step</p>
              <h2>{activePage.cta || "Schedule a free consultation"}</h2>
            </div>
            <div className="hero-actions">
              <Link className="button primary" href="/free-window-treatment-consultation/">
                Free Consultation
              </Link>
              <TrackedPhoneLink className="button secondary" location={`${activePage.path} cta`}>
                Call {site.phone}
              </TrackedPhoneLink>
            </div>
          </div>
        </section>
      )}
    </>
  );
}

function ShuttersCategoryPage({ page }: { page: SitePage }) {
  return (
    <>
      <section className="shutter-category-strip" aria-label="Shutter product categories">
        <div className="content-wrap shutter-category-strip__inner">
          {shutterOptionGroups.map((group) => (
            <a className="shutter-category-link" href={`#shutter-${group.id}`} key={group.id}>
              <span>{group.label}</span>
              <small>{group.options.map((option) => option.label).join(" / ")}</small>
            </a>
          ))}
        </div>
      </section>

      <section className="page-editorial shutters-hero">
        <div className="content-wrap page-editorial-panel shutters-hero-panel">
          <div className="page-editorial-copy shutters-hero-copy">
            <p className="eyebrow">{page.eyebrow}</p>
            <h1>{page.h1}</h1>
            <p className="lede">
              Custom shutters planned by material, louver size, frame style, door operation, and specialty shape so the
              finished installation fits the home instead of forcing one default look.
            </p>
            <div className="hero-actions">
              <Link className="button primary" href="/free-window-treatment-consultation/">
                Free Consultation
              </Link>
              <TrackedPhoneLink className="button secondary hero-phone" location="shutters hero">
                Call {site.phone}
              </TrackedPhoneLink>
            </div>
          </div>
          <figure className="page-editorial-media shutters-hero-media">
            <img src={page.image} alt={page.imageAlt} />
            <figcaption>
              <span>Custom measured</span>
              <strong>Plantation shutters for standard windows, doors, and specialty shapes</strong>
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="shutters-intro-band">
        <div className="content-wrap shutters-intro-layout">
          <div>
            <p className="eyebrow">Shutter specification guide</p>
            <h2>Start with the choices that change how the shutter looks and works.</h2>
          </div>
          <p>
            A shutter order should be built around the room: the finish, the louver proportion, the frame detail, the
            way doors open, and any custom shape in the architecture. These are the decisions we review before final
            measuring and ordering.
          </p>
        </div>
      </section>

      <section className="shutter-detail-list" aria-label="Shutter option details">
        <div className="content-wrap shutter-detail-list__inner">
          {shutterOptionGroups.map((group, index) => (
            <article className="shutter-detail-panel" id={`shutter-${group.id}`} key={group.id}>
              <div className="shutter-detail-overview">
                <div className="shutter-detail-copy">
                  <p className="eyebrow">{group.label}</p>
                  <h2>{group.heading}</h2>
                  <p>{group.body}</p>
                  <ul className="shutter-option-list">
                    {group.options.map((option) => (
                      <li key={option.label}>{option.label}</li>
                    ))}
                  </ul>
                </div>
                <figure className="shutter-detail-media">
                  <img
                    src={group.options[0].image}
                    alt={group.options[0].imageAlt}
                    loading={index < 1 ? "eager" : "lazy"}
                    decoding="async"
                  />
                </figure>
              </div>
              <div className="shutter-option-gallery" aria-label={`${group.label} photo examples`}>
                {group.options.map((option) => (
                  <figure className="shutter-portfolio-card" key={option.label}>
                    <img src={option.image} alt={option.imageAlt} loading="lazy" decoding="async" />
                    <figcaption>
                      <span>{group.label}</span>
                      <strong>{option.label}</strong>
                      <p>{option.body}</p>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="shutter-planning-band">
        <div className="content-wrap shutter-planning-layout">
          <div>
            <p className="eyebrow">Measured before ordering</p>
            <h2>Each shutter plan is checked against the opening, trim, clearance, and daily use.</h2>
            <p>
              Before anything is built, 805 Shutters confirms opening size, frame depth, sill conditions, panel swing,
              handle clearance, divider rail placement, color direction, and how the shutters should perform when open,
              closed, or tilted.
            </p>
          </div>
          <ul className="shutter-planning-list" aria-label="Shutter planning checklist">
            <li>Room-by-room measurements</li>
            <li>Frame and mount review</li>
            <li>Door and handle clearance</li>
            <li>Specialty-shape templates</li>
            <li>Color and material confirmation</li>
            <li>Ventura County installation support</li>
          </ul>
        </div>
      </section>

      <section className="cta-band">
        <div className="content-wrap cta-layout">
          <div>
            <p className="eyebrow">Next step</p>
            <h2>Compare shutter materials, louvers, styles, doors, and shapes in one visit.</h2>
          </div>
          <div className="hero-actions">
            <Link className="button primary" href="/free-window-treatment-consultation/">
              Free Consultation
            </Link>
            <TrackedPhoneLink className="button secondary" location="shutters cta">
              Call {site.phone}
            </TrackedPhoneLink>
          </div>
        </div>
      </section>
    </>
  );
}

function CommercialSeoPage({ page }: { page: SitePage }) {
  return (
    <>
      <section className="page-editorial commercial-seo-hero">
        <div className="content-wrap page-editorial-panel commercial-seo-hero-panel">
          <div className="page-editorial-copy commercial-seo-hero-copy">
            <p className="eyebrow">{page.eyebrow}</p>
            <h1>{page.h1}</h1>
            <p className="lede">{page.intro}</p>
            <div className="hero-actions">
              <AppointmentBooking className="button primary commercial-cta-button" label="Book a commercial shade audit" />
              <TrackedPhoneLink className="button secondary hero-phone" location={`${page.path} hero`}>
                Call {site.phone}
              </TrackedPhoneLink>
            </div>
          </div>
          <figure className="page-editorial-media commercial-seo-hero-media">
            <img src={page.image} alt={page.imageAlt} />
            <figcaption>
              <span>30+ years local experience</span>
              <strong>Ventura County commercial measuring and installation</strong>
            </figcaption>
          </figure>
        </div>
        <div className="content-wrap commercial-proof-strip" aria-label="Commercial window covering project types">
          {commercialProofPoints.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </section>

      <ServiceGrid commercialMode />

      <section className="commercial-seo-applications">
        <div className="content-wrap commercial-seo-section-head">
          <p className="eyebrow">Commercial project types</p>
          <h2>Window covering planning for schools, offices, warehouses, storefronts, and retail spaces</h2>
          <p>
            Search traffic for commercial projects usually starts with the building type and the problem: glare, heat,
            privacy, damaged blinds, presentation control, safe operation, or a professional look from the street.
          </p>
        </div>
        <div className="content-wrap commercial-application-grid">
          {commercialApplications.map((application) => (
            <article className="commercial-application-card" key={application.title}>
              <img src={application.image} alt={application.imageAlt} loading="lazy" decoding="async" />
              <div>
                <p className="eyebrow">{application.eyebrow}</p>
                <h3>{application.title}</h3>
                <p>{application.body}</p>
                <ul className="tag-list">
                  {application.bullets.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="commercial-audit-band" id="commercial-shade-audit">
        <div className="content-wrap commercial-audit-layout">
          <div className="commercial-audit-copy">
            <p className="eyebrow">Free commercial shade audit</p>
            <h2>Turn a commercial window covering search into a clear scope</h2>
            <p>
              The audit reviews the property, window count, light exposure, damaged coverings, privacy needs, product
              fit, budget priorities, and target timing before a final measure or proposal.
            </p>
            <div className="commercial-process-grid">
              {commercialProcessSteps.map((step) => (
                <article className="commercial-process-step" key={step.title}>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </article>
              ))}
            </div>
          </div>
          <div className="commercial-audit-form">
            <LeadForm
              defaultInterest="commercial"
              notesPlaceholder="Property type, city, approximate window count, main issue, and target timing."
              submitLabel="Request Commercial Audit"
            />
          </div>
        </div>
      </section>

      <section className="content-wrap section-stack commercial-seo-depth">
        {page.sections.map((section) => (
          <article className="copy-block" key={section.heading}>
            <h2>{section.heading}</h2>
            <p>{section.body}</p>
            {section.bullets ? (
              <ul className="tag-list">
                {section.bullets.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
            <SectionLinks links={section.links} />
          </article>
        ))}
      </section>

      <section className="commercial-faq-band">
        <div className="content-wrap commercial-seo-section-head">
          <p className="eyebrow">Commercial FAQ</p>
          <h2>Common questions before a commercial shade audit</h2>
        </div>
        <div className="content-wrap commercial-faq-grid">
          {commercialFaqs.map((faq) => (
            <article className="commercial-faq-item" key={faq.question}>
              <h3>{faq.question}</h3>
              <p>{faq.answer}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="cta-band">
        <div className="content-wrap cta-layout">
          <div>
            <p className="eyebrow">Next step</p>
            <h2>{page.cta || "Schedule a free commercial shade audit"}</h2>
          </div>
          <div className="hero-actions">
            <AppointmentBooking className="button primary commercial-cta-button" label="Book a commercial shade audit" />
            <TrackedPhoneLink className="button secondary" location={`${page.path} cta`}>
              Call {site.phone}
            </TrackedPhoneLink>
          </div>
        </div>
      </section>
    </>
  );
}

function HomePageSections({ page, commercialMode }: { page: SitePage; commercialMode: boolean }) {
  const stories = commercialMode ? commercialPortfolioStories : portfolioStories;
  const installedPhotos = commercialMode ? commercialInstalledPortfolioPhotos : installedPortfolioPhotos;
  const sections = commercialMode ? commercialHomeSections : page.sections;
  const heroSlides = commercialMode ? commercialHomeHeroSlides() : homeHeroSlides(page);
  const heroMediaSlides = commercialMode ? heroSlides : heroSlides.slice(0, 1);
  const residentialPhotoFlowSlides = commercialMode ? [] : heroSlides.slice(1);
  const heroTitle = commercialMode ? "Commercial shade systems for every workspace" : "Proudly serving Ventura County for the last 30 years";
  const heroCta = commercialMode ? "Schedule a Meeting" : "Book your Free In-home Consultation";
  const heroHref = commercialMode ? "/commercial-window-coverings/" : "/book-consultation/";

  return (
    <>
      <section className="home-editorial">
        <div className="home-editorial-panel">
          <HomeHeroCarousel slides={heroMediaSlides} />
          <div className="home-hero-overlay">
            <h1 className="home-intro">{heroTitle}</h1>
            <div className="home-hero-actions">
              <Link className="button primary" href={heroHref}>
                {heroCta}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {commercialMode ? (
        <section className="portfolio-scroll" aria-label="805 Commercial portfolio scenes">
          {stories.map((story, index) => (
            <article
              className={`portfolio-story-panel${story.tone === "bright" ? " portfolio-story-panel--bright" : ""}`}
              key={story.title}
            >
              <div className="portfolio-story-media">
                {story.video ? (
                  <video
                    aria-label={story.imageAlt}
                    autoPlay
                    loop
                    muted
                    playsInline
                    poster={story.image}
                    preload={index === 0 ? "auto" : "metadata"}
                  >
                    <source src={story.video} type="video/mp4" />
                  </video>
                ) : (
                  <img
                    src={story.image}
                    alt={story.imageAlt}
                    width={story.imageWidth}
                    height={story.imageHeight}
                    loading={index === 0 ? "eager" : "lazy"}
                    decoding="async"
                  />
                )}
              </div>
              <div className="portfolio-story-copy">
                <p>{story.eyebrow}</p>
                <h2>{story.title}</h2>
                <span>{story.body}</span>
                <Link href={story.href}>Explore {story.eyebrow}</Link>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className="home-photo-flow" aria-label="805 Shutters homepage photo flow">
          {residentialPhotoFlowSlides.map((slide, index) => (
            <figure className="home-photo-flow-item" key={slide.label || slide.image}>
              <img
                src={slide.image}
                alt={slide.imageAlt}
                loading={index < 2 ? "eager" : "lazy"}
                decoding="async"
              />
              {slide.tagline ? (
                <figcaption>
                  <span>{slide.label}</span>
                  <strong>{slide.tagline}</strong>
                </figcaption>
              ) : null}
            </figure>
          ))}
        </section>
      )}

      <section className="installed-portfolio">
        <div className="content-wrap installed-portfolio-head">
          <p className="eyebrow">{commercialMode ? "Commercial Portfolio" : "Installed Portfolio"}</p>
          <h2>{commercialMode ? "Commercial window covering applications for business spaces" : "Shutters and shades from recent Ventura County projects"}</h2>
        </div>
        <div className="content-wrap installed-portfolio-grid">
          {installedPhotos.map((photo) => (
            <figure className="installed-portfolio-card" key={photo.title}>
              {photo.video ? (
                <video
                  aria-label={photo.imageAlt}
                  autoPlay
                  loop
                  muted
                  playsInline
                  poster={photo.image}
                  preload="auto"
                >
                  <source src={photo.video} type="video/mp4" />
                </video>
              ) : (
                <img src={photo.image} alt={photo.imageAlt} loading="lazy" decoding="async" />
              )}
              <figcaption>
                <span>{photo.category}</span>
                <strong>{photo.title}</strong>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <ServiceGrid commercialMode={commercialMode} />

      <section className="content-wrap section-stack">
        {sections.map((section) => (
          <article className="copy-block" key={section.heading}>
            <h2>{section.heading}</h2>
            <p>{section.body}</p>
            {section.bullets ? (
              <ul className="tag-list">
                {section.bullets.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
            <SectionLinks links={section.links} />
          </article>
        ))}
      </section>

      <section className="cta-band">
        <div className="content-wrap cta-layout">
          <div>
            <p className="eyebrow">Next step</p>
            <h2>{page.cta || "Schedule a free consultation"}</h2>
          </div>
          <div className="hero-actions">
            <AppointmentBooking label={commercialMode ? "Book a commercial shade audit" : "Book an appointment here"} />
            <TrackedPhoneLink className="button secondary" location="home cta">
              Call {site.phone}
            </TrackedPhoneLink>
          </div>
        </div>
      </section>

      <CrmHomeLogin />
    </>
  );
}
