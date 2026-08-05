import { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageSections } from "@/components/PageSections";
import {
  allPages,
  commercialCityName,
  getPageBySlug,
  ogDefaults,
  site,
  slugForPath,
  type SitePage
} from "@/lib/site-data";
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

function isLocalServicePage(path: string) {
  return /^\/(shutters|shades|blinds|drapery|window-coverings|window-treatments)\/[^/]+\/$/.test(path);
}

export function pageJsonLdFor(page: SitePage) {
  if (page.path === "/commercial-window-coverings/") {
    return commercialWindowCoveringsJsonLd(page);
  }

  if (page.path.includes("commercial")) {
    return commercialSubPageJsonLd(page, commercialCityName(page.path));
  }

  if (page.path === "/faq/") {
    return faqPageJsonLd(page);
  }

  if (page.faqs?.length || isLocalServicePage(page.path)) {
    return servicePageJsonLd(page);
  }

  return null;
}

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

  const pageJsonLd = pageJsonLdFor(page);

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
