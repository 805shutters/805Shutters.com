"use client";

import { ReactNode } from "react";
import { trackPhoneClick } from "@/lib/client-tracking";
import { site } from "@/lib/site-data";

type TrackedPhoneLinkProps = {
  className?: string;
  location: string;
  children?: ReactNode;
};

export function TrackedPhoneLink({ className, location, children }: TrackedPhoneLinkProps) {
  return (
    <a className={className} href={site.phoneHref} onClick={() => trackPhoneClick(location)}>
      {children || site.phone}
    </a>
  );
}
