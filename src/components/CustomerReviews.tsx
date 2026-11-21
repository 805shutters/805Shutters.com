import { verifiedCustomerReviews } from "@/lib/customer-reviews";
import { site } from "@/lib/site-data";

export function CustomerReviews() {
  return (
    <section className="content-wrap customer-reviews" aria-labelledby="customer-reviews-heading">
      <p className="eyebrow">Customer experiences</p>
      <h2 id="customer-reviews-heading">From our customers on Yelp</h2>
      <p>Excerpts from customer reviews of 805 Shutters.</p>
      <div className="customer-review-grid">
        {verifiedCustomerReviews.map(review => <figure key={review.id}>
          <p className="customer-review-rating" aria-label={`${review.rating} out of 5 stars`}>
            <span aria-hidden="true">★★★★★</span>
          </p>
          <blockquote>“{review.text}”</blockquote>
          <figcaption>
            <strong>{review.userName}</strong> · <time dateTime={review.date}>{review.dateLabel}</time>
            <br /><a href={review.url}>Customer review on Yelp</a>
          </figcaption>
        </figure>)}
      </div>
      <div className="customer-review-links">
        <a href={site.social.yelp}>Read more reviews on Yelp</a>
        <a href={site.googleMaps.url}>Find us on Google</a>
      </div>
    </section>
  );
}
