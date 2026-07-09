"use client";

import Link from "next/link";
import { useCommercialMode } from "./CommercialModeProvider";
import { LeadForm } from "./LeadForm";
import { ServiceGrid } from "./ServiceGrid";
import { TrackedPhoneLink } from "./TrackedPhoneLink";
import { AppointmentBooking } from "./booking/AppointmentBooking";
import { CrmHomeLogin } from "./crm/CrmHomeLogin";
import { HomeHeroCarousel, type HomeHeroSlide } from "./HomeHeroCarousel";
import { LazyVideo } from "./LazyVideo";
import { SitePage, homeHeroImage, site } from "@/lib/site-data";
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

const HOME_PHOTO_FLOW_PRIORITY_COUNT = 4;

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
    image: homeHeroImage,
    imageAlt: page.imageAlt
  },
  {
    label: "Shutters",
    tagline: "Frame the room with custom-fit shutters.",
    image: "/images/homepage-flow/shutters.webp",
    imageAlt: "Arched dining room windows fitted with white plantation shutters"
  },
  {
    label: "Honeycomb Shades",
    tagline: "True room darkening rest.",
    image: "/images/editorial-scroll/room-darkening-honeycomb-shades.webp",
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
    label: "Vertical Cellular Shades",
    tagline: "Insulated comfort for wide patio doors.",
    image: "/images/homepage-flow/vertical-cellular-shades.webp",
    imageAlt: "Sliding glass door fitted with vertical cellular shades"
  },
  {
    label: "Stained Wood Shutters",
    tagline: "Classic stained wood matched to the room.",
    image: "/images/homepage-flow/stained-wood-library-shutters.webp",
    imageAlt: "Dark home library with classic stained wood shutters matched to built-in bookcases"
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
    image: "/images/homepage-flow/vertical-blinds.webp",
    imageAlt: "Sliding patio door fitted with cream vertical blinds"
  },
  {
    label: "Mini Blinds",
    tagline: "Slim lines for simple everyday privacy.",
    image: "/images/homepage-flow/mini-blinds.webp",
    imageAlt: "Coastal home office windows fitted with slim white mini blinds"
  },
  {
    label: "Layered Shades",
    tagline: "Shift from filtered light to privacy in one treatment.",
    image: "/images/homepage-flow/layered-kitchen-shades.webp",
    imageAlt: "Layered shades matched to colorful marble in a bright kitchen"
  },
  {
    label: "Sheer Shades",
    tagline: "Soften the sun while keeping the room open.",
    image: "/images/homepage-flow/sheer-shades.webp",
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
    image: "/images/homepage-flow/panel-track-shades.webp",
    imageAlt: "Sliding glass door fitted with wide panel track shades"
  },
  {
    label: "Skylight Shades",
    tagline: "Tame overhead heat without losing daylight.",
    image: "/images/homepage-flow/skylight-shades.webp",
    imageAlt: "Two drywall skylights fitted with light-filtering cellular shades"
  },
  {
    label: "Skylight Shutters",
    tagline: "Make angled light easier to control.",
    image: "/images/homepage-flow/skylight-shutters.webp",
    imageAlt: "Angled skylights fitted with white louvered shutters"
  }
];

const featuredResidentialHeroSlides = (page: SitePage, allSlides = homeHeroSlides(page)): HomeHeroSlide[] => {
  const findSlide = (label: string) => allSlides.find((slide) => slide.label === label);

  return [
    findSlide("Original Home Photo"),
    findSlide("Layered Shades"),
    findSlide("Shutters"),
    findSlide("Honeycomb Shades")
  ].filter((slide): slide is HomeHeroSlide => Boolean(slide));
};

const appendUnusedHeroSlides = (featuredSlides: HomeHeroSlide[], allSlides: HomeHeroSlide[]) => {
  const featuredImages = new Set(featuredSlides.map((slide) => slide.image));

  return [
    ...featuredSlides,
    ...allSlides.filter((slide) => !featuredImages.has(slide.image))
  ];
};

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
    title: "Patterned Roller Shades",
    image: "/images/portfolio-enhanced/recent-patterned-roller-shades-card.jpg",
    imageAlt: "Patterned roller shades installed in a Ventura County home"
  },
  {
    category: "Blinds",
    title: "Tall Window Blinds",
    image: "/images/portfolio-enhanced/recent-tall-window-blinds-card.jpg",
    imageAlt: "Tall window blinds installed in a Ventura County room"
  },
  {
    category: "Shutters",
    title: "Recent Bedroom Plantation Shutters",
    image: "/images/portfolio-enhanced/recent-bedroom-plantation-shutters-card.jpg",
    imageAlt: "White plantation shutters installed on bedroom windows"
  },
  {
    category: "Shutters",
    title: "Bay Window Shutters",
    image: "/images/portfolio-enhanced/recent-bay-window-plantation-shutters-card.jpg",
    imageAlt: "White plantation shutters installed across a bay window"
  },
  {
    category: "Shades",
    title: "Living Room Roller Shades",
    image: "/images/video-posters/recent-living-room-roller-shades.jpg",
    imageAlt: "Roller shades installed around a Ventura County living room",
    video: "/videos/recent-living-room-roller-shades.mp4"
  },
  {
    category: "Shades",
    title: "Bedroom Roller Shades",
    image: "/images/video-posters/recent-bedroom-roller-shades-patio-view.jpg",
    imageAlt: "Roller shades installed across a bedroom patio view",
    video: "/videos/recent-bedroom-roller-shades-patio-view.mp4"
  },
  {
    category: "Shutters",
    title: "Patio Door Plantation Shutters",
    image: "/images/portfolio-enhanced/recent-patio-door-plantation-shutters-card.jpg",
    imageAlt: "Plantation shutters installed around patio doors"
  },
  {
    category: "Shutters",
    title: "Recent Arched Window Shutters",
    image: "/images/portfolio-enhanced/recent-arched-window-plantation-shutters-card.jpg",
    imageAlt: "Arched plantation shutters installed in a Ventura County home"
  },
  {
    category: "Shutters",
    title: "Two-Story Arch Shutters",
    image: "/images/portfolio-enhanced/recent-two-story-arch-plantation-shutters-card.jpg",
    imageAlt: "Two-story arched plantation shutters installed in a living room"
  },
  {
    category: "Shades",
    title: "Solar Roller Shade Detail",
    image: "/images/portfolio-enhanced/recent-solar-roller-shade-detail-card.jpg",
    imageAlt: "Solar roller shade detail over a patio view"
  },
  {
    category: "Shutters",
    title: "Recent Dining Room Plantation Shutters",
    image: "/images/portfolio-enhanced/recent-dining-room-plantation-shutters-card.jpg",
    imageAlt: "Plantation shutters installed in a dining room"
  },
  {
    category: "Shades",
    title: "Fabric Roller Shade Detail",
    image: "/images/portfolio-enhanced/fabric-roller-shade-valance-detail-card.jpg",
    imageAlt: "Fabric roller shade with a matching valance installed over a Ventura County window"
  },
  {
    category: "Shutters",
    title: "Bedroom Plantation Shutters",
    image: "/images/portfolio-enhanced/bedroom-plantation-shutters-angle-card.jpg",
    imageAlt: "White plantation shutters installed on a Ventura County bedroom window"
  },
  {
    category: "Shutters",
    title: "Straight-On Bedroom Shutters",
    image: "/images/portfolio-enhanced/bedroom-plantation-shutters-straight-card.jpg",
    imageAlt: "Straight-on view of white plantation shutters in a Ventura County bedroom"
  },
  {
    category: "Shutters",
    title: "Bedroom Shutters Wide Angle",
    image: "/images/portfolio-enhanced/bedroom-plantation-shutters-wide-angle-card.jpg",
    imageAlt: "Wide angle view of white plantation shutters in a Ventura County bedroom"
  },
  {
    category: "Shutters",
    title: "Bay Window Plantation Shutters",
    image: "/images/portfolio-enhanced/bay-window-plantation-shutters-front-card.jpg",
    imageAlt: "White plantation shutters installed across a Ventura County bay window"
  },
  {
    category: "Shutters",
    title: "Angled Bay Window Shutters",
    image: "/images/portfolio-enhanced/bay-window-plantation-shutters-angle-card.jpg",
    imageAlt: "White plantation shutters installed on an angled Ventura County bay window"
  },
  {
    category: "Shutters",
    title: "Tall Window Shutter Detail",
    image: "/images/portfolio-enhanced/two-story-shutter-installation-detail-card.jpg",
    imageAlt: "Custom plantation shutter detail on tall angled Ventura County windows"
  },
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
    video: "/videos/motorized-roller-shades-patio-view-loop.mp4"
  },
  {
    category: "Shades",
    title: "Motorized Living Room Shades",
    image: "/images/video-posters/motorized-roller-shades-living-room-view.jpg",
    imageAlt: "Motorized roller shades installed across living room patio-view windows",
    video: "/videos/motorized-roller-shades-living-room-view.mp4"
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

const residentialRecentWorkPhotos = [
  installedPortfolioPhotos.find((photo) => photo.title === "Patterned Roller Shades"),
  installedPortfolioPhotos.find((photo) => photo.title === "Tall Window Blinds"),
  installedPortfolioPhotos.find((photo) => photo.title === "Recent Bedroom Plantation Shutters"),
  installedPortfolioPhotos.find((photo) => photo.title === "Bay Window Shutters"),
  installedPortfolioPhotos.find((photo) => photo.title === "Living Room Roller Shades"),
  installedPortfolioPhotos.find((photo) => photo.title === "Bedroom Roller Shades"),
  installedPortfolioPhotos.find((photo) => photo.title === "Patio Door Plantation Shutters"),
  installedPortfolioPhotos.find((photo) => photo.title === "Recent Arched Window Shutters"),
  installedPortfolioPhotos.find((photo) => photo.title === "Two-Story Arch Shutters"),
  installedPortfolioPhotos.find((photo) => photo.title === "Solar Roller Shade Detail"),
  installedPortfolioPhotos.find((photo) => photo.title === "Recent Dining Room Plantation Shutters"),
  installedPortfolioPhotos.find((photo) => photo.title === "Office Plantation Shutters"),
  installedPortfolioPhotos.find((photo) => photo.title === "Layered Bedroom Shades"),
  installedPortfolioPhotos.find((photo) => photo.title === "Arched Window Shutters"),
  installedPortfolioPhotos.find((photo) => photo.title === "Motorized Roller Shades")
].filter((photo): photo is InstalledPortfolioPhoto => Boolean(photo));

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

function PageFaqSection({
  faqs,
  heading = "Common questions before a free consultation"
}: {
  faqs?: SitePage["faqs"];
  heading?: string;
}) {
  if (!faqs?.length) {
    return null;
  }

  return (
    <section className="page-faq-band">
      <div className="content-wrap page-faq-head">
        <p className="eyebrow">FAQ</p>
        <h2>{heading}</h2>
      </div>
      <div className="content-wrap page-faq-grid">
        {faqs.map((faq) => (
          <article className="page-faq-item" key={faq.question}>
            <h3>{faq.question}</h3>
            <p>{faq.answer}</p>
          </article>
        ))}
      </div>
    </section>
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
        image: "/images/shutters-portfolio/material-stained-wood.jpg",
        imageAlt: "Dark stained wood plantation shutters in a warm living room",
        body:
          "A natural wood shutter with visible grain and a furniture-style stain for rooms that need warmth, depth, and a richer finish."
      },
      {
        label: "Painted wood",
        image: "/images/shutters-portfolio/material-painted-wood.jpg",
        imageAlt: "Painted white wood plantation shutters in a bright dining room",
        body:
          "A real wood shutter with a crisp painted finish, often used when the goal is a classic white built-in look with natural material."
      },
      {
        label: "Poly composite",
        image: "/images/shutters-portfolio/material-poly-composite.jpg",
        imageAlt: "White poly composite plantation shutters in a bright bathroom",
        body:
          "A smooth moisture-resistant shutter option for bathrooms, laundry rooms, kitchens, and high-use spaces that need easy cleaning."
      },
      {
        label: "MDF composite",
        image: "/images/shutters-portfolio/material-mdf-composite.jpg",
        imageAlt: "White MDF composite plantation shutters in a neutral home office",
        body:
          "A painted composite shutter with a clean solid look for practical rooms where budget, consistency, and durability matter."
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
        label: "1 7/8",
        image: "/images/shutters-portfolio/louver-1-7-8.jpg",
        imageAlt: "Close detail of narrow 1 7/8 inch plantation shutter louvers",
        body:
          "The tightest louver scale, best for a more traditional look with closely spaced lines and a denser shutter pattern."
      },
      {
        label: "2 1/2",
        image: "/images/shutters-portfolio/louver-2-1-2.jpg",
        imageAlt: "Close detail of 2 1/2 inch plantation shutter louvers",
        body:
          "A medium-narrow louver that keeps a classic shutter rhythm while opening the view more than the smallest size."
      },
      {
        label: "3 1/2",
        image: "/images/shutters-portfolio/louver-3-1-2.jpg",
        imageAlt: "Medium-wide 3 1/2 inch plantation shutter louvers on a bright window",
        body:
          "A popular balanced louver size for many homes, giving clean proportions, good privacy control, and a comfortable view."
      },
      {
        label: "4 1/2",
        image: "/images/shutters-portfolio/louver-4-1-2.jpg",
        imageAlt: "Wide 4 1/2 inch plantation shutter louvers in a modern living room",
        body:
          "A wider louver with fewer lines across the window, useful for bigger openings and a cleaner contemporary feel."
      },
      {
        label: "5 1/2",
        image: "/images/shutters-portfolio/louver-5-1-2.jpg",
        imageAlt: "Extra large 5 1/2 inch plantation shutter louvers on oversized windows",
        body:
          "The broadest louver scale for a bold, open look on oversized windows where view-through and modern proportion matter."
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
        image: "/images/shutters-portfolio/style-traditional-beaded.jpg",
        imageAlt: "Traditional plantation shutters with beaded frames and stile detail",
        body:
          "Beaded frame and stile details add shadow lines and a more classic built-in profile around the shutter opening."
      },
      {
        label: "Contemporary (flat frames and stile)",
        image: "/images/shutters-portfolio/style-contemporary-flat.jpg",
        imageAlt: "Contemporary plantation shutters with flat frames and flat stile",
        body:
          "Flat frame and stile details reduce visual busywork for cleaner rooms, modern trim, and larger window openings."
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
        image: "/images/shutters-portfolio/door-bypass.jpg",
        imageAlt: "Bypass plantation shutters on a wide sliding glass door",
        body:
          "Bypass shutter panels slide past each other on a track, making them useful for wide patio doors and sliding glass openings."
      },
      {
        label: "Bifold",
        image: "/images/shutters-portfolio/door-bifold.jpg",
        imageAlt: "Bifold plantation shutter panels folded beside a patio door opening",
        body:
          "Bifold shutter panels fold together so a wider opening can clear more fully when the room needs door access."
      },
      {
        label: "French doors",
        image: "/images/shutters-portfolio/door-french.jpg",
        imageAlt: "Plantation shutters mounted on French doors with handle cutouts",
        body:
          "French door shutters need precise panel sizing and handle clearance so the doors remain usable after installation."
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
        image: "/images/shutters-portfolio/specialty-arched.jpg",
        imageAlt: "Custom arched plantation shutters fitted to a tall arched window",
        body:
          "Arched shutters follow the curved top of the window so the treatment looks built for the architecture."
      },
      {
        label: "Raked shutters",
        image: "/images/shutters-portfolio/specialty-raked.jpg",
        imageAlt: "Custom raked plantation shutters fitted to a sloped angled window",
        body:
          "Raked shutters are built for angled or sloped windows where a standard rectangular shutter would not fit the opening."
      },
      {
        label: "Sunburst",
        image: "/images/shutters-portfolio/specialty-sunburst.jpg",
        imageAlt: "White sunburst plantation shutter with radial fan louvers",
        body:
          "Sunburst shutters use a fan-like louver pattern for half-round arches and decorative transom openings."
      },
      {
        label: "Circle",
        image: "/images/shutters-portfolio/specialty-circle.jpg",
        imageAlt: "Custom circular plantation shutter fitted inside a round window",
        body:
          "Circle shutters require a true round frame and custom louver layout so the shutter follows the window edge cleanly."
      },
      {
        label: "Oval",
        image: "/images/shutters-portfolio/specialty-oval.jpg",
        imageAlt: "Custom oval plantation shutter fitted inside a tall oval window",
        body:
          "Oval shutters are templated around the curved opening so the finished treatment keeps the shape visible."
      },
      {
        label: "Octagon",
        image: "/images/shutters-portfolio/specialty-octagon.jpg",
        imageAlt: "Custom octagon plantation shutter fitted inside an eight-sided window",
        body:
          "Octagon shutters use a faceted frame that follows each side of the eight-sided window opening."
      },
      {
        label: "Custom shapes",
        image: "/images/shutters-portfolio/specialty-custom-shapes.jpg",
        imageAlt: "Custom plantation shutters fitted to mixed specialty window shapes",
        body:
          "Custom shape shutters handle mixed geometry, unusual angles, eyebrow arches, and specialty window groupings."
      }
    ]
  }
];

function leadInterestForPath(path: string): "consultation" | "shutters" | "shades" | "blinds" | "commercial" {
  if (path.startsWith("/commercial")) return "commercial";
  if (path.startsWith("/shutters")) return "shutters";
  if (path.startsWith("/shades") || path.startsWith("/exterior-shades")) return "shades";
  if (path.startsWith("/blinds")) return "blinds";
  return "consultation";
}

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
        <section className="content-wrap page-gallery" aria-label={`${activePage.h1} media`}>
          {activePage.gallery.map((item) => (
            <figure className="page-gallery-item" key={item.video ?? item.image}>
              {item.video ? (
                <LazyVideo aria-label={item.imageAlt} poster={item.image} src={item.video} />
              ) : (
                <img src={item.image} alt={item.imageAlt} loading="lazy" decoding="async" />
              )}
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

      <PageFaqSection faqs={activePage.faqs} />

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
            <LeadForm defaultInterest={leadInterestForPath(activePage.path)} />
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

      <PageFaqSection faqs={page.faqs} heading="Common shutter questions" />

      <section className="form-band">
        <div className="content-wrap form-layout">
          <div>
            <p className="eyebrow">Start here</p>
            <h2>Compare shutter materials, louvers, styles, doors, and shapes in one visit.</h2>
            <p>
              Send the project details and 805 Shutters will follow up. Prefer to talk now?{" "}
              <TrackedPhoneLink location="shutters form copy">Call {site.phone}</TrackedPhoneLink>.
            </p>
          </div>
          <LeadForm defaultInterest="shutters" />
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
              <AppointmentBooking
                className="button primary commercial-cta-button"
                label="Book a commercial shade audit"
                bookingVariant="commercial"
              />
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
            <AppointmentBooking
              className="button primary commercial-cta-button"
              label="Book a commercial shade audit"
              bookingVariant="commercial"
            />
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
  const installedPhotos = commercialMode ? commercialInstalledPortfolioPhotos : residentialRecentWorkPhotos;
  const sections = commercialMode ? commercialHomeSections : page.sections;
  const heroSlides = commercialMode ? commercialHomeHeroSlides() : homeHeroSlides(page);
  const residentialFeaturedHeroSlides = commercialMode ? [] : featuredResidentialHeroSlides(page, heroSlides);
  const heroMediaSlides = commercialMode ? heroSlides : residentialFeaturedHeroSlides;
  const residentialPhotoFlowSlides = commercialMode ? [] : appendUnusedHeroSlides(residentialFeaturedHeroSlides, heroSlides);
  const heroTitle = commercialMode
    ? "Commercial shade systems for every workspace"
    : "Custom Shutters, Shades & Blinds — Proudly Serving Ventura County for 30 Years";
  const heroCta = commercialMode ? "Schedule a Meeting" : "Book your Free In-home Consultation";
  const heroHref = commercialMode ? "/commercial-window-coverings/" : "/book-consultation/";

  return (
    <>
      <section className="home-editorial">
        <div className="home-editorial-panel">
          <HomeHeroCarousel slides={heroMediaSlides} rotationIntervalMs={commercialMode ? 0 : 7000} />
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
                  <LazyVideo aria-label={story.imageAlt} poster={story.image} src={story.video} />
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
      ) : null}

      <section className={`installed-portfolio${commercialMode ? "" : " installed-portfolio--recent"}`}>
        <div className="content-wrap installed-portfolio-head">
          <p className="eyebrow">{commercialMode ? "Commercial Portfolio" : "Recent Work"}</p>
          <h2>{commercialMode ? "Commercial window covering applications for business spaces" : "Recent shutters and shades from Ventura County homes"}</h2>
        </div>
        <div className="content-wrap installed-portfolio-grid">
          {installedPhotos.map((photo, index) => (
            <figure className="installed-portfolio-card" key={photo.title}>
              {photo.video ? (
                <LazyVideo aria-label={photo.imageAlt} poster={photo.image} src={photo.video} />
              ) : (
                <img
                  src={photo.image}
                  alt={photo.imageAlt}
                  loading={index === 0 ? "eager" : "lazy"}
                  fetchPriority={index === 0 ? "high" : undefined}
                  decoding="async"
                />
              )}
              <figcaption>
                <span>{photo.category}</span>
                <strong>{photo.title}</strong>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="home-about" id="about" aria-label="About 805 Shutters">
        <div className="content-wrap home-about-inner">
          <p className="eyebrow">About Us</p>
          <h2>Locally owned and family operated, right here in Ventura County.</h2>
          <p>
            805 Shutters is a family-owned company led by owner Ken Hill.
            For more than 30 years, homeowners and businesses across Ventura County have trusted
            us for custom shutters, shades, and blinds &mdash; measured, sold, and installed by a
            local team, never a national call center.
          </p>
          <p>
            Proudly serving all of Ventura County, North Los Angeles County, and Santa Clarita
            with personal service from the first consultation through final installation.
          </p>
          <p className="home-about-promise">
            We stand behind all of our products &mdash; and we won&rsquo;t stop until you&rsquo;re completely satisfied.
          </p>
          <p className="home-about-promise-sub">
            That commitment to customer service is the reason our neighbors keep coming back and sending
            their friends. If something isn&rsquo;t right, we make it right.
          </p>
          <div className="home-about-actions">
            <Link className="button primary" href="/book-consultation/">
              Book your free consultation
            </Link>
            <Link className="home-about-link" href="/about/">
              More about 805 Shutters &rarr;
            </Link>
          </div>
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
            <AppointmentBooking
              label={commercialMode ? "Book a commercial shade audit" : "Book an appointment here"}
              bookingVariant={commercialMode ? "commercial" : "standard"}
            />
            <TrackedPhoneLink className="button secondary" location="home cta">
              Call {site.phone}
            </TrackedPhoneLink>
          </div>
        </div>
      </section>

      {!commercialMode && residentialPhotoFlowSlides.length ? (
        <>
          <section className="home-photo-flow-intro" aria-label="More window treatment inspiration">
            <div className="content-wrap home-photo-flow-intro-inner">
              <p className="eyebrow">More Inspiration</p>
              <h2>Keep browsing shutters, shades, blinds, and drapery styles.</h2>
            </div>
          </section>

          <section className="home-photo-flow home-photo-flow--after-content" aria-label="More 805 Shutters homepage photos">
            {residentialPhotoFlowSlides.map((slide, index) => {
              const prioritizePhoto = index < HOME_PHOTO_FLOW_PRIORITY_COUNT;

              return (
                <figure className="home-photo-flow-item" key={slide.label || slide.image}>
                  <img
                    src={slide.image}
                    alt={slide.imageAlt}
                    loading={prioritizePhoto ? "eager" : "lazy"}
                    fetchPriority={prioritizePhoto ? "high" : "auto"}
                    decoding="async"
                  />
                  {slide.tagline ? (
                    <figcaption>
                      <span>{slide.label}</span>
                      <strong>{slide.tagline}</strong>
                    </figcaption>
                  ) : null}
                </figure>
              );
            })}
          </section>
        </>
      ) : null}

      <CrmHomeLogin />
    </>
  );
}
