"use client";

import { TenantImage } from "@/components/files/TenantImage";
import { useState } from "react";
import { motion } from "framer-motion";
import { Eye, EyeOff, Loader2, User, ArrowRight, AlertCircle } from "lucide-react";
import type { AuthState } from "../../app/(auth)/login/page";
import { AuthService } from "@/services/auth.service";
import { useAuthStore } from "@/store/auth.store";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface LoginStepProps {
  data: AuthState;
  onBack: () => void;
  onOrgRequired: (organizations: { id: string; name: string; organizationUrl: string | null }[], selectionToken: string) => void;
}

export function LoginStep({ data, onBack: _onBack, onOrgRequired }: LoginStepProps) {
  const router = useRouter();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    setError(null);
    try {
        const response = await AuthService.login(data.identifier, password, data.identifierType);

        if (response.requiresOrgSelection) {
            onOrgRequired(response.organizations, response.selectionToken);
            return;
        }

        if (response.workspaceUrl) { window.location.assign(response.workspaceUrl); return; }
        setAuth(response.user, response.accessToken);
        router.push(response.user.isAdminOrg && response.user.roleLevel === "SUPER_ADMIN" ? "/admin" : "/");
    } catch (err: any) {
        setError(err.message || "Incorrect password. Please try again.");
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
        {data.logoUrl ? (
          <TenantImage
            src={data.logoUrl}
            alt={data.orgName || "Organization"}
            className="h-16 w-auto max-w-[160px] object-contain mb-6"
          />
        ) : (
          <div className="h-12 w-12 bg-primary rounded-xl flex items-center justify-center mb-6 shadow-sm border border-muted-foreground">
            <span className="text-warning font-bold text-xl">
              {data.orgName ? data.orgName[0].toUpperCase() : "G"}
            </span>
          </div>
        )}
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono mb-2 text-center px-4 truncate w-full">
          {data.orgName || "Enterprise Tenant"}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-2 text-center">
          Welcome back, {data.name?.split(' ')[0] || 'User'}
        </h1>
      </div>

      <div className="bg-muted border border-border rounded-xl p-4 mb-6 flex items-center space-x-4">
        <div className="h-10 w-10 bg-info-subtle text-info rounded-full flex items-center justify-center shrink-0">
          <User className="h-5 w-5" />
        </div>
        <div className="overflow-hidden">
          <div className="text-xs text-muted-foreground mb-0.5 font-medium uppercase tracking-wider">Account</div>
          <div className="text-sm font-semibold text-foreground truncate">
            {data.identifier}
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-mono">Password</label>
            <Link
              href="/forgot-password"
              className="text-[11px] text-info hover:text-info font-medium"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-card border border-border rounded-lg text-sm focus:ring-2 focus:ring-ring/20 focus:border-ring outline-none transition-all font-mono placeholder:text-muted-foreground"
              placeholder="••••••••••••"
            />
            <Button variant="ghost"
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground transition-colors h-auto whitespace-normal"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="flex items-center text-danger text-xs font-medium"
          >
            <AlertCircle className="h-3.5 w-3.5 mr-1.5 shrink-0" />
            {error}
          </motion.div>
        )}

        <Button variant="ghost"
          type="submit"
          disabled={loading || !password}
          className="w-full bg-info hover:bg-info text-info-foreground py-3.5 rounded-lg text-sm font-medium transition-all shadow-sm disabled:opacity-70 flex items-center justify-center group h-auto whitespace-normal"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <span className="flex items-center">
              Login <ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </span>
          )}
        </Button>
      </form>

      <div className="mt-8 pt-6 border-t border-border flex items-center justify-center text-[10px] text-muted-foreground font-mono space-x-2 tracking-widest uppercase">
        <span>Gemba PMS</span>
        <span className="text-primary-foreground">|</span>
        <span>Enterprise Hub Security</span>
      </div>
    </motion.div>
  );
}
