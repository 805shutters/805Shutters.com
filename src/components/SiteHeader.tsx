"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { commercialBrand, commercialModeImages } from "@/lib/commercial-mode-data";
import { site } from "@/lib/site-data";
import { CommercialModeBadge, useCommercialMode } from "./CommercialModeProvider";
import { HeaderScrollState } from "./HeaderScrollState";
import { TrackedPhoneLink } from "./TrackedPhoneLink";

const categoryItems = [
  {
    label: "Blinds",
    href: "/blinds/",
    products: [
      { label: "Faux Wood", image: "/images/805-portfolio-blinds-office.jpg" },
      { label: "Premium Wood", image: "/ads/805-custom-blinds-1x1.jpg" },
      { label: "Vertical Blinds", image: "/ads/805-custom-blinds-9x16.jpg" },
      { label: "Aluminum Blinds", image: "/images/805-portfolio-blinds-office.jpg" }
    ]
  },
  {
    label: "Shades",
    href: "/shades/",
    products: [
      { label: "Roller Shades", image: "/images/editorial-scroll/coastal-living-roller-shades.jpg" },
      { label: "Honeycomb Shades", image: "/images/editorial-scroll/room-darkening-honeycomb-shades.png" },
      { label: "Room Darkening", image: "/images/editorial-scroll/room-darkening-honeycomb-shades.png" },
      { label: "Layered Shades", image: "/images/portfolio-enhanced/layered-shades-bedroom-window-wide.jpg" },
      { label: "Roman Shades", image: "/assets/ai-concepts/homepage-feed/raw-review/raw-ai-option-20-roman-shades-white-living-room.jpg" },
      { label: "Natural Shades", image: "/images/editorial-scroll/breakfast-room-woven-shades.jpg" },
      { label: "Bamboo Shades", image: "/images/editorial-scroll/garden-living-woven-shades.jpg" },
      { label: "Sheer Shades", image: "/images/805-portfolio-shades-bedroom.jpg" }
    ]
  },
  {
    label: "Drapery",
    href: "/drapery/",
    products: [
      { label: "Ripplefold Drapery", image: "/images/805-portfolio-drapery-living-room.jpg" },
      { label: "Pinch Pleat Drapery", image: "/images/editorial-scroll/poolside-bedroom-roller-shades.jpg" },
      { label: "French Pleat Drapery", image: "/images/editorial-scroll/garden-living-woven-shades.jpg" },
      { label: "Grommet Drapery", image: "/assets/ai-concepts/homepage-feed/raw-review/raw-ai-option-19-roman-shades-coastal-striped.jpg" },
      { label: "Rod Pocket Drapery", image: "/images/805-portfolio-drapery-living-room.jpg" },
      { label: "Goblet Pleat Drapery", image: "/images/editorial-scroll/poolside-bedroom-roller-shades.jpg" },
      { label: "Inverted Box Pleat Drapery", image: "/images/editorial-scroll/garden-living-woven-shades.jpg" }
    ]
  },
  {
    label: "Shutters",
    href: "/shutters/",
    products: [
      { label: "Premium Stained Wood", image: "/images/portfolio-enhanced/dark-wood-plantation-shutters-reading-room-wide.jpg" },
      { label: "Painted Wood", image: "/images/portfolio-enhanced/uploaded-office-plantation-shutters-wide.jpg" },
      { label: "Poly Composite", image: "/images/portfolio-enhanced/bedroom-sliding-door-shutters-wide.jpg" },
      { label: "MDF Composite", image: "/images/portfolio-enhanced/arched-window-custom-shutters-wide.jpg" }
    ]
  },
  {
    label: "Exterior Shades",
    href: "/exterior-shades/",
    products: [
      { label: "Motorized Patio", image: "/images/editorial-scroll/sunset-patio-exterior-shades.jpg" },
      { label: "Non Motorized Patio", image: "/images/editorial-scroll/ocean-terrace-exterior-shades.jpg" }
    ]
  }
];

const commercialCategoryItems = [
  {
    label: "Roller Shades",
    href: "/commercial-roller-shades/",
    products: [
      { label: "Office Roller Shades", image: commercialModeImages.hero },
      { label: "Blackout Roller Shades", image: commercialModeImages.conference },
      { label: "Motorized Roller Shades", image: commercialModeImages.lobby },
      { label: "Tenant Improvement Shades", image: commercialModeImages.conference }
    ]
  },
  {
    label: "Solar Shades",
    href: "/commercial-window-coverings/",
    products: [
      { label: "Glare Control", image: commercialModeImages.storefront },
      { label: "Heat Control", image: commercialModeImages.lobby },
      { label: "Street-Facing Glass", image: commercialModeImages.storefront }
    ]
  },
  {
    label: "Honeycomb",
    href: "/commercial-window-coverings/",
    products: [
      { label: "Office Honeycomb Shades", image: commercialModeImages.honeycomb },
      { label: "Room-Darkening Honeycomb", image: commercialModeImages.honeycomb },
      { label: "Privacy Cellular Shades", image: commercialModeImages.medical }
    ]
  },
  {
    label: "Faux Wood",
    href: "/commercial-window-coverings/",
    products: [
      { label: "Office Faux Wood Blinds", image: commercialModeImages.fauxWood },
      { label: "Rental Turn Blinds", image: commercialModeImages.fauxWood },
      { label: "Staff Area Blinds", image: commercialModeImages.classroom }
    ]
  },
  {
    label: "Shade Audit",
    href: "/commercial-window-coverings/",
    products: [
      { label: "Property Managers", image: commercialModeImages.lobby },
      { label: "Schools And Facilities", image: commercialModeImages.classroom },
      { label: "Medical Offices", image: commercialModeImages.medical },
      { label: "Product Mix Review", image: commercialModeImages.fauxWood }
    ]
  }
];

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
  const activeCategoryItems = isCommercialMode ? commercialCategoryItems : categoryItems;
  const brandName = isCommercialMode ? commercialBrand.name : site.name;
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

  const showHeroPreview = (image: string) => {
    if (!isHome) {
      return;
    }

    window.dispatchEvent(new CustomEvent("805:hero-preview", { detail: { image } }));
  };

  const clearHeroPreview = () => {
    if (isHome) {
      window.dispatchEvent(new CustomEvent("805:hero-preview-clear"));
    }
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
          <CommercialModeBadge />
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
                <img
                  className="yelp-wordmark"
                  src="/brand/yelp-wordmark.png"
                  alt=""
                  width={206}
                  height={86}
                />
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
        <Link className="brand" href="/" aria-label={brandName}>
          <span className="brand-text-logo" aria-hidden="true">
            <span className="brand-text-logo-number">805</span>
            <span className="brand-text-logo-name">{brandLabel}</span>
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
            <span className="category-nav-item">
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
