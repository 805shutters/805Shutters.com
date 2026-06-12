import Link from "next/link";
import { commercialServices } from "@/lib/commercial-mode-data";
import { services } from "@/lib/site-data";

export function ServiceGrid({ commercialMode = false }: { commercialMode?: boolean }) {
  const activeServices = commercialMode ? commercialServices : services;

  return (
    <section className="content-wrap service-section">
      <p className="eyebrow">{commercialMode ? "Commercial services" : "Popular services"}</p>
      <h2>{commercialMode ? "Commercial Window Covering Services" : "Custom Window Treatment Services"}</h2>
      <div className="service-grid">
        {activeServices.map((service) => (
          <article className="service-card" key={`${service.slug}-${service.title}`}>
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
