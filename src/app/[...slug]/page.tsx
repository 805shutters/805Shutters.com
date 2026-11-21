import { editorialPage } from "@/lib/wordpress-editorial";
import { WordPressContent } from "@/components/WordPressContent";
import { normalizeStructuredData } from "@/lib/structured-data-identity";
import { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageSections } from "@/components/PageSections";
import {
  allPages,
  getPageBySlug,
  ogDefaults,
  site,
  slugForPath
} from "@/lib/site-data";
import { pageJsonLdFor } from "@/lib/page-json-ld";
import { pageSearchMetadata } from "@/lib/page-search-metadata";

type PageProps = {
  params: Promise<{
    slug: string[];
  }>;
};

function resolvePage(slug: string[]) {
  const original = getPageBySlug(slug);
  const editorial = original && editorialPage(original.path);
  if (!original || !editorial) return { page: original, editorial };

  return {
    page: {
      ...original,
      h1: editorial.title,
      intro: editorial.intro || original.intro,
      description: editorial.description || original.description
    },
    editorial
  };
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
  const { page } = resolvePage(slug);

  if (!page) {
    return {};
  }

  return {
    title: pageSearchMetadata[page.path]?.title ?? page.title,
    description: pageSearchMetadata[page.path]?.description ?? page.description,
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
  const { page, editorial } = resolvePage(slug);

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
            __html: JSON.stringify(normalizeStructuredData(pageJsonLd)).replace(/</g, "\\u003c")
          }}
        />
      ) : null}
      <PageSections page={page} editorial={editorial && <WordPressContent page={editorial} />} />
    </>
  );
}
