"use client";

import { useEffect } from "react";

export function HeaderScrollState() {
  useEffect(() => {
    let frame = 0;

    function updateHeaderState() {
      frame = 0;
      document.body.classList.toggle("site-header-solid", window.scrollY > 48);
    }

    function scheduleUpdate() {
      if (frame) return;
      frame = window.requestAnimationFrame(updateHeaderState);
    }

    updateHeaderState();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      document.body.classList.remove("site-header-solid");
    };
  }, []);

  return null;
}
