import { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageSections } from "@/components/PageSections";
import { allPages, commercialCityName, getPageBySlug, ogDefaults, site, slugForPath } from "@/lib/site-data";
import {
  commercialSubPageJsonLd,
  commercialWindowCoveringsJsonLd,
  faqPageJsonLd,
  servicePageJsonLd
} from "@/lib/structured-data";

type PageProps = {
  params: Promise<{
    slug: string[];
  }>;
};

export function generateStaticParams() {
  return allPages
    .filter((page) => page.path !== "/")
    .map((page) => ({
      slug: slugForPath(page.path)
    }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = getPageBySlug(slug);

  if (!page) {
    return {};
  }

  return {
    title: page.title,
    description: page.description,
    alternates: {
      canonical: page.path
    },
    robots: page.noIndex ? { index: false, follow: false } : undefined,
    openGraph: {
      ...ogDefaults,
      title: page.title,
      description: page.description,
      url: `${site.baseUrl}${page.path}`,
      images: [
        {
          url: page.image,
          alt: page.imageAlt
        }
      ]
    }
  };
}

export default async function DynamicPage({ params }: PageProps) {
  const { slug } = await params;
  const page = getPageBySlug(slug);

  if (!page) {
    notFound();
  }

  const pageJsonLd =
    page.path === "/commercial-window-coverings/"
      ? commercialWindowCoveringsJsonLd(page)
      : page.path.includes("commercial")
        ? commercialSubPageJsonLd(page, commercialCityName(page.path))
        : page.path === "/faq/"
          ? faqPageJsonLd(page)
          : page.faqs?.length
            ? servicePageJsonLd(page)
            : null;

  return (
    <>
      {pageJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(pageJsonLd)
          }}
        />
      ) : null}
      <PageSections page={page} />
    </>
  );
}
