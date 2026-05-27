"use client";

import { useState } from "react";

export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("sidebarCollapsed") === "true";
  });

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebarCollapsed", String(next));
      return next;
    });
  };

  return { collapsed, toggle };
}
