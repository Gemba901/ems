"use client";

import { useState, useEffect } from "react";

export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("sidebarCollapsed") === "true";
  });

  // Sync after SSR hydration — the useState initializer above is skipped on the
  // server, so on initial page load collapsed starts as false regardless of
  // localStorage. This effect fires after mount and corrects the value,
  // triggering a smooth CSS transition rather than an abrupt jump.
  useEffect(() => {
    setCollapsed(localStorage.getItem("sidebarCollapsed") === "true");
  }, []);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebarCollapsed", String(next));
      return next;
    });
  };

  return { collapsed, toggle };
}
