"use client";

import { usePathname } from "next/navigation";
import { SessionProvider } from "@/contexts/SessionProvider";

export function SessionBoundary({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // This data-free route has its own server-side production gate. Kit review
  // must work even when the API/session service is unavailable.
  if (pathname === "/dev/ui") return <>{children}</>;
  return <SessionProvider>{children}</SessionProvider>;
}
