import Link from "next/link";
import { site } from "@/lib/site-data";

const navItems = [
  ["Services", "/window-treatments/"],
  ["Shutters", "/shutters/"],
  ["Shades", "/shades/"],
  ["Blinds", "/blinds/"],
  ["Gallery", "/gallery/"],
  ["Contact", "/contact/"]
];

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link className="brand" href="/">
        {site.shortName}
      </Link>
      <nav className="primary-nav" aria-label="Primary navigation">
        {navItems.map(([label, href]) => (
          <Link key={href} href={href}>
            {label}
          </Link>
        ))}
      </nav>
      <a className="header-phone" href={site.phoneHref}>
        {site.phone}
      </a>
    </header>
  );
}
