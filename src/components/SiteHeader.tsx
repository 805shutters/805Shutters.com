"use client";

import { Fragment, useRef, useState } from "react";
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
  const { isCommercialMode } = useCommercialMode();
  const isHome = pathname === "/";
  const activeCategoryItems = isCommercialMode ? commercialCategoryItems : residentialCategoryItems;
  const brandName = isCommercialMode ? commercialBrand.name : site.name;
  const preloadedCategories = useRef(new Set<string>());
  const brandLabel = isCommercialMode ? commercialBrand.label : "SHUTTERS";
  const [yelpReviews, setYelpReviews] = useState<YelpReview[]>([]);
  const [yelpReviewStatus, setYelpReviewStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");

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

  return (
    <header className="site-header-shell">
      <HeaderScrollState />
      <div className="site-masthead">
        <div className="mobile-header-tools mobile-header-tools--left" aria-label="Mobile navigation">
          <CommercialModeBadge />
          <Link className="mobile-book-link" href="/book-consultation/" aria-label="Book an appointment">
            <CalendarIcon />
            <span>Book Here</span>
          </Link>
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
                aria-label="805 Shutters on Yelp"
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
              width={1532}
              height={974}
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
