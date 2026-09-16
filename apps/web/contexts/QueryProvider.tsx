"use client";

import { useAuthStore } from "@/store/auth.store";

import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000, // 5 minutes
          },
        },
      }),
  );

  useEffect(() => useAuthStore.subscribe((state, previous) => {
    if (state.user?.userId !== previous.user?.userId || state.user?.organizationId !== previous.user?.organizationId) queryClient.clear();
  }), [queryClient]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
