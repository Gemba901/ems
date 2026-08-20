"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, UserCog, AlertCircle, Loader2, KeyRound } from "lucide-react";
import { AuthService } from "@/services/auth.service";

const STEPS = [
  "Ask your administrator or HR team for a temporary password.",
  "Enter it below, then set a permanent password of your own.",
];

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [tempPassword, setTempPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tempPassword.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const { setupToken } = await AuthService.verifyTempPassword(tempPassword.trim());
      router.push(`/forgot-password/new-password?token=${encodeURIComponent(setupToken)}`);
    } catch (err: any) {
      setError(err.message || "Invalid or expired temporary password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-8 sm:p-6 font-sans" style={{ background: "linear-gradient(135deg, #1a2744 0%, #0d1627 60%, #162040 100%)" }}>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="w-full sm:w-105 mx-auto p-8 bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100">
        <div className="flex flex-col items-center mb-8">
          <div className="h-12 w-12 bg-slate-900 rounded-xl flex items-center justify-center mb-6 shadow-sm border border-slate-800">
            <UserCog className="h-5 w-5 text-amber-500" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mb-2 text-center">Forgot your password?</h1>
          <p className="text-sm text-slate-500 text-center">Password resets are currently handled by your administrator. Here&apos;s how to get back in.</p>
        </div>

        <ol className="space-y-4 mb-8">
          {STEPS.map((step, i) => (
            <li key={i} className="flex items-start space-x-3">
              <span className="shrink-0 h-6 w-6 rounded-full bg-blue-50 text-blue-600 text-xs font-semibold flex items-center justify-center mt-0.5">{i + 1}</span>
              <span className="text-sm text-slate-600 leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>

        <form onSubmit={handleSubmit} className="space-y-4 mb-6">
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-wider text-slate-500 font-mono">
              Temporary Password
            </label>
            <div className={`flex items-center rounded-lg border transition-all focus-within:ring-2 ${
              error
                ? "border-red-500/50 focus-within:ring-red-500/20 focus-within:border-red-500"
                : "border-slate-200 focus-within:ring-blue-600/20 focus-within:border-blue-600"
            }`}>
              <span className="pl-3 text-slate-400">
                <KeyRound className="h-4 w-4" />
              </span>
              <input
                autoFocus
                type="text"
                value={tempPassword}
                onChange={(e) => { setTempPassword(e.target.value); setError(null); }}
                placeholder="Enter the password your admin gave you"
                className="flex-1 min-w-0 px-3 py-3 bg-white text-sm outline-none placeholder:text-slate-400 font-mono rounded-lg"
              />
            </div>
          </div>

          {error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center text-red-500 text-xs font-medium">
              <AlertCircle className="h-3.5 w-3.5 mr-1.5 shrink-0" />
              {error}
            </motion.div>
          )}

          <button
            type="submit"
            disabled={loading || !tempPassword.trim()}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg text-sm font-medium transition-all shadow-sm disabled:opacity-50 flex items-center justify-center group"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
              <>Continue <ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform" /></>
            )}
          </button>
        </form>

        <Link href="/login" className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center justify-center">
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to login
        </Link>
      </motion.div>
    </main>
  );
}
