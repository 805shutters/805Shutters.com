"use client";

import { useState } from "react";
import Link from "next/link";
import { commercialBrand } from "@/lib/commercial-mode-data";
import { site } from "@/lib/site-data";
import { useCommercialMode } from "./CommercialModeProvider";
import { MobileActionBar } from "./MobileActionBar";
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

export function SiteFooter() {
  const { isCommercialMode } = useCommercialMode();
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

  return (
    <footer className="site-footer">
      <div className="footer-brand">
        {isCommercialMode ? (
          <span className="footer-commercial-wordmark" aria-label={commercialBrand.name}>
            <span>805</span>
            <strong>{commercialBrand.label}</strong>
          </span>
        ) : (
          <img
            src="/brand/805-shutters-logo-paper.png"
            alt="805 Shutters"
            width={262}
            height={209}
            loading="lazy"
            decoding="async"
          />
        )}
        <p>
          {isCommercialMode
            ? "Commercial roller shades, solar shades, blackout shades, and window coverings for offices, storefronts, schools, medical spaces, and property managers."
            : "Custom shutters, blinds, shades, drapery, and commercial window coverings across Ventura County."}
        </p>
        <address className="footer-nap" aria-label="805 Shutters local business information">
          <strong>{site.legalName}</strong>
          <span>
            Based in {site.locality}, {site.address.addressRegion}
          </span>
          <span>Serving {site.serviceArea}</span>
          <span>
            <TrackedPhoneLink location="footer local business information">{site.phone}</TrackedPhoneLink>
            <span aria-hidden="true"> • </span>
            <a href={site.emailHref}>{site.email}</a>
          </span>
        </address>
        <p className="footer-verification-note">
          <Link href={site.officialPath}>Verify official contact information</Link>
          <span>{site.nonAffiliationStatement}</span>
        </p>
        <div className="social-links footer-social" aria-label="Social links">
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
      <div className="footer-links">
        <Link href={site.officialPath}>Official contact</Link>
        <Link href="/free-window-treatment-consultation/">Free consultation</Link>
        <Link href="/financing/">Financing</Link>
        <Link href="/best-window-treatments-ventura-county/">Window treatment guide</Link>
        <Link href="/reviews/">Reviews</Link>
        <Link href="/faq/">FAQ</Link>
        <Link href="/privacy-policy/">Privacy Policy</Link>
        <TrackedPhoneLink location="footer">{site.phone}</TrackedPhoneLink>
      </div>
      <MobileActionBar />
    </footer>
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
