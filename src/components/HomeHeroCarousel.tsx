"use client";

import { useEffect, useRef, useState } from "react";

export type HomeHeroSlide = {
  image: string;
  imageAlt: string;
  video?: string;
};

type HomeHeroCarouselProps = {
  slides: HomeHeroSlide[];
};

export function HomeHeroCarousel({ slides }: HomeHeroCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [freezeOnFirstSlide, setFreezeOnFirstSlide] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const staticHeroQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncStaticHero = () => {
      setFreezeOnFirstSlide(staticHeroQuery.matches);

      if (staticHeroQuery.matches) {
        setActiveIndex(0);
      }
    };

    syncStaticHero();

    if (typeof staticHeroQuery.addEventListener === "function") {
      staticHeroQuery.addEventListener("change", syncStaticHero);

      return () => staticHeroQuery.removeEventListener("change", syncStaticHero);
    }

    staticHeroQuery.addListener(syncStaticHero);

    return () => staticHeroQuery.removeListener(syncStaticHero);
  }, []);

  useEffect(() => {
    if (slides.length < 2 || freezeOnFirstSlide) {
      return;
    }

    const interval = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % slides.length);
    }, 5000);

    return () => window.clearInterval(interval);
  }, [freezeOnFirstSlide, slides.length]);

  useEffect(() => {
    const videos = carouselRef.current?.querySelectorAll("video");

    videos?.forEach((video) => {
      if (video.closest(".home-hero-slide")?.classList.contains("is-active")) {
        void video.play().catch(() => undefined);
      } else {
        video.pause();
      }
    });
  }, [activeIndex, freezeOnFirstSlide]);

  const renderedSlides = freezeOnFirstSlide ? slides.slice(0, 1) : slides;

  return (
    <div className="home-hero-media home-hero-carousel" aria-hidden="true" ref={carouselRef}>
      {renderedSlides.map((slide, index) => (
        <div className={`home-hero-slide${index === activeIndex ? " is-active" : ""}`} key={slide.video || slide.image}>
          {slide.video ? (
            <video autoPlay={index === activeIndex} loop muted playsInline poster={slide.image} preload={index === activeIndex ? "auto" : "metadata"}>
              <source src={slide.video} type="video/mp4" />
            </video>
          ) : (
            <div className="home-hero-image" style={{ backgroundImage: `url(${slide.image})` }} />
          )}
        </div>
      ))}
    </div>
  );
}
