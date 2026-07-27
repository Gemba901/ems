"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { AuthService } from "@/services/auth.service";

export function useOrgModules() {
    const accessToken = useAuthStore((s) => s.accessToken);
    const hasHydrated = useAuthStore((s) => s._hasHydrated);

    const { data, isLoading } = useQuery({
        queryKey: ["org-modules"],
        queryFn: () => AuthService.getMyOrg(accessToken!),
        enabled: !!accessToken,
        staleTime: 5 * 60 * 1000,
    });

    return {
        modules: (data?.modules ?? []) as string[],
        isLoading,
        hasHydrated,
        hasModule: (key: string) => (data?.modules ?? []).includes(key),
    };
}
