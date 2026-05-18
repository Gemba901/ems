"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuthStore } from "@/store/auth.store";
import { EmsService } from "@/services/ems.service";
import { AlertCircle, X } from "lucide-react";
import { Role } from "@/types/role";

export function EmsCompletionBanner() {
  const { accessToken, user } = useAuthStore();
  const [completion, setCompletion] = useState<number | null>(null);
  const [dismissed, setDismissed]   = useState(false);

  useEffect(() => {
    if (!accessToken || !user) return;
    // Only fetch for non-admin/non-hr roles (employees, HOD, management)
    // Admins and HR see the full EMS dashboard instead
    const adminRoles: string[] = [Role.SUPER_ADMIN, Role.ADMIN, Role.HR];
    if (adminRoles.includes(user.roleLevel)) return;

    EmsService.getMyProfile(accessToken)
      .then(({ completion: c }) => { if (c.overall < 90) setCompletion(c.overall); })
      .catch(() => {});
  }, [accessToken, user]);

  if (!completion || dismissed) return null;

  return (
    <div className="mx-4 md:mx-8 mt-4 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center gap-3">
      <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
      <p className="text-sm text-amber-800 flex-1">
        Your employee profile is only{" "}
        <span className="font-bold">{completion}% complete</span>. Please visit{" "}
        <span className="font-semibold">HR</span> to have your data updated.{" "}
        <Link href="/ems/my-profile" className="underline font-medium hover:text-amber-900">
          View my profile
        </Link>
      </p>
      <button
        onClick={() => setDismissed(true)}
        className="shrink-0 text-amber-400 hover:text-amber-600 transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
