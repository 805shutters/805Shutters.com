"use client";

import { useEffect, useRef, useState } from "react";
import { site } from "@/lib/site-data";

type Review = { id: string; text: string; userName: string; url: string; rating: number };

export function CustomerReviews() {
  const section = useRef<HTMLElement>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      void fetch("/api/yelp/reviews", { signal: controller.signal })
        .then(response => response.ok ? response.json() : null)
        .then(data => {
          if (!Array.isArray(data?.reviews)) return;
          setReviews(data.reviews.filter((review: Review) =>
            typeof review.text === "string" && review.text.trim() &&
            typeof review.userName === "string" &&
            typeof review.url === "string" && /^https:\/\/(?:www\.)?yelp\.com\//.test(review.url)
          ).slice(0, 3));
        }).catch(() => {});
    }, { rootMargin: "200px" });
    if (section.current) observer.observe(section.current);
    return () => { observer.disconnect(); controller.abort(); };
  }, []);

  return (
    <section ref={section} className="content-wrap customer-reviews" aria-labelledby="customer-reviews-heading">
      <p className="eyebrow">Customer experiences</p>
      <h2 id="customer-reviews-heading">Read what our customers say</h2>
      <p>Explore customer reviews on Google and Yelp before planning your consultation.</p>
      {reviews.length > 0 && <div className="customer-review-grid">
        {reviews.map(review => <figure key={review.id}>
          <blockquote>{review.text}</blockquote>
          <figcaption>{review.userName} · <a href={review.url}>Read the review on Yelp</a></figcaption>
        </figure>)}
      </div>}
      <div className="customer-review-links">
        <a href={site.googleMaps.url}>Read Google reviews</a>
        <a href={site.social.yelp}>Read Yelp reviews</a>
      </div>
    </section>
  );
}
