"use client";

import { useEffect, useState } from "react";

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

  useEffect(() => {
    if (slides.length < 2) {
      return;
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    if (reduceMotion.matches) {
      return;
    }

    const interval = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % slides.length);
    }, 5000);

    return () => window.clearInterval(interval);
  }, [slides.length]);

  return (
    <div className="home-hero-media home-hero-carousel" aria-hidden="true">
      {slides.map((slide, index) => (
        <div className={`home-hero-slide${index === activeIndex ? " is-active" : ""}`} key={slide.video || slide.image}>
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
