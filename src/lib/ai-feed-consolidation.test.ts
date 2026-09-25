import { describe, expect, it } from "vitest";
import { GET as llms } from "@/app/llms.txt/route";
import { buildAiSearchFeed, buildAiSiteIndexFeed, buildAnswerCitationFeed } from "./ai-search-data";
import { answerPages } from "./llm-search-pages";

const oldPaths = [
  "/shutters/fillmore/", "/blinds/fillmore-ca/", "/blinds/moorpark-ca/",
  "/blinds/oak-park-ca/", "/drapery/oak-park-ca/", "/shutters/santa-paula/",
  "/shades/santa-paula-ca/", "/shades/simi-valley-ca/", "/blinds/thousand-oaks-ca/",
  "/custom-drapery-curtains-ventura-county/"
];

describe("consolidated pages in AI feeds", () => {
  it("omits all ten old URLs from every feed and retains both held shade cities", async () => {
    const index = buildAiSiteIndexFeed();
    const feeds = [await llms().text(), JSON.stringify(buildAiSearchFeed()), JSON.stringify(index), JSON.stringify(buildAnswerCitationFeed())];
    for (const feed of feeds) for (const path of oldPaths) expect(feed).not.toContain(path);
    for (const path of ["/shades/thousand-oaks-ca/", "/shades/ventura-ca/"]) {
      expect(index.pages.some((page) => page.path === path)).toBe(true);
    }
  });

  it("preserves the drapery answer and FAQ wording while citing the final hub", () => {
    const page = answerPages.find((page) => page.path === "/custom-drapery-curtains-ventura-county/")!;
    const feed = buildAnswerCitationFeed();
    const citations = feed.answers.filter((answer) => answer.pageTitle === page.title);
    expect(citations.map((item) => item.answer)).toEqual([page.answer, ...page.faqs.map((faq) => faq.answer)]);
    expect(citations.map((item) => item.question)).toEqual([page.h1, ...page.faqs.map((faq) => faq.question)]);
    for (const item of citations) {
      expect(item.citationPath).toBe("/drapery/");
      expect(item.citationUrl).toBe("https://www.805shutters.com/drapery/");
    }
    expect(feed.sourcePages.find((item) => item.slug === page.slug)?.url).toBe("https://www.805shutters.com/drapery/");
  });
});
