"use client";

import { useState } from "react";

export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(true);

  const toggle = () => {
    setCollapsed((prev) => !prev);
  };

  return { collapsed, toggle };
}
