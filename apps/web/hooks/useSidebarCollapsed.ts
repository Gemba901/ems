"use client";

import { useState, useEffect } from "react";

export function useSidebarCollapsed() {
  // Always start false — must match the server render to avoid hydration errors.
  // The effect below corrects the value after mount using a smooth CSS transition.
  const [collapsed, setCollapsed] = useState(false);

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
