"use client";

import Link from "next/link";
import { commercialBrand } from "@/lib/commercial-mode-data";
import { site } from "@/lib/site-data";
import { useCommercialMode } from "./CommercialModeProvider";
import { TrackedPhoneLink } from "./TrackedPhoneLink";

export function SiteFooter() {
  const { isCommercialMode } = useCommercialMode();

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
          />
        )}
        <p>
          {isCommercialMode
            ? "Commercial roller shades, solar shades, blackout shades, and window coverings for offices, storefronts, schools, medical spaces, and property managers."
            : "Custom shutters, blinds, shades, drapery, and commercial window coverings across Ventura County."}
        </p>
      </div>
      <div className="footer-links">
        <Link href="/free-window-treatment-consultation/">Free consultation</Link>
        <Link href="/reviews/">Reviews</Link>
        <Link href="/faq/">FAQ</Link>
        <Link href="/privacy-policy/">Privacy Policy</Link>
        <TrackedPhoneLink location="footer">{site.phone}</TrackedPhoneLink>
      </div>
    </footer>
  );
}
