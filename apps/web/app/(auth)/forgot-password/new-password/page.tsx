"use client";

import { Suspense, useState } from "react";
import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Check, ArrowRight, ArrowLeft, Loader2, AlertCircle, CheckCircle2, ShieldCheck } from "lucide-react";
import { AuthService } from "@/services/auth.service";

function NewPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const validations = {
    length: password.length >= 8,
    mixed: /[A-Z]/.test(password) && /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };

  const strengthScore = Object.values(validations).filter(Boolean).length;
  const isMatch = password === confirmPassword && password.length > 0;
  const mismatch = confirmPassword.length > 0 && !isMatch;
  const canSubmit = strengthScore >= 3 && isMatch && !!token;

  const getStrengthLabel = () => {
    if (strengthScore <= 1) return { label: "Weak", color: "bg-red-500" };
    if (strengthScore === 2) return { label: "Moderate", color: "bg-amber-500" };
    return { label: "Strong", color: "bg-emerald-500" };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      await AuthService.setupAccount(token, password);
      setDone(true);
    } catch (err: any) {
      setError(err.message || "Failed to set your new password. Please start over from the forgot password page.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      className="min-h-screen flex items-center justify-center px-4 py-8 sm:p-6 font-sans"
      style={{
        background: "linear-gradient(135deg, #1a2744 0%, #0d1627 60%, #162040 100%)",
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full sm:w-105 mx-auto p-8 bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100"
      >
        {done ? (
          <div className="flex flex-col items-center text-center">
            <div className="h-12 w-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mb-6">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mb-2">
              You&apos;re all set
            </h1>
            <p className="text-sm text-slate-500 leading-relaxed mb-8">
              Your new password is active. Your temporary password has been invalidated and any other active sessions were signed out.
            </p>
            <button
              onClick={() => router.push("/login")}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3.5 rounded-lg text-sm font-medium transition-all shadow-sm flex items-center justify-center"
            >
              Continue to login
            </button>
          </div>
        ) : !token ? (
          <div className="flex flex-col items-center text-center">
            <div className="h-12 w-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mb-6">
              <AlertCircle className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mb-2">
              Missing verification
            </h1>
            <p className="text-sm text-slate-500 leading-relaxed mb-8">
              We couldn&apos;t find a verified session for this request. Please re-enter your temporary password first.
            </p>
            <Link
              href="/forgot-password"
              className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center"
            >
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to forgot password
            </Link>
          </div>
        ) : (
          <>
            <div className="flex flex-col items-center mb-8">
              <div className="h-12 w-12 bg-slate-900 rounded-xl flex items-center justify-center mb-6 shadow-sm border border-slate-800">
                <ShieldCheck className="h-5 w-5 text-amber-500" />
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mb-2 text-center">
                Set your new password
              </h1>
              <p className="text-sm text-slate-500 text-center">
                Your temporary password checked out. Choose a permanent password to finish.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[11px] uppercase tracking-wider text-slate-500 font-mono">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(null); }}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg text-sm focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 outline-none transition-all placeholder:text-slate-400 font-mono"
                    placeholder="••••••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[10px] uppercase tracking-wider text-slate-500 font-mono">
                    Security Strength
                  </span>
                  <span className={`font-medium ${strengthScore >= 3 ? "text-emerald-600" : "text-amber-600"}`}>
                    {password.length > 0 ? getStrengthLabel().label : ""}
                  </span>
                </div>
                <div className="flex space-x-1 h-1">
                  {[1, 2, 3, 4].map((step) => (
                    <div
                      key={step}
                      className={`flex-1 rounded-full transition-colors duration-300 ${
                        password.length === 0
                          ? "bg-slate-100"
                          : strengthScore >= step
                            ? getStrengthLabel().color
                            : "bg-slate-100"
                      }`}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] uppercase tracking-wider text-slate-500 font-mono">
                  Confirm Password
                </label>
                <input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setError(null); }}
                  className={`w-full px-4 py-3 bg-slate-50 border rounded-lg text-sm focus:ring-2 outline-none transition-all font-mono ${
                    mismatch
                      ? "border-red-500/50 focus:ring-red-500/20 focus:border-red-500"
                      : "border-slate-100 focus:ring-blue-600/20 focus:border-blue-600"
                  }`}
                  placeholder="••••••••••••"
                />
                {mismatch && (
                  <p className="text-xs text-red-500">Passwords don&apos;t match.</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-y-3">
                <div className={`flex items-center text-xs ${validations.length ? "text-blue-600" : "text-slate-400"}`}>
                  <Check className={`h-3 w-3 mr-2 ${validations.length ? "opacity-100" : "opacity-40"}`} /> 8+ Characters
                </div>
                <div className={`flex items-center text-xs ${validations.special ? "text-blue-600" : "text-slate-400"}`}>
                  <Check className={`h-3 w-3 mr-2 ${validations.special ? "opacity-100" : "opacity-40"}`} /> Special Symbol
                </div>
                <div className={`flex items-center text-xs ${validations.mixed ? "text-blue-600" : "text-slate-400"}`}>
                  <Check className={`h-3 w-3 mr-2 ${validations.mixed ? "opacity-100" : "opacity-40"}`} /> Mixed Case
                </div>
                <div className={`flex items-center text-xs ${validations.number ? "text-blue-600" : "text-slate-400"}`}>
                  <Check className={`h-3 w-3 mr-2 ${validations.number ? "opacity-100" : "opacity-40"}`} /> Numeric Digits
                </div>
              </div>

              {error && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center text-red-500 text-xs font-medium">
                  <AlertCircle className="h-3.5 w-3.5 mr-1.5" />
                  {error}
                </motion.div>
              )}

              <button
                type="submit"
                disabled={!canSubmit || loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3.5 rounded-lg text-sm font-medium transition-all shadow-sm disabled:opacity-50 disabled:hover:bg-blue-600 flex items-center justify-center group"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    Set Password <ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>
          </>
        )}
      </motion.div>
    </main>
  );
}

export default function NewPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-900 text-sm text-slate-400">
          Loading...
        </div>
      }
    >
      <NewPasswordForm />
    </Suspense>
  );
}
