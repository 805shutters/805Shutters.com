"use client";

import { useEffect } from "react";

const topRevealY = 8;
const solidHeaderY = 48;
const revealDelta = -4;

type HeaderScrollClassState = {
  isSolid: boolean;
  shouldHide: boolean | null;
};

export function getHeaderScrollClassState(currentScrollY: number, lastScrollY: number): HeaderScrollClassState {
  const normalizedScrollY = Math.max(currentScrollY, 0);
  const scrollDelta = normalizedScrollY - Math.max(lastScrollY, 0);
  const isAtTop = normalizedScrollY <= topRevealY;

  if (isAtTop || scrollDelta < revealDelta) {
    return {
      isSolid: normalizedScrollY > solidHeaderY,
      shouldHide: false
    };
  }

  if (scrollDelta > 0) {
    return {
      isSolid: normalizedScrollY > solidHeaderY,
      shouldHide: true
    };
  }

  return {
    isSolid: normalizedScrollY > solidHeaderY,
    shouldHide: null
  };
}

export function HeaderScrollState() {
  useEffect(() => {
    let frame = 0;
    let lastScrollY = window.scrollY;
    const isHomePage = Boolean(document.querySelector(".home-editorial"));

    document.body.classList.toggle("home-page-active", isHomePage);

    function updateHeaderState() {
      frame = 0;
      const currentScrollY = Math.max(window.scrollY, 0);
      const classState = getHeaderScrollClassState(currentScrollY, lastScrollY);

      document.body.classList.toggle("site-header-solid", classState.isSolid);

      if (classState.shouldHide === false) {
        document.body.classList.remove("site-header-hidden");
      } else if (classState.shouldHide === true) {
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
