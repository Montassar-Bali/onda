"use client";
import { useEffect } from "react";

/**
 * Staggered entrance for [data-reveal] elements. Content is never left hidden:
 *  - without script nothing is hidden (the CSS only hides under html.js);
 *  - elements added after mount (streaming, client navigation) are picked up by a MutationObserver;
 *  - a safety timer reveals anything still hidden after 1.5 s.
 */
export function Reveal() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("js");
    const seen = new WeakSet<Element>();
    const io = new IntersectionObserver((entries) => {
      let i = 0;
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target as HTMLElement;
        el.style.setProperty("--d", `${(i++ % 4) * 80}ms`);
        el.classList.add("in");
        io.unobserve(el);
      }
    }, { rootMargin: "0px 0px -8% 0px" });
    const watch = () => document.querySelectorAll<HTMLElement>("[data-reveal]:not(.in)").forEach((el) => { if (!seen.has(el)) { seen.add(el); io.observe(el); } });
    watch();
    const mo = new MutationObserver(watch);
    mo.observe(document.body, { childList: true, subtree: true });
    const safety = window.setTimeout(() => document.querySelectorAll("[data-reveal]:not(.in)").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight) el.classList.add("in");
    }), 1500);
    return () => { io.disconnect(); mo.disconnect(); window.clearTimeout(safety); };
  }, []);
  return null;
}
