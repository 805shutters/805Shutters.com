import Link from "next/link";
import { site } from "@/lib/site-data";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div>
        <strong>{site.name}</strong>
        <p>Custom shutters, shades, blinds, and commercial window coverings across Ventura County.</p>
      </div>
      <div className="footer-links">
        <Link href="/free-window-treatment-consultation/">Free consultation</Link>
        <Link href="/reviews/">Reviews</Link>
        <Link href="/faq/">FAQ</Link>
        <a href={site.phoneHref}>{site.phone}</a>
      </div>
    </footer>
  );
}
