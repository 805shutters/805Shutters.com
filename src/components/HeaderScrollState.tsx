"use client";

import { useEffect } from "react";

export function HeaderScrollState() {
  useEffect(() => {
    let frame = 0;
    let lastScrollY = window.scrollY;
    const isHomePage = Boolean(document.querySelector(".home-editorial"));

    document.body.classList.toggle("home-page-active", isHomePage);

    function updateHeaderState() {
      frame = 0;
      const currentScrollY = Math.max(window.scrollY, 0);
      const scrollDelta = currentScrollY - lastScrollY;

      document.body.classList.toggle("site-header-solid", currentScrollY > 48);

      if (currentScrollY <= 96 || scrollDelta < -4) {
        document.body.classList.remove("site-header-hidden");
      } else if (scrollDelta > 6) {
        document.body.classList.add("site-header-hidden");
      }

      lastScrollY = currentScrollY;
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
      document.body.classList.remove("site-header-hidden");
      document.body.classList.remove("home-page-active");
    };
  }, []);

  return null;
}
