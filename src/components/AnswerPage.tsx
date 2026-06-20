import Link from "next/link";
import { TrackedPhoneLink } from "./TrackedPhoneLink";
import { answerPageJsonLd } from "@/lib/structured-data";
import type { AnswerPage as AnswerPageData } from "@/lib/llm-search-pages";
import { site } from "@/lib/site-data";
import styles from "./AnswerPage.module.css";

export function AnswerPage({ page }: { page: AnswerPageData }) {
  return (
    <article className={styles.answerPage}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(answerPageJsonLd(page))
        }}
      />

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>{page.eyebrow}</p>
          <h1>{page.h1}</h1>
          <p className={styles.directAnswer}>{page.answer}</p>
          <div className={styles.actions}>
            <Link className="button primary" href="/free-window-treatment-consultation/">
              Free Consultation
            </Link>
            <TrackedPhoneLink className="button secondary" location={`${page.path} hero`}>
              Call {site.phone}
            </TrackedPhoneLink>
          </div>
        </div>
        <figure className={styles.heroMedia}>
          <img src={page.image} alt={page.imageAlt} />
          <figcaption>Updated {formatDate(page.updated)} for Ventura County window covering research.</figcaption>
        </figure>
      </section>

      <section className={styles.sectionList} aria-label={`${page.h1} guide`}>
        {page.sections.map((section) => (
          <section className={styles.contentSection} key={section.heading}>
            <h2>{section.heading}</h2>
            <p>{section.body}</p>
            {section.bullets ? (
              <ul>
                {section.bullets.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </section>

      <section className={styles.faqBand} aria-labelledby="answer-page-faq">
        <div className={styles.faqHead}>
          <p className={styles.eyebrow}>Quick answers</p>
          <h2 id="answer-page-faq">Questions people ask before booking.</h2>
        </div>
        <div className={styles.faqGrid}>
          {page.faqs.map((faq) => (
            <section className={styles.faqItem} key={faq.question}>
              <h3>{faq.question}</h3>
              <p>{faq.answer}</p>
            </section>
          ))}
        </div>
      </section>

      <section className={styles.relatedBand} aria-label="Related 805 Shutters pages">
        <div>
          <p className={styles.eyebrow}>Next step</p>
          <h2>Compare products with a local installer.</h2>
        </div>
        <div className={styles.relatedLinks}>
          {page.relatedLinks.map((link) => (
            <Link href={link.href} key={link.href}>
              {link.label}
            </Link>
          ))}
        </div>
      </section>
    </article>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${value}T00:00:00Z`));
}
