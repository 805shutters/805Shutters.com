import type { Metadata } from "next";

export function privatePageMetadata(title: string): Metadata {
  return {
    title,
    alternates: {
      canonical: null
    },
    robots: {
      index: false,
      follow: false
    }
  };
}
