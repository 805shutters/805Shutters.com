"use client";

import Link from "next/link";
import { ReactNode, useEffect, useState } from "react";

type UtmPreservingLinkProps = {
  children: ReactNode;
  className?: string;
  href: string;
};

const utmKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

function appendCurrentUtmParams(href: string) {
  const currentParams = new URLSearchParams(window.location.search);
  const url = new URL(href, window.location.origin);

  for (const key of utmKeys) {
    const value = currentParams.get(key);
    if (value && !url.searchParams.has(key)) {
      url.searchParams.set(key, value);
    }
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

export function UtmPreservingLink({ children, className, href }: UtmPreservingLinkProps) {
  const [trackedHref, setTrackedHref] = useState(href);

  useEffect(() => {
    setTrackedHref(appendCurrentUtmParams(href));
  }, [href]);

  return (
    <Link className={className} href={trackedHref}>
      {children}
    </Link>
  );
}
