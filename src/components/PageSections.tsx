import Link from "next/link";
import { LeadForm } from "./LeadForm";
import { ServiceGrid } from "./ServiceGrid";
import { TrackedPhoneLink } from "./TrackedPhoneLink";
import { AppointmentBooking } from "./booking/AppointmentBooking";
import { CrmHomeLogin } from "./crm/CrmHomeLogin";
import { HomeHeroCarousel, type HomeHeroSlide } from "./HomeHeroCarousel";
import { PortfolioBrowser } from "./PortfolioBrowser";
import { SitePage, site } from "@/lib/site-data";

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
    image: "/images/editorial-scroll/ai-shutters-arched-dining-room.jpg",
    imageAlt: "Arched dining room windows with custom plantation shutters and warm coastal light",
    imageWidth: 1672,
    imageHeight: 941,
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

const homeHeroSlides = (page: SitePage): HomeHeroSlide[] => [
  {
    image: page.image,
    imageAlt: page.imageAlt
  }
];

export function PageSections({ page }: { page: SitePage }) {
  if (page.path === "/") {
    return <HomePageSections page={page} />;
  }

  return (
    <>
      <section className="page-editorial">
        <div className="content-wrap page-editorial-panel">
          <div className="page-editorial-copy">
            <p className="eyebrow">{page.eyebrow}</p>
            <h1>{page.h1}</h1>
            <p className="lede">{page.intro}</p>
            <div className="hero-actions">
              <Link className="button primary" href="/free-window-treatment-consultation/">
                Free Consultation
              </Link>
              <TrackedPhoneLink className="button secondary hero-phone" location={`${page.path} hero`}>
                Call {site.phone}
              </TrackedPhoneLink>
            </div>
          </div>
          <div className="page-editorial-media">
            <img src={page.image} alt={page.imageAlt} />
          </div>
        </div>
      </section>

      {page.gallery?.length ? (
        <section className="content-wrap page-gallery" aria-label={`${page.h1} photos`}>
          {page.gallery.map((item) => (
            <figure className="page-gallery-item" key={item.image}>
              <img src={item.image} alt={item.imageAlt} loading="lazy" decoding="async" />
            </figure>
          ))}
        </section>
      ) : null}

      {page.path === "/gallery/" ? <PortfolioBrowser /> : null}

      {page.path === "/" ? <ServiceGrid /> : null}

      <section className="content-wrap section-stack">
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
          </article>
        ))}
      </section>

      {page.form ? (
        <section className="form-band">
          <div className="content-wrap form-layout">
            <div>
              <p className="eyebrow">Start here</p>
              <h2>Request Your Free Consultation</h2>
              <p>
                Send the project details and 805 Shutters will follow up. Prefer to talk now?{" "}
                <TrackedPhoneLink location={`${page.path} form copy`}>Call {site.phone}</TrackedPhoneLink>.
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
              <h2>{page.cta || "Schedule a free consultation"}</h2>
            </div>
            <div className="hero-actions">
              <Link className="button primary" href="/free-window-treatment-consultation/">
                Free Consultation
              </Link>
              <TrackedPhoneLink className="button secondary" location={`${page.path} cta`}>
                Call {site.phone}
              </TrackedPhoneLink>
            </div>
          </div>
        </section>
      )}
    </>
  );
}

function HomePageSections({ page }: { page: SitePage }) {
  return (
    <>
      <section className="home-editorial">
        <div className="home-editorial-panel">
          <HomeHeroCarousel slides={homeHeroSlides(page)} />
          <div className="home-hero-overlay">
            <h1 className="home-intro">Darken your space for true relaxation</h1>
            <div className="home-hero-actions">
              <Link className="button primary" href="/book-consultation/">
                Free In-Home Consultations
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="portfolio-scroll" aria-label="805 Shutters portfolio scenes">
        {portfolioStories.map((story, index) => (
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

      <PortfolioBrowser />

      <ServiceGrid />

      <section className="content-wrap section-stack">
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
            <AppointmentBooking />
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
