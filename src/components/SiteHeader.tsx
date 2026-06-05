import { Fragment } from "react";
import Link from "next/link";
import { site } from "@/lib/site-data";
import { HeaderScrollState } from "./HeaderScrollState";
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
      <HeaderScrollState />
      <div className="site-masthead">
        <div className="mobile-header-tools mobile-header-tools--left" aria-label="Mobile navigation">
          <Link className="mobile-book-link" href="/book-consultation/" aria-label="Book an appointment">
            <CalendarIcon />
            <span>Book Here</span>
          </Link>
        </div>
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
          <span className="brand-text-logo" aria-hidden="true">
            <span className="brand-text-logo-number">805</span>
            <span className="brand-text-logo-name">SHUTTERS</span>
          </span>
          <img
            className="brand-logo"
            src="/brand/805-shutters-logo-header.png"
            alt="805 Shutters"
            width={227}
            height={148}
          />
        </Link>
        <div className="mobile-header-tools mobile-header-tools--right" aria-label="Mobile contact actions">
          <TrackedPhoneLink ariaLabel="Call 805 Shutters" className="mobile-header-icon" location="mobile header">
            <PhoneIcon />
          </TrackedPhoneLink>
        </div>
        <div className="masthead-actions">
          <Link className="header-calendar-link" href="/book-consultation/" aria-label="Book a free in-home consultation">
            <CalendarIcon />
            <span>Calendar</span>
          </Link>
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

      <nav id="primary-categories" className="category-nav" aria-label="Primary navigation">
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

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7 2v4" />
      <path d="M17 2v4" />
      <path d="M4 9h16" />
      <path d="M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
      <path d="M8 13h3v3H8z" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M10.7 5.2 7.4 7.8c-.8.6-1.1 1.8-.7 2.7 3 7.1 7.7 11.8 14.8 14.8.9.4 2.1.1 2.7-.7l2.6-3.3c.5-.7.4-1.7-.2-2.3l-3.4-3.1c-.6-.5-1.5-.6-2.1-.2l-2.5 1.5c-1.9-1-3.4-2.5-4.4-4.4l1.5-2.5c.4-.7.3-1.5-.2-2.1l-3.1-3.4c-.6-.6-1.6-.7-2.3-.2z" />
    </svg>
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
