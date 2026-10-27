/** Expensive performance reads refresh explicitly, without automatic retry bursts. */
export const performanceQueryOptions = {
  retry: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
} as const;
