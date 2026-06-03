import Link from "next/link";
import { site } from "@/lib/site-data";
import { TrackedPhoneLink } from "./TrackedPhoneLink";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-brand">
        <img
          src="/brand/805-shutters-logo-paper.png"
          alt="805 Shutters"
          width={262}
          height={209}
        />
        <p>Custom shutters, blinds, shades, drapery, and commercial window coverings across Ventura County.</p>
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
