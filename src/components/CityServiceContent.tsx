import { citySearchIntros, cityServiceLinks } from "@/lib/city-service-content";

export function CityServiceLinks({ path }: { path: string }) {
  const block = cityServiceLinks(path);
  if (!block?.links.length) return null;
  const Heading = block.hub ? "h2" : "h3";
  return (
    <section className="content-wrap section-stack" aria-label={block.heading}>
      <div className="copy-block">
        <Heading>{block.heading}</Heading>
        <ul className="tag-list">
          {block.links.map((page) => <li key={page.path}><a href={page.path}>{page.label}</a></li>)}
        </ul>
      </div>
    </section>
  );
}

export function CitySearchIntro({ path }: { path: string }) {
  const intro = citySearchIntros[path];
  if (!intro) return null;
  return (
    <>
      {intro.photos?.length ? (
        <section className="content-wrap page-gallery" aria-label="805 Shutters installation photos">
          {intro.photos.map((photo) => (
            <figure className="page-gallery-item" key={photo.image}>
              <img src={photo.image} alt={photo.alt} loading="lazy" decoding="async" />
            </figure>
          ))}
        </section>
      ) : null}
      <section className="content-wrap section-stack" aria-label={intro.heading}>
        <div className="copy-block">
          <h2>{intro.heading}</h2>
          <p>{intro.body}</p>
        </div>
      </section>
    </>
  );
}
