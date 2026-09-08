"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";
import { Role } from "@/types/role";
import { Loader2 } from "lucide-react";

// Mirrors CONFIG_ADMIN_ROLES on the API — only Steel Admin/Management may
// reach Configuration. Planners are redirected back to Steel Home.
const CONFIG_ROLES = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT];

export default function SteelConfigLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, _hasHydrated } = useAuthStore();
  const router = useRouter();
  const authorized = _hasHydrated && isAuthenticated && !!user && CONFIG_ROLES.includes(user.roleLevel);

  useEffect(() => {
    if (!_hasHydrated) return;
    if (!isAuthenticated || !user) {
      router.replace("/login");
    } else if (!CONFIG_ROLES.includes(user.roleLevel)) {
      router.replace("/steel");
    }
  }, [_hasHydrated, isAuthenticated, user, router]);

  if (!authorized) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <>{children}</>;
}
