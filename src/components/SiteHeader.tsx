"use client";

import { Fragment, useEffect, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { commercialBrand } from "@/lib/commercial-mode-data";
import { commercialCategoryItems, residentialCategoryItems } from "@/lib/product-preview-data";
import { site } from "@/lib/site-data";
import { CommercialModeBadge, useCommercialMode } from "./CommercialModeProvider";
import { HeaderScrollState } from "./HeaderScrollState";
import { TrackedPhoneLink } from "./TrackedPhoneLink";

type YelpReview = {
  id: string;
  rating: number;
  text: string;
  url: string;
  timeCreated: string;
  userName: string;
  userImageUrl?: string;
};

type YelpReviewsResponse = {
  reviews?: YelpReview[];
};

export function SiteHeader() {
  const pathname = usePathname();
  const { isCommercialMode, toggleCommercialMode } = useCommercialMode();
  const isHome = pathname === "/";
  const activeCategoryItems = isCommercialMode ? commercialCategoryItems : residentialCategoryItems;
  const brandName = isCommercialMode ? commercialBrand.name : site.name;
  const preloadedCategories = useRef(new Set<string>());
  const brandLabel = isCommercialMode ? commercialBrand.label : "SHUTTERS";
  const [yelpReviews, setYelpReviews] = useState<YelpReview[]>([]);
  const [yelpReviewStatus, setYelpReviewStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the mobile menu whenever navigation lands on a new route.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // While the drawer is open, lock page scroll and allow Escape to close it.
  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    document.documentElement.classList.add("mobile-menu-open");
    window.addEventListener("keydown", handleKey);

    return () => {
      document.documentElement.classList.remove("mobile-menu-open");
      window.removeEventListener("keydown", handleKey);
    };
  }, [menuOpen]);

  const loadYelpReviews = () => {
    if (yelpReviewStatus !== "idle") {
      return;
    }

    setYelpReviewStatus("loading");
    fetch("/api/yelp/reviews")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Yelp reviews request failed");
        }

        return (await response.json()) as YelpReviewsResponse;
      })
      .then((payload) => {
        setYelpReviews(payload.reviews || []);
        setYelpReviewStatus("loaded");
      })
      .catch((error) => {
        console.error(error);
        setYelpReviewStatus("error");
      });
  };

  const showHeroPreview = (image?: string) => {
    if (!isHome || !image) {
      return;
    }

    window.dispatchEvent(new CustomEvent("805:hero-preview", { detail: { image } }));
  };

  const clearHeroPreview = () => {
    if (isHome) {
      window.dispatchEvent(new CustomEvent("805:hero-preview-clear"));
    }
  };

  // Warm the browser cache for a category's preview photos as soon as the
  // visitor reaches its nav item, so the first hero preview doesn't pop in.
  const preloadCategoryImages = (categoryLabel: string, products: { image?: string }[]) => {
    if (!isHome || preloadedCategories.current.has(categoryLabel)) {
      return;
    }

    preloadedCategories.current.add(categoryLabel);
    products.forEach((product) => {
      if (product.image) {
        const img = new Image();
        img.decoding = "async";
        img.src = product.image;
      }
    });
  };

  // On the homepage the "About Us" link smooth-scrolls to the About band instead
  // of doing a hash navigation; on every other page it falls back to /#about.
  const scrollToAbout = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isHome) {
      return;
    }
    const target = document.getElementById("about");
    if (target) {
      event.preventDefault();
      target.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <>
      <header className="site-header-shell">
      <HeaderScrollState />
      <div className="site-masthead">
        <div className="mobile-header-tools mobile-header-tools--left" aria-label="Mobile navigation">
          <button
            type="button"
            className="mobile-menu-toggle"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen(true)}
          >
            <HamburgerIcon />
          </button>
        </div>
        <div className="masthead-contact-left">
          <div className="masthead-route-actions">
            <CommercialModeBadge />
            <CalendarRouteLink className="header-calendar-link--with-commercial" />
          </div>
          <div className="social-links" aria-label="Social links">
            <a href={site.social.facebook} aria-label="805 Shutters on Facebook" target="_blank" rel="noreferrer">
              <FacebookIcon />
            </a>
            <a href={site.social.instagram} aria-label="805 Shutters on Instagram" target="_blank" rel="noreferrer">
              <InstagramIcon />
            </a>
            <span className="social-link-with-panel" onMouseEnter={loadYelpReviews} onFocus={loadYelpReviews}>
              <a
                className="social-link-yelp"
                href={site.social.yelp}
                aria-label={`805 Shutters on Yelp, rated ${site.reviews.yelpRating} out of 5`}
                aria-describedby="yelp-review-preview"
                target="_blank"
                rel="noreferrer"
              >
                <span className="yelp-text-mark" aria-hidden="true">
                  <span className="yelp-text">yelp</span>
                  <span className="yelp-burst">
                    <span />
                    <span />
                    <span />
                    <span />
                    <span />
                  </span>
                  <span className="yelp-rating">{site.reviews.yelpRating}</span>
                </span>
              </a>
              <span className="yelp-review-popover" id="yelp-review-preview">
                <span className="yelp-review-title">Yelp reviews</span>
                {yelpReviewStatus === "loading" ? (
                  <span className="yelp-review-note">Loading review excerpts...</span>
                ) : yelpReviews.length ? (
                  <span className="yelp-review-list">
                    {yelpReviews.map((review) => (
                      <span className="yelp-review-item" key={review.id}>
                        <span className="yelp-review-stars" aria-label={`${review.rating} star Yelp review`}>
                          {"★".repeat(Math.max(0, Math.min(5, review.rating)))}
                        </span>
                        <span className="yelp-review-text">{review.text}</span>
                        <span className="yelp-review-author">{review.userName}</span>
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className="yelp-review-note">Open Yelp for current customer reviews.</span>
                )}
                <span className="yelp-review-footer">View every review on Yelp</span>
              </span>
            </span>
          </div>
          <Link
            className="masthead-link masthead-about-link"
            href="/#about"
            onClick={scrollToAbout}
          >
            About Us
          </Link>
        </div>
        <Link className={`brand ${isCommercialMode ? "brand--commercial" : "brand--exact"}`} href="/" aria-label={brandName}>
          <span className="brand-text-logo" aria-hidden="true">
            <span className="brand-text-logo-number">805</span>
            <span className="brand-text-logo-name">{brandLabel}</span>
          </span>
          {!isCommercialMode && (
            <img
              className="brand-logo brand-logo-exact"
              src="/brand/805-shutters-logo-exact-transparent.png"
              alt="805 Shutters"
              width={286}
              height={270}
            />
          )}
        </Link>
        <div className="mobile-header-tools mobile-header-tools--right" aria-label="Mobile contact actions">
          <TrackedPhoneLink ariaLabel="Call 805 Shutters" className="mobile-header-icon" location="mobile header">
            <PhoneIcon />
          </TrackedPhoneLink>
        </div>
        <div className="masthead-actions">
          <CalendarRouteLink className="header-calendar-link--phone-row" />
          <div className="phone-stack">
            <Link className="masthead-link masthead-email" href={site.emailHref}>
              {site.email}
            </Link>
            <TrackedPhoneLink className="header-phone" location="header">
              {site.phone}
            </TrackedPhoneLink>
            <span className="phone-note">CALL • TEXT • EMAIL</span>
          </div>
        </div>
      </div>

      <nav
        id="primary-categories"
        className="category-nav category-nav--portfolio"
        aria-label="Primary navigation"
        onMouseLeave={clearHeroPreview}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            clearHeroPreview();
          }
        }}
      >
        {activeCategoryItems.map((item, index) => (
          <Fragment key={`${item.label}-${item.href}`}>
            {index > 0 ? <span className="category-dot" aria-hidden="true">•</span> : null}
            <span
              className="category-nav-item"
              onMouseEnter={() => preloadCategoryImages(item.label, item.products)}
              onFocus={() => preloadCategoryImages(item.label, item.products)}
            >
              <Link href={item.href}>{item.label}</Link>
              {isHome ? (
                <span className="category-nav-products" aria-label={`${item.label} product types`}>
                  <span className="category-nav-product-list">
                    {item.products.map((product) => (
                      <button
                        className="category-nav-product-button"
                        key={product.label}
                        type="button"
                        onClick={() => showHeroPreview(product.image)}
                        onFocus={() => showHeroPreview(product.image)}
                        onMouseEnter={() => showHeroPreview(product.image)}
                        onPointerEnter={() => showHeroPreview(product.image)}
                      >
                        {product.label}
                      </button>
                    ))}
                  </span>
                </span>
              ) : null}
            </span>
          </Fragment>
        ))}
      </nav>
      </header>

      <div className={`mobile-menu${menuOpen ? " is-open" : ""}`} id="mobile-menu">
        <button
          type="button"
          className="mobile-menu-backdrop"
          aria-label="Close menu"
          tabIndex={menuOpen ? 0 : -1}
          onClick={() => setMenuOpen(false)}
        />
        <div className="mobile-menu-panel" role="dialog" aria-modal="true" aria-label={`${brandName} menu`}>
          <div className="mobile-menu-head">
            <span className="mobile-menu-eyebrow">{brandName}</span>
            <button
              type="button"
              className="mobile-menu-close"
              aria-label="Close menu"
              onClick={() => setMenuOpen(false)}
            >
              <CloseIcon />
            </button>
          </div>

          <Link className="mobile-menu-book" href="/book-consultation/" onClick={() => setMenuOpen(false)}>
            <CalendarIcon />
            <span>Book a Consultation</span>
          </Link>

          <nav className="mobile-menu-nav" aria-label="Mobile primary navigation">
            {activeCategoryItems.map((item) => (
              <Link key={`menu-${item.href}`} href={item.href} onClick={() => setMenuOpen(false)}>
                {item.label}
              </Link>
            ))}
            <Link href="/reviews/" onClick={() => setMenuOpen(false)}>
              Reviews
            </Link>
            <Link href="/gallery/" onClick={() => setMenuOpen(false)}>
              Gallery
            </Link>
            <Link href="/about/" onClick={() => setMenuOpen(false)}>
              About
            </Link>
            <Link href="/faq/" onClick={() => setMenuOpen(false)}>
              FAQ
            </Link>
            <Link href="/contact/" onClick={() => setMenuOpen(false)}>
              Contact
            </Link>
          </nav>

          <div className="mobile-menu-foot">
            <button
              type="button"
              className={`commercial-mode-badge mobile-menu-commercial${isCommercialMode ? " active" : ""}`}
              aria-pressed={isCommercialMode}
              onClick={toggleCommercialMode}
            >
              {isCommercialMode ? "Switch to residential" : "805 Commercial"}
            </button>
            <TrackedPhoneLink className="mobile-menu-phone" location="mobile menu">
              {site.phone}
            </TrackedPhoneLink>
          </div>
        </div>
      </div>
    </>
  );
}

function CalendarRouteLink({ className = "" }: { className?: string }) {
  return (
    <Link
      className={`header-calendar-link${className ? ` ${className}` : ""}`}
      href="/book-consultation/"
      aria-label="Book a free in-home consultation"
    >
      <CalendarIcon />
      <span>Calendar</span>
    </Link>
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

function HamburgerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M3 6h18" />
      <path d="M3 12h18" />
      <path d="M3 18h18" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6 6l12 12" />
      <path d="M18 6l-12 12" />
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
