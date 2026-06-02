import Link from "next/link";
import { site } from "@/lib/site-data";

export default function NotFound() {
  return (
    <section className="not-found-wrap">
      <div className="content-wrap narrow">
        <p className="eyebrow">Page not found</p>
        <h1>That page is not in the rebuild yet</h1>
        <p className="lede">
          Use the main service pages or call {site.phone} for custom shutters, shades, blinds, and
          commercial window coverings.
        </p>
        <div className="hero-actions">
          <Link className="button primary" href="/">
            Home
          </Link>
          <Link className="button secondary" href="/contact/">
            Contact
          </Link>
        </div>
      </div>
    </section>
  );
}
