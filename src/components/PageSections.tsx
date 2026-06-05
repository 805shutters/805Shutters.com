import Link from "next/link";
import { LeadForm } from "./LeadForm";
import { ServiceGrid } from "./ServiceGrid";
import { TrackedPhoneLink } from "./TrackedPhoneLink";
import { AppointmentBooking } from "./booking/AppointmentBooking";
import { CrmHomeLogin } from "./crm/CrmHomeLogin";
import { SitePage, site } from "@/lib/site-data";

const portfolioStories = [
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
    eyebrow: "Shutters",
    title: "Dining rooms with a better line.",
    body:
      "Plantation shutters make repeated windows feel intentional, balanced, and finished.",
    image: "/images/portfolio-enhanced/plantation-shutters-dining-room-wide.jpg",
    imageAlt: "White plantation shutters installed in a Ventura County dining room",
    href: "/shutters/"
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
    eyebrow: "Shutters",
    title: "Specialty shapes, measured precisely.",
    body:
      "Arched openings need custom planning so the shutter follows the room instead of fighting it.",
    image: "/images/portfolio-enhanced/specialty-arch-window-shutters-wide.jpg",
    imageAlt: "Specialty arch window shutters custom fit in a Ventura County home",
    href: "/shutters/"
  },
  {
    eyebrow: "Shutters",
    title: "Reading rooms with warmth.",
    body:
      "Dark wood shutters make a smaller room feel grounded while keeping daylight adjustable.",
    image: "/images/portfolio-enhanced/dark-wood-plantation-shutters-reading-room-wide.jpg",
    imageAlt: "Dark wood plantation shutters in a Ventura County reading room",
    href: "/shutters/"
  }
];

const installedPortfolioPhotos = [
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
          <div className="home-hero-media">
            <img src={page.image} alt={page.imageAlt} />
          </div>
          <div className="home-hero-overlay">
            <h1 className="home-intro">Proudly serving Ventura County for the last 30 years</h1>
            <div className="home-hero-actions">
              <Link className="button primary" href="/book-consultation/">
                Free In-Home Consultations
              </Link>
              <TrackedPhoneLink className="button secondary" location="home hero">
                Call {site.phone}
              </TrackedPhoneLink>
            </div>
          </div>
        </div>
      </section>

      <section className="portfolio-scroll" aria-label="805 Shutters portfolio scenes">
        {portfolioStories.map((story, index) => (
          <article className="portfolio-story-panel" key={story.title}>
            <div className="portfolio-story-media">
              {"video" in story ? (
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
          <p className="eyebrow">Installed Portfolio</p>
          <h2>Shutters and shades from recent Ventura County projects</h2>
        </div>
        <div className="content-wrap installed-portfolio-grid">
          {installedPortfolioPhotos.map((photo) => (
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
