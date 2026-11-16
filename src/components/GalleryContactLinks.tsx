import Link from "next/link";

export function GalleryContactLinks() {
  return (
    <nav className="gallery-contact-links" aria-label="Gallery and contact">
      <Link href="/gallery/">Gallery</Link>
      <Link href="/contact/">Contact Us</Link>
    </nav>
  );
}
