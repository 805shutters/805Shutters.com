import { Metadata } from "next";
import { PageSections } from "@/components/PageSections";
import { homePage, ogDefaults, site } from "@/lib/site-data";

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
  return <PageSections page={homePage} />;
}
