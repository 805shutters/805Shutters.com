"use client";

import { useEffect, useRef, type VideoHTMLAttributes } from "react";

type LazyVideoProps = VideoHTMLAttributes<HTMLVideoElement> & {
  src: string;
};

/** Autoplaying loop video that defers ALL network work until it nears the
 *  viewport (poster shows in the meantime). The homepage loops are multi-MB
 *  files below the fold — eager `preload="auto"` on them was the main cause
 *  of 20-30s mobile loads. Play/pause follows visibility so off-screen
 *  loops don't burn battery or bandwidth. */
export function LazyVideo({ src, ...videoProps }: LazyVideoProps) {
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
            void video.play().catch(() => undefined);
          } else {
            video.pause();
          }
        }
      },
      { rootMargin: "300px" }
    );

    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  return (
    <video ref={ref} muted loop playsInline preload="none" {...videoProps}>
      <source src={src} type="video/mp4" />
    </video>
  );
}
