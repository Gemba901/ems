"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuthStore } from "@/store/auth.store";
import { EmsService } from "@/services/ems.service";
import { Role } from "@/types/role";
import { X } from "lucide-react";

function CircularProgress({ value }: { value: number }) {
  const radius = 24;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="relative h-12 w-12 sm:h-14 sm:w-14 shrink-0">
      <svg className="h-12 w-12 sm:h-14 sm:w-14 -rotate-90" viewBox="0 0 56 56">
        <circle
          cx="28"
          cy="28"
          r={radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="4"
        />
        <circle
          cx="28"
          cy="28"
          r={radius}
          fill="none"
          stroke="#f59e0b"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>

      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs sm:text-sm font-bold text-amber-600">
          {value}%
        </span>
      </div>
    </div>
  );
}

export function EmsCompletionBanner() {
  const { accessToken, user } = useAuthStore();

  const [completion, setCompletion] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!accessToken || !user) return;

    const adminRoles = [Role.SUPER_ADMIN, Role.ADMIN, Role.HR];
    if (adminRoles.includes(user.roleLevel)) return;

    EmsService.getMyProfile(accessToken)
      .then(({ completion: c }) => {
        if (c.overall < 90) setCompletion(c.overall);
      })
      .catch(() => {});
  }, [accessToken, user]);

  if (!completion || dismissed) return null;

  return (
    <div className="mx-3 sm:mx-6 lg:mx-8 mt-4">
      <div className="relative flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 rounded-2xl border border-gray-200 bg-white px-4 sm:px-5 py-4 shadow-sm">

        {/* Close Button */}
        <button
          onClick={() => setDismissed(true)}
          className="absolute right-2 top-2 text-gray-400 hover:text-gray-600"
          aria-label="Dismiss banner"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Top row on mobile: progress + text */}
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <CircularProgress value={completion} />

          <div className="min-w-0">
            <h3 className="text-sm sm:text-base font-semibold text-gray-900">
              Complete your employee profile
            </h3>

            <p className="mt-1 text-xs sm:text-sm text-gray-500 leading-snug">
              Add your personal details, emergency contacts, and employment
              information to unlock all HR services.
            </p>
          </div>
        </div>

        {/* CTA */}
        <div className="w-full sm:w-auto sm:ml-auto">
          <Link
            href="/ems/my-profile"
            className="w-full sm:w-auto inline-flex justify-center items-center rounded-xl bg-black px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-900"
          >
            Complete Profile
          </Link>
        </div>
      </div>
    </div>
  );
}