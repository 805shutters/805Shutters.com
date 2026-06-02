import Link from "next/link";
import { services } from "@/lib/site-data";

export function ServiceGrid() {
  return (
    <section className="content-wrap service-section">
      <p className="eyebrow">Popular services</p>
      <h2>Custom Window Treatment Services</h2>
      <div className="service-grid">
        {services.map((service) => (
          <article className="service-card" key={service.slug}>
            <img src={service.image} alt={service.imageAlt} />
            <div>
              <h3>{service.title}</h3>
              <p>{service.description}</p>
              <Link href={`/${service.slug}/`}>Explore {service.shortTitle.toLowerCase()}</Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
