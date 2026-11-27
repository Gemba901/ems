"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, UserCog, AlertCircle, Loader2, KeyRound } from "lucide-react";
import { AuthService } from "@/services/auth.service";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

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
    <main className="min-h-screen flex items-center justify-center px-4 py-8 sm:p-6 font-sans bg-auth-backdrop">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="w-full sm:w-105 mx-auto p-8 bg-card rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-border">
        <div className="flex flex-col items-center mb-8">
          <div className="h-12 w-12 bg-primary rounded-xl flex items-center justify-center mb-6 shadow-sm border border-muted-foreground">
            <UserCog className="h-5 w-5 text-warning" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-2 text-center">Forgot your password?</h1>
          <p className="text-sm text-muted-foreground text-center">Password resets are currently handled by your administrator. Here&apos;s how to get back in.</p>
        </div>

        <ol className="space-y-4 mb-8">
          {STEPS.map((step, i) => (
            <li key={i} className="flex items-start space-x-3">
              <span className="shrink-0 h-6 w-6 rounded-full bg-info-subtle text-info text-xs font-semibold flex items-center justify-center mt-0.5">{i + 1}</span>
              <span className="text-sm text-muted-foreground leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>

        <form onSubmit={handleSubmit} className="space-y-4 mb-6">
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-mono">
              Temporary Password
            </label>
            <div className={`flex items-center rounded-lg border transition-all focus-within:ring-2 ${
              error
                ? "border-danger/50 focus-within:ring-danger/20 focus-within:border-danger"
                : "border-border focus-within:ring-ring/20 focus-within:border-ring"
            }`}>
              <span className="pl-3 text-muted-foreground">
                <KeyRound className="h-4 w-4" />
              </span>
              <Input
                autoFocus
                type="text"
                value={tempPassword}
                onChange={(e) => { setTempPassword(e.target.value); setError(null); }}
                placeholder="Enter the password your admin gave you"
                className="flex-1 min-w-0 px-3 py-3 bg-card text-sm outline-none placeholder:text-muted-foreground font-mono rounded-lg"
              />
            </div>
          </div>

          {error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center text-danger text-xs font-medium">
              <AlertCircle className="h-3.5 w-3.5 mr-1.5 shrink-0" />
              {error}
            </motion.div>
          )}

          <Button variant="ghost"
            type="submit"
            disabled={loading || !tempPassword.trim()}
            className="w-full bg-info hover:bg-info text-info-foreground py-3 rounded-lg text-sm font-medium transition-all shadow-sm disabled:opacity-50 flex items-center justify-center group h-auto whitespace-normal"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
              <>Continue <ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform" /></>
            )}
          </Button>
        </form>

        <Link href="/login" className="text-sm font-medium text-info hover:text-info flex items-center justify-center">
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to login
        </Link>
      </motion.div>
    </main>
  );
}
