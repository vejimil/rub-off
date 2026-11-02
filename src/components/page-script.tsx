"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

// Marks the page as scripted (so reveals may start hidden) and reveals [data-reveal] and [data-deal]
// elements once, as they come into view. Runs again after each client navigation.
export function PageScript() {
  const path = usePathname();
  useEffect(() => {
    document.documentElement.classList.add("js");
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.1 },
    );
    document.querySelectorAll("[data-reveal]:not(.is-in), [data-deal]:not(.is-in)").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [path]);
  return null;
}
