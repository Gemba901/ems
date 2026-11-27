"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Building2, ArrowRight, Loader2 } from "lucide-react";
import type { AuthState } from "../../app/(auth)/login/page";
import { AuthService } from "@/services/auth.service";
import { useAuthStore } from "@/store/auth.store";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

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
      if (response.workspaceUrl) { window.location.assign(response.workspaceUrl); return; }
      setAuth(response.user, response.accessToken);
      router.push(response.user.isAdminOrg && response.user.roleLevel === "SUPER_ADMIN" ? "/admin" : "/");
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
      className="w-full sm:w-105 mx-auto p-8 bg-card rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-border"
    >
      <div className="flex flex-col items-center mb-8">
        <div className="h-12 w-12 bg-primary rounded-xl flex items-center justify-center mb-6 shadow-sm border border-muted-foreground">
          <Building2 className="h-6 w-6 text-warning" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-1 text-center">
          Choose Organization
        </h1>
        <p className="text-sm text-muted-foreground text-center">
          Select the organization you want to sign into.
        </p>
      </div>

      <div className="space-y-3">
        {orgs.map((org) => (
          <Button variant="ghost"
            key={org.id}
            type="button"
            disabled={loading}
            onClick={() => handleSelect(org.id)}
            className={`h-auto whitespace-normal w-full flex items-center justify-between px-4 py-4 rounded-xl border text-left transition-all group
              ${selected === org.id
                ? "border-info bg-info-subtle ring-2 ring-info/20"
                : "border-border hover:border-info/50 hover:bg-muted"
              } disabled:opacity-60`}
          >
            <div className="flex items-center space-x-3">
              <div className="h-9 w-9 bg-primary rounded-lg flex items-center justify-center shrink-0">
                <span className="text-warning font-bold text-sm">
                  {org.name[0].toUpperCase()}
                </span>
              </div>
              <span className="text-sm font-semibold text-foreground">{org.name}</span>
            </div>

            {selected === org.id && loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-info" />
            ) : (
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-info transition-colors" />
            )}
          </Button>
        ))}
      </div>

      {error && (
        <p className="mt-4 text-xs text-danger text-center font-medium">{error}</p>
      )}

      <Button variant="ghost"
        type="button"
        onClick={onBack}
        disabled={loading}
        className="mt-4 w-full text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 py-2 h-auto whitespace-normal"
      >
        ← Back
      </Button>

      <div className="mt-6 pt-6 border-t border-border flex items-center justify-center text-[10px] text-muted-foreground font-mono space-x-2 tracking-widest uppercase">
        <span>Gemba PMS</span>
        <span className="text-primary-foreground">|</span>
        <span>Enterprise Hub Security</span>
      </div>
    </motion.div>
  );
}
