export type HomeHeroSlide = {
  image: string;
  imageAlt: string;
  video?: string;
};

type HomeHeroCarouselProps = {
  slides: HomeHeroSlide[];
};

export function HomeHeroCarousel({ slides }: HomeHeroCarouselProps) {
  return (
    <div className="home-hero-media home-hero-carousel" aria-hidden="true">
      {slides.map((slide) => (
        <div className="home-hero-slide" key={slide.video || slide.image}>
          {slide.video ? (
            <video autoPlay loop muted playsInline poster={slide.image} preload="auto">
              <source src={slide.video} type="video/mp4" />
            </video>
          ) : (
            <img src={slide.image} alt="" />
          )}
        </div>
      ))}
    </div>
  );
}
