"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Eye, EyeOff, Loader2, User, ArrowRight } from "lucide-react";
import type { AuthState } from "../../app/(auth)/login/page"; 
import { AuthService } from "@/services/auth.service";
import { useAuthStore } from "@/store/auth.store"; 
import { useRouter } from "next/navigation";

interface LoginStepProps {
  data: AuthState;
  onBack: () => void;
  onOrgRequired: (organizations: { id: string; name: string }[], selectionToken: string) => void;
}

export function LoginStep({ data, onBack: _onBack, onOrgRequired }: LoginStepProps) {
  const router = useRouter();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
        const response = await AuthService.login(data.identifier, password);

        if (response.requiresOrgSelection) {
            onOrgRequired(response.organizations, response.selectionToken);
            return;
        }

        setAuth(response.user, response.accessToken);
        router.push(response.user.roleLevel === "SUPER_ADMIN" ? "/admin" : "/");
    } catch (error: any) {
        alert(error.message || "Login failed. Please try again.");
    } finally {
        setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="w-full sm:w-105 p-8 bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100"
    >
      <div className="flex flex-col items-center mb-8">
        <div className="h-12 w-12 bg-slate-900 rounded-xl flex items-center justify-center mb-6 shadow-sm border border-slate-800">
           <span className="text-amber-500 font-bold text-xl">
             {data.orgName ? data.orgName[0].toUpperCase() : "G"}
           </span>
        </div>
        <div className="text-[10px] uppercase tracking-widest text-slate-500 font-mono mb-2 text-center px-4 truncate w-full">
          {data.orgName || "Enterprise Tenant"}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mb-2 text-center">
          Welcome back, {data.name?.split(' ')[0] || 'User'}
        </h1>
      </div>

      <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 mb-6 flex items-center space-x-4">
        <div className="h-10 w-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center shrink-0">
          <User className="h-5 w-5" />
        </div>
        <div className="overflow-hidden">
          <div className="text-xs text-slate-500 mb-0.5 font-medium uppercase tracking-wider">Account</div>
          <div className="text-sm font-semibold text-slate-900 truncate">
            {data.identifier}
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-[11px] uppercase tracking-wider text-slate-500 font-mono">Enter Password</label>
            <a href="#" className="text-[11px] uppercase tracking-wider text-blue-600 hover:text-blue-700 font-mono transition-colors">
              Forgot Password?
            </a>
          </div>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 outline-none transition-all font-mono placeholder:text-slate-300"
              placeholder="••••••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !password}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3.5 rounded-lg text-sm font-medium transition-all shadow-sm disabled:opacity-70 flex items-center justify-center group"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <span className="flex items-center">
              Login <ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </span>
          )}
        </button>
      </form>

      <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-center text-[10px] text-slate-400 font-mono space-x-2 tracking-widest uppercase">
        <span>Gemba PMS</span>
        <span className="text-slate-200">|</span>
        <span>Enterprise Hub Security</span>
      </div>
    </motion.div>
  );
}