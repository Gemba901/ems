"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";
import { Role } from "@/types/role";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: Role[];
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, isAuthenticated, _hasHydrated } = useAuthStore();
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    if (!_hasHydrated) return;
    if (!isAuthenticated || !user) {
      router.replace("/login");
      return;
    }
    if (allowedRoles && allowedRoles.length > 0) {
      if (!allowedRoles.includes(user.roleLevel)) {
        router.replace("/");
        return;
      }
    }
    setIsAuthorized(true);
  }, [_hasHydrated, isAuthenticated, user, allowedRoles, router]);

  // Prevent the "flash" of content while checking
  if (!isAuthorized) {
    // loading spinner
    return <div className="h-screen flex items-center justify-center">Loading...</div>;
  }

  return <>{children}</>;
}