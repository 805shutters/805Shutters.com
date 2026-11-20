"use client";

import { useEffect } from "react";
import { contactChannelFromHref } from "@/lib/meta-click";
import { trackMetaContact } from "@/lib/client-tracking";

export function MetaContactClicks() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.dataset.metaContact === "tracked") return;
      const channel = contactChannelFromHref(anchor.getAttribute("href") || "");
      if (!channel) return;
      trackMetaContact(channel);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return null;
}
