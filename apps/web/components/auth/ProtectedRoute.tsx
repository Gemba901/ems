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
  const { user, isAuthenticated } = useAuthStore();
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    // Check if they are logged in at all
    if (!isAuthenticated || !user) {
      router.replace("/login");
      return;
    }

    // Check if the route requires specific roles
    if (allowedRoles && allowedRoles.length > 0) {
      if (!allowedRoles.includes(user.roleLevel)) {
        // Kick them to a generic dashboard or unauthorized page
        router.replace("/dashboard"); 
        return;
      }
    }

    // If they pass both checks, let them see the page
    setIsAuthorized(true);
  }, [isAuthenticated, user, allowedRoles, router]);

  // Prevent the "flash" of content while checking
  if (!isAuthorized) {
    // loading spinner
    return <div className="h-screen flex items-center justify-center">Loading...</div>;
  }

  return <>{children}</>;
}