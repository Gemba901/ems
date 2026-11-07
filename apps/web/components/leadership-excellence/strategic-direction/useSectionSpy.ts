"use client";

import { useEffect } from "react";

/** Section ids on the company-direction page, in order. LexSidebar links to each one. */
export const EDITOR_SECTIONS = [
  "organisation",
  "vision-section",
  "mission-section",
  "values-section",
  "pillars-section",
  "review-section",
];

/** The employee read view has no review section. */
export const READER_SECTIONS = EDITOR_SECTIONS.slice(0, 5);

/**
 * Keeps the URL hash in step with the section in view, so the sidebar highlights it (prototype
 * one-page navigation). Also lands on the section from the URL once it has rendered: the /pillars and
 * /preview redirects use this. `watch` re-scans when the content changes, e.g. after the draft loads.
 */
export function useSectionSpy(ids: string[], watch?: unknown) {
  useEffect(() => {
    let frame = 0;
    const setHash = (id: string) => {
      if (window.location.hash.slice(1) === id) return;
      history.replaceState(history.state, "", `#${id}`);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    };
    // Current section: the last one whose top has passed 30% of the viewport; the last one at the page end.
    const update = () => {
      frame = 0;
      const els = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
      if (!els.length) return;
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      const line = window.innerHeight * 0.3;
      const current = atEnd
        ? els[els.length - 1]
        : (els.filter((el) => el.getBoundingClientRect().top <= line).pop() ?? els[0]);
      setHash(current.id);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    // Wait out the router's and browser's own scroll restoration, which reset to the top after mount.
    const target = window.location.hash.slice(1);
    const landing = window.setTimeout(() => {
      const el = ids.includes(target) ? document.getElementById(target) : null;
      el?.scrollIntoView();
      window.addEventListener("scroll", onScroll, { passive: true });
      if (!el) update();
    }, 120);

    return () => {
      window.clearTimeout(landing);
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, [ids, watch]);
}
