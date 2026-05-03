"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Building2, ArrowRight, Loader2 } from "lucide-react";
import type { AuthState } from "../../app/(auth)/login/page";
import { AuthService } from "@/services/auth.service";
import { useAuthStore } from "@/store/auth.store";
import { useRouter } from "next/navigation";

interface OrgPickerStepProps {
  data: AuthState;
  onBack: () => void;
}

export function OrgPickerStep({ data, onBack }: OrgPickerStepProps) {
  const router = useRouter();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const orgs = data.organizations ?? [];

  const handleSelect = async (orgId: string) => {
    if (!data.selectionToken) return;
    setSelected(orgId);
    setLoading(true);
    setError(null);

    try {
      const response = await AuthService.selectOrg(data.selectionToken, orgId);
      setAuth(response.user, response.accessToken);
      router.push(response.user.roleLevel === "SUPER_ADMIN" ? "/admin" : "/");
    } catch (err: any) {
      setError(err.message || "Failed to select organization.");
      setSelected(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="w-full sm:w-105 mx-auto p-8 bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100"
    >
      <div className="flex flex-col items-center mb-8">
        <div className="h-12 w-12 bg-slate-900 rounded-xl flex items-center justify-center mb-6 shadow-sm border border-slate-800">
          <Building2 className="h-6 w-6 text-amber-500" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mb-1 text-center">
          Choose Organization
        </h1>
        <p className="text-sm text-slate-500 text-center">
          Select the organization you want to sign into.
        </p>
      </div>

      <div className="space-y-3">
        {orgs.map((org) => (
          <button
            key={org.id}
            type="button"
            disabled={loading}
            onClick={() => handleSelect(org.id)}
            className={`w-full flex items-center justify-between px-4 py-4 rounded-xl border text-left transition-all group
              ${selected === org.id
                ? "border-blue-600 bg-blue-50 ring-2 ring-blue-600/20"
                : "border-slate-200 hover:border-blue-300 hover:bg-slate-50"
              } disabled:opacity-60`}
          >
            <div className="flex items-center space-x-3">
              <div className="h-9 w-9 bg-slate-900 rounded-lg flex items-center justify-center shrink-0">
                <span className="text-amber-500 font-bold text-sm">
                  {org.name[0].toUpperCase()}
                </span>
              </div>
              <span className="text-sm font-semibold text-slate-900">{org.name}</span>
            </div>

            {selected === org.id && loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
            ) : (
              <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-blue-500 transition-colors" />
            )}
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-4 text-xs text-red-500 text-center font-medium">{error}</p>
      )}

      <button
        type="button"
        onClick={onBack}
        disabled={loading}
        className="mt-6 w-full text-xs text-slate-400 hover:text-slate-600 transition-colors font-mono uppercase tracking-widest disabled:opacity-50"
      >
        Back
      </button>

      <div className="mt-6 pt-6 border-t border-slate-100 flex items-center justify-center text-[10px] text-slate-400 font-mono space-x-2 tracking-widest uppercase">
        <span>Gemba PMS</span>
        <span className="text-slate-200">|</span>
        <span>Enterprise Hub Security</span>
      </div>
    </motion.div>
  );
}
