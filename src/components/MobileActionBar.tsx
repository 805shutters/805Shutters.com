"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TrackedPhoneLink } from "./TrackedPhoneLink";

/** Fixed call/book bar shown only on small screens (see .mobile-action-bar in
 *  globals.css). Hidden on the booking and quote flows where it would be
 *  redundant or cover the working UI. */
export function MobileActionBar() {
  const pathname = usePathname() || "";
  if (pathname.startsWith("/book-consultation") || pathname.startsWith("/quote")) {
    return null;
  }

  return (
    <div className="mobile-action-bar">
      <TrackedPhoneLink className="mobile-action-bar__call" location="mobile action bar" ariaLabel="Call 805 Shutters">
        Call
      </TrackedPhoneLink>
      <Link className="mobile-action-bar__book" href="/book-consultation/">
        Book Free Consultation
      </Link>
    </div>
  );
}
