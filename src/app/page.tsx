import { Metadata } from "next";
import { preload } from "react-dom";
import { PageSections } from "@/components/PageSections";
import { homeHeroImage, homePage, images, ogDefaults, site } from "@/lib/site-data";

export const metadata: Metadata = {
  title: homePage.title,
  description: homePage.description,
  alternates: {
    canonical: "/"
  },
  openGraph: {
    ...ogDefaults,
    title: homePage.title,
    description: homePage.description,
    url: site.baseUrl,
    images: [
      {
        url: homePage.image,
        alt: homePage.imageAlt
      }
    ]
  }
};

export default function HomePage() {
  // Both hero layers render as CSS background-images, which the browser only
  // discovers after CSS parses — preload them so the LCP paint isn't delayed.
  // images.hero is .home-editorial-panel's backdrop; homeHeroImage is the
  // first carousel slide drawn on top of it.
  preload(images.hero, { as: "image", fetchPriority: "high" });
  preload(homeHeroImage, { as: "image", fetchPriority: "high" });
  return <PageSections page={homePage} />;
}
