"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

export type HomeHeroSlide = {
  label?: string;
  tagline?: string;
  image: string;
  imageAlt: string;
  video?: string;
};

type HomeHeroCarouselProps = {
  slides: HomeHeroSlide[];
  rotationIntervalMs?: number;
};

type PreviewLayer = {
  image: string;
  key: number;
};

type PreviewState = {
  layers: PreviewLayer[];
  active: boolean;
};

export function HomeHeroCarousel({ slides, rotationIntervalMs = 0 }: HomeHeroCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [freezeOnFirstSlide, setFreezeOnFirstSlide] = useState(false);
  const [preview, setPreview] = useState<PreviewState>({ layers: [], active: false });
  const previewKeyRef = useRef(0);
  const carouselRef = useRef<HTMLDivElement>(null);
  const activeSlideCount = freezeOnFirstSlide ? Math.min(slides.length, 1) : slides.length;

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
    const videos = carouselRef.current?.querySelectorAll("video");

    videos?.forEach((video) => {
      if (video.closest(".home-hero-slide")?.classList.contains("is-active")) {
        void video.play().catch(() => undefined);
      } else {
        video.pause();
      }
    });
  }, [activeIndex, freezeOnFirstSlide]);

  useEffect(() => {
    setActiveIndex((current) => (activeSlideCount > 0 && current >= activeSlideCount ? 0 : current));
  }, [activeSlideCount]);

  useEffect(() => {
    if (rotationIntervalMs <= 0 || freezeOnFirstSlide || preview.active || activeSlideCount <= 1) {
      return;
    }

    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % activeSlideCount);
    }, rotationIntervalMs);

    return () => window.clearInterval(interval);
  }, [activeSlideCount, freezeOnFirstSlide, preview.active, rotationIntervalMs]);

  useEffect(() => {
    const showPreview = (event: Event) => {
      const image = (event as CustomEvent<{ image?: string }>).detail?.image;

      if (!image) {
        return;
      }

      setPreview((current) => {
        const top = current.layers[current.layers.length - 1];

        if (current.active && top?.image === image) {
          return current;
        }

        // Keep the still-visible top layer beneath the incoming one so
        // consecutive previews crossfade instead of flashing the hero.
        const layers = top?.image === image
          ? current.layers.slice(-1)
          : [...current.layers.slice(-1), { image, key: ++previewKeyRef.current }];

        return { layers, active: true };
      });
    };
    const clearPreview = () => setPreview((current) => (current.active ? { ...current, active: false } : current));

    window.addEventListener("805:hero-preview", showPreview);
    window.addEventListener("805:hero-preview-clear", clearPreview);

    return () => {
      window.removeEventListener("805:hero-preview", showPreview);
      window.removeEventListener("805:hero-preview-clear", clearPreview);
    };
  }, []);

  useEffect(() => {
    if (preview.active || preview.layers.length === 0) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setPreview((current) => (current.active ? current : { layers: [], active: false }));
    }, 360);

    return () => window.clearTimeout(timeout);
  }, [preview]);

  // Once the top layer's fade-in has finished covering the previous one,
  // drop the hidden lower layer. A timer (rather than animationend) keeps
  // this reliable when animations are skipped, e.g. reduced motion.
  useEffect(() => {
    if (preview.layers.length < 2) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setPreview((current) =>
        current.layers.length > 1 ? { ...current, layers: current.layers.slice(-1) } : current
      );
    }, 420);

    return () => window.clearTimeout(timeout);
  }, [preview.layers]);

  const renderedSlides = freezeOnFirstSlide ? slides.slice(0, 1) : slides;
  const previousIndex = renderedSlides.length > 1 ? (activeIndex - 1 + renderedSlides.length) % renderedSlides.length : activeIndex;
  const nextIndex = renderedSlides.length > 1 ? (activeIndex + 1) % renderedSlides.length : activeIndex;
  const shouldLoadSlide = (index: number) =>
    rotationIntervalMs > 0 || renderedSlides.length <= 3 || index === activeIndex || index === previousIndex || index === nextIndex;

  return (
    <div className="home-hero-media home-hero-carousel" aria-hidden="true" ref={carouselRef}>
      {renderedSlides.map((slide, index) => {
        const loadSlide = shouldLoadSlide(index);

        return (
          <div className={`home-hero-slide${index === activeIndex ? " is-active" : ""}`} key={slide.label || slide.video || slide.image}>
            {slide.video && loadSlide ? (
              <video autoPlay={index === activeIndex} loop muted playsInline poster={slide.image} preload={index === activeIndex ? "auto" : "none"}>
                <source src={slide.video} type="video/mp4" />
              </video>
            ) : loadSlide ? (
              <Image
                className="home-hero-image"
                src={slide.image}
                alt={slide.imageAlt}
                fill
                sizes="100vw"
                preload={index === 0}
                quality={85}
              />
            ) : null}
          </div>
        );
      })}
      {preview.layers.map((layer) => (
        <div
          className={`home-hero-preview${preview.active ? " is-active" : ""}`}
          key={layer.key}
          style={{ backgroundImage: `url(${layer.image})` }}
        />
      ))}
    </div>
  );
}
