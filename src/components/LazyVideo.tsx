"use client";

import { useEffect, useRef, type VideoHTMLAttributes } from "react";

type LazyVideoProps = VideoHTMLAttributes<HTMLVideoElement> & {
  src: string;
};

/** Autoplaying loop video that defers ALL network work until it nears the
 *  viewport, including the poster image. The homepage loops are multi-MB
 *  files below the fold — eager `preload="auto"` on them was the main cause
 *  of 20-30s mobile loads. Play/pause follows visibility so off-screen
 *  loops don't burn battery or bandwidth. */
export function LazyVideo({ src, poster, ...videoProps }: LazyVideoProps) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            if (poster && video.getAttribute("poster") !== poster) video.setAttribute("poster", poster);
            if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
              void video.play().catch(() => undefined);
            }
          } else {
            video.pause();
          }
        }
      },
      { rootMargin: "300px" }
    );

    observer.observe(video);
    return () => observer.disconnect();
  }, [poster]);

  return (
    <video ref={ref} muted loop playsInline preload="none" {...videoProps}>
      <source src={src} type="video/mp4" />
    </video>
  );
}
