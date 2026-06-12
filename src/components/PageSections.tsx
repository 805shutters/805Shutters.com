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
import { commercialHomeSections, commercialModeImages, commercializePage } from "@/lib/commercial-mode-data";

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
    image: commercialModeImages.hero,
    imageAlt: "Commercial office windows fitted with neutral roller shades",
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
    imageAlt: "Honeycomb cellular shades installed on commercial-style office windows",
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
    image: commercialModeImages.classroom,
    imageAlt: "School facility room fitted with commercial roller shades",
    imageWidth: 1672,
    imageHeight: 941,
    href: "/commercial-window-coverings/"
  },
  {
    eyebrow: "Faux Wood Blinds",
    title: "Durable blinds for practical commercial spaces.",
    body:
      "Faux wood blinds work well for offices, rental turns, staff rooms, and budget-conscious properties that still need a finished look.",
    image: commercialModeImages.fauxWood,
    imageAlt: "Faux wood blinds installed in a professional office setting",
    imageWidth: 1672,
    imageHeight: 941,
    href: "/commercial-window-coverings/",
    tone: "bright"
  },
  {
    eyebrow: "Lobbies",
    title: "Common areas that stay comfortable.",
    body:
      "Tall commercial windows can keep their architectural look while solar shades cut glare and afternoon heat.",
    image: commercialModeImages.lobby,
    imageAlt: "Commercial office lobby with tall windows and solar shades",
    imageWidth: 1672,
    imageHeight: 941,
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
    image: page.image,
    imageAlt: page.imageAlt
  },
  {
    image: "/images/video-posters/ventura-county-roller-shades-bedroom-live.jpg",
    imageAlt: "Live roller shades installed in a Ventura County bedroom",
    video: "/videos/ventura-county-roller-shades-bedroom-live.mp4"
  },
  {
    image: "/images/editorial-scroll/sunset-patio-exterior-shades.jpg",
    imageAlt: "Exterior shades filtering sunset light over an ocean-view patio"
  }
];

const commercialHomeHeroSlides = (): HomeHeroSlide[] => [
  {
    image: commercialModeImages.hero,
    imageAlt: "Commercial office windows fitted with neutral roller shades"
  },
  {
    image: commercialModeImages.conference,
    imageAlt: "Commercial conference room with dark blackout roller shades"
  },
  {
    image: commercialModeImages.storefront,
    imageAlt: "Commercial storefront fitted with solar roller shades"
  },
  {
    image: commercialModeImages.honeycomb,
    imageAlt: "Honeycomb cellular shades installed on commercial-style office windows"
  },
  {
    image: commercialModeImages.fauxWood,
    imageAlt: "Faux wood blinds installed in a professional office setting"
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
    image: commercialModeImages.classroom,
    imageAlt: "School facility room with cordless commercial roller shades"
  },
  {
    category: "Honeycomb Shades",
    title: "Cellular Shades For Offices",
    image: commercialModeImages.honeycomb,
    imageAlt: "Honeycomb cellular shades installed on commercial-style office windows"
  },
  {
    category: "Faux Wood Blinds",
    title: "Durable Blinds For Property Turns",
    image: commercialModeImages.fauxWood,
    imageAlt: "Faux wood blinds installed in a professional office setting"
  },
  {
    category: "Lobbies",
    title: "Solar Shades For Common Areas",
    image: commercialModeImages.lobby,
    imageAlt: "Commercial office lobby fitted with solar shades"
  },
  {
    category: "Conference Rooms",
    title: "Blackout Shades For Presentations",
    image: commercialModeImages.conference,
    imageAlt: "Commercial conference room with blackout roller shades"
  }
];

export function PageSections({ page }: { page: SitePage }) {
  const { isCommercialMode } = useCommercialMode();
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

function HomePageSections({ page, commercialMode }: { page: SitePage; commercialMode: boolean }) {
  const stories = commercialMode ? commercialPortfolioStories : portfolioStories;
  const installedPhotos = commercialMode ? commercialInstalledPortfolioPhotos : installedPortfolioPhotos;
  const sections = commercialMode ? commercialHomeSections : page.sections;
  const heroSlides = commercialMode ? commercialHomeHeroSlides() : homeHeroSlides(page);
  const heroTitle = commercialMode ? "Commercial shade systems for every workspace" : "Proudly serving Ventura County for the last 30 years";
  const heroCta = commercialMode ? "Commercial Shade Audit" : "Free In-Home Consultations";
  const heroHref = commercialMode ? "/commercial-window-coverings/" : "/book-consultation/";

  return (
    <>
      <section className="home-editorial">
        <div className="home-editorial-panel">
          <HomeHeroCarousel slides={heroSlides} />
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

      <section className="portfolio-scroll" aria-label={commercialMode ? "805 Commercial portfolio scenes" : "805 Shutters portfolio scenes"}>
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
