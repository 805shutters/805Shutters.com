import Link from "next/link";
import { LeadForm } from "./LeadForm";
import { ServiceGrid } from "./ServiceGrid";
import { SitePage, site } from "@/lib/site-data";

export function PageSections({ page }: { page: SitePage }) {
  return (
    <>
      <section className="page-hero" style={{ backgroundImage: `url(${page.image})` }}>
        <div className="hero-shade">
          <div className="content-wrap hero-copy">
            <p className="eyebrow">{page.eyebrow}</p>
            <h1>{page.h1}</h1>
            <p className="lede">{page.intro}</p>
            <div className="hero-actions">
              <Link className="button primary" href="/free-window-treatment-consultation/">
                Free Consultation
              </Link>
              <a className="button secondary hero-phone" href={site.phoneHref}>
                Call {site.phone}
              </a>
            </div>
          </div>
        </div>
      </section>

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
                <a href={site.phoneHref}>Call {site.phone}</a>.
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
              <a className="button secondary" href={site.phoneHref}>
                Call {site.phone}
              </a>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
