import { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageSections } from "@/components/PageSections";
import { allPages, getPageBySlug, site, slugForPath } from "@/lib/site-data";

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

  return <PageSections page={page} />;
}
