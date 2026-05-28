"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useOrgModules } from "@/hooks/useOrgModules";

interface ModuleGuardProps {
    moduleKey: string;
    children: React.ReactNode;
}

export function ModuleGuard({ moduleKey, children }: ModuleGuardProps) {
    const router = useRouter();
    const { modules, isLoading, hasModule } = useOrgModules();

    useEffect(() => {
        if (!isLoading && modules.length >= 0 && !hasModule(moduleKey)) {
            router.replace("/");
        }
    }, [isLoading, modules, moduleKey, hasModule, router]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="h-6 w-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!hasModule(moduleKey)) {
        return null;
    }

    return <>{children}</>;
}
