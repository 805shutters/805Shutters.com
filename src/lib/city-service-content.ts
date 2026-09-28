import { allPages, site } from "./site-data";
import { isConsolidatedPage } from "./consolidated-pages";

const serviceLabels: Record<string, string> = {
  blinds: "Blinds",
  shutters: "Shutters",
  "window-coverings": "Window Coverings",
  "window-treatments": "Window Treatments",
  shades: "Shades",
  drapery: "Drapery",
  "commercial-window-coverings": "Commercial Window Coverings"
};
const hubServices = new Set(["blinds", "shutters", "window-coverings", "window-treatments"]);

// Presentation-only additions: keep the shared page objects, metadata, JSON-LD,
// and sitemap image inventory unchanged. These destinations were checked against
// the live sitemap and direct HTTP 200 responses before this change.
export const cityServicePages = allPages.flatMap((page) => {
  const segments = page.path.split("/").filter(Boolean);
  if (segments.length !== 2 || !serviceLabels[segments[0]] || page.noIndex || isConsolidatedPage(page.path)) return [];
  const [service, slug] = segments;
  const city = site.areas.find((name) => {
    const citySlug = name.toLowerCase().replaceAll(" ", "-");
    return slug === citySlug || slug === `${citySlug}-ca`
      || (service === "shutters" && ["interior-shutters", "wood-shutters"].some((type) => slug === `${type}-${citySlug}`));
  });
  return city ? [{ path: page.path, service, city, label: `${serviceLabels[service]} in ${city}` }] : [];
});

export function cityServiceLinks(path: string) {
  const hub = path.split("/").filter(Boolean);
  if (hub.length === 1 && hubServices.has(hub[0])) {
    return { heading: "Areas We Serve", hub: true, links: cityServicePages.filter((page) => page.service === hub[0]) };
  }
  const current = cityServicePages.find((page) => page.path === path);
  if (!current) return null;
  return {
    heading: `More Services in ${current.city}`,
    hub: false,
    links: cityServicePages.filter((page) => page.city === current.city && page.service !== current.service)
  };
}

type SearchIntro = { heading: string; body: string; photos?: { image: string; alt: string }[] };
const companyIntro = "805 Shutters has been family-owned since 1995. Call (805) 806-9344 for a free in-home consultation.";
export const citySearchIntros: Record<string, SearchIntro> = {
  "/blinds/ventura-ca/": { heading: "Window Coverings and Blinds in Ventura", body: companyIntro },
  "/window-coverings/simi-valley-ca/": {
    heading: "Custom Blinds in Simi Valley", body: companyIntro,
    photos: [
      { image: "/images/portfolio-enhanced/roller-shade-large-window-card.jpg", alt: "Roller shade installed by 805 Shutters across a large Ventura County window" },
      { image: "/images/portfolio-enhanced/plantation-shutters-dining-room-card.jpg", alt: "White plantation shutters installed by 805 Shutters in a Ventura County dining room" }
    ]
  },
  "/shutters/simi-valley/": { heading: "Window Shutters in Simi Valley", body: companyIntro },
  "/window-treatments/westlake-village-ca/": {
    heading: "Plantation Shutters in Westlake Village", body: companyIntro,
    photos: [
      { image: "/images/portfolio-enhanced/arched-window-custom-shutters-card.jpg", alt: "Custom arched plantation shutters installed by 805 Shutters in a Ventura County living room" },
      { image: "/images/portfolio-enhanced/plantation-shutters-dining-room-card.jpg", alt: "White plantation shutters installed by 805 Shutters in a Ventura County dining room" }
    ]
  },
  "/free-window-treatment-consultation/": {
    heading: "Free Blinds Consultation",
    body: "805 Shutters offers a free in-home consultation and has been family-owned since 1995. Call (805) 806-9344 to arrange your consultation."
  }
};
