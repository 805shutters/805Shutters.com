import { Fragment } from "react";
import Link from "next/link";
import { site } from "@/lib/site-data";
import { TrackedPhoneLink } from "./TrackedPhoneLink";

const categoryItems = [
  ["Blinds", "/blinds/"],
  ["Shades", "/shades/"],
  ["Drapery", "/drapery/"],
  ["Shutters", "/shutters/"],
  ["Exterior Shades", "/exterior-shades/"]
];

export function SiteHeader() {
  return (
    <header className="site-header-shell">
      <div className="promo-strip">
        <Link href="/free-window-treatment-consultation/">
          Free Measure
        </Link>
        <span aria-hidden="true">|</span>
        <Link href="/free-window-treatment-consultation/">
          Free Consultation
        </Link>
        <span aria-hidden="true">›</span>
      </div>

      <div className="site-masthead">
        <div className="masthead-contact-left">
          <div className="social-links" aria-label="Social links">
            <a href={site.social.facebook} aria-label="805 Shutters on Facebook" target="_blank" rel="noreferrer">
              <FacebookIcon />
            </a>
            <a href={site.social.instagram} aria-label="805 Shutters on Instagram" target="_blank" rel="noreferrer">
              <InstagramIcon />
            </a>
          </div>
        </div>
        <Link className="brand" href="/" aria-label={site.name}>
          <img
            className="brand-logo"
            src="/brand/805-shutters-logo-header-transparent.png"
            alt="805 Shutters"
            width={227}
            height={148}
          />
        </Link>
        <div className="masthead-actions">
          <div className="phone-stack">
            <Link className="masthead-link masthead-email" href={site.emailHref}>
              {site.email}
            </Link>
            <TrackedPhoneLink className="header-phone" location="header">
              {site.phone}
            </TrackedPhoneLink>
            <span className="phone-note">CALL * TEXT</span>
          </div>
        </div>
      </div>

      <nav className="category-nav" aria-label="Primary navigation">
        {categoryItems.map(([label, href], index) => (
          <Fragment key={href}>
            {index > 0 ? <span className="category-dot" aria-hidden="true">•</span> : null}
            <Link href={href}>
              {label}
            </Link>
          </Fragment>
        ))}
      </nav>
    </header>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M14.4 8.2h2.1V5.5c-.4-.1-1.6-.2-2.9-.2-2.9 0-4.8 1.7-4.8 4.9v2.3H5.6v3h3.2v7.2h3.2v-7.2h3.1l.5-3h-3.6v-2c0-.9.2-1.5 1.5-1.5h.9z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7.5 2.8h9c2.6 0 4.7 2.1 4.7 4.7v9c0 2.6-2.1 4.7-4.7 4.7h-9c-2.6 0-4.7-2.1-4.7-4.7v-9c0-2.6 2.1-4.7 4.7-4.7zm0 2C6.6 4.8 4.8 6.6 4.8 7.5v9c0 .9 1.8 2.7 2.7 2.7h9c.9 0 2.7-1.8 2.7-2.7v-9c0-.9-1.8-2.7-2.7-2.7h-9z" />
      <path d="M12 7.4a4.6 4.6 0 1 1 0 9.2 4.6 4.6 0 0 1 0-9.2zm0 2a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2z" />
      <path d="M17 6.7a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2z" />
    </svg>
  );
}
