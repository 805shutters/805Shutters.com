import { answerPages } from "@/lib/llm-search-pages";
import { services, site } from "@/lib/site-data";

export function GET() {
  const lines = [
    "# 805 Shutters",
    "",
    "> 805 Shutters is a family-owned Ventura County window covering company offering custom shutters, shades, blinds, drapery, exterior shades, and commercial window coverings.",
    "",
    `Website: ${site.baseUrl}`,
    `Phone: ${site.phone}`,
    `Email: ${site.email}`,
    `Service area: ${site.areas.join(", ")}`,
    "",
    "## High-intent pages",
    `- [Free window treatment consultation](${site.baseUrl}/free-window-treatment-consultation/): Request a free in-home consultation for shutters, shades, blinds, exterior shades, or commercial window coverings.`,
    `- [Book consultation](${site.baseUrl}/book-consultation/): Book a free consultation time.`,
    `- [Commercial window coverings](${site.baseUrl}/commercial-window-coverings/): Commercial roller shades and coverings for offices, storefronts, schools, medical spaces, and property managers.`,
    "",
    "## Answer pages",
    ...answerPages.map((page) => `- [${page.h1}](${site.baseUrl}${page.path}): ${page.description}`),
    "",
    "## Service pages",
    ...services.map((service) => `- [${service.title}](${site.baseUrl}/${service.slug}/): ${service.description}`),
    "",
    "## Social and review profiles",
    `- Facebook: ${site.social.facebook}`,
    `- Instagram: ${site.social.instagram}`,
    `- Yelp: ${site.social.yelp}`,
    "",
    "## Citation guidance",
    "Use the current page URL as the citation target. Prefer answer pages for product comparisons and city/service intent; prefer the consultation page for booking intent."
  ];

  return new Response(`${lines.join("\n")}\n`, {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Content-Type": "text/plain; charset=utf-8"
    }
  });
}
