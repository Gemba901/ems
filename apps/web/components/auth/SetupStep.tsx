"use client";

import { TenantImage } from "@/components/files/TenantImage";
import { useState } from "react";
import { motion } from "framer-motion";
import { Eye, EyeOff, Check, ArrowRight, Loader2, AlertCircle } from "lucide-react";
import type { AuthState } from "../../app/(auth)/login/page";
import { AuthService } from "@/services/auth.service";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface SetupStepProps {
  data: AuthState;
  onComplete: () => void;
}

export function SetupStep({ data, onComplete }: SetupStepProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);



  // Validations for password strength
  const validations = {
    length: password.length >= 12,
    mixed: /[A-Z]/.test(password) && /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };

  const strengthScore = Object.values(validations).filter(Boolean).length;
  const isMatch = password === confirmPassword && password.length > 0;
  const canSubmit = strengthScore >= 3 && isMatch;

  const getStrengthLabel = () => {
    if (strengthScore <= 1) return { label: "Weak", color: "bg-danger" };
    if (strengthScore === 2)
      return { label: "Moderate", color: "bg-warning" };
    if (strengthScore >= 3) return { label: "Strong", color: "bg-success" };
    return { label: "", color: "bg-muted" };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);

    try {
        await AuthService.setupAccount(data.setupToken!, password);
        onComplete();
    } catch (error: any) {
        setError(error.message || "Failed to set password. Please try again.");
    } finally {
        setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className="w-full max-w-4xl mx-auto bg-card rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-border overflow-hidden flex flex-col md:flex-row"
    >
      {/* Left Pane: Context */}
      <div className="w-full md:w-5/12 bg-muted p-6 md:p-10 flex flex-col justify-between relative overflow-hidden">
        <div className="z-10">
          <div className="mb-12">
            {data.logoUrl ? (
              <TenantImage
                src={data.logoUrl}
                alt={data.orgName || "Organization"}
                className="h-12 w-auto max-w-[160px] object-contain"
              />
            ) : (
              <span className="text-xs font-bold tracking-widest text-foreground uppercase font-mono">
                Gemba PMS
              </span>
            )}
          </div>

          <h2 className="text-3xl font-semibold tracking-tight text-foreground leading-tight mb-4">
            Welcome,
            <br />
            {data.name || "there"}
            {data.orgName ? (
              <>
                <br />
                <span className="text-info">{data.orgName}</span>
              </>
            ) : null}
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Since this is your first time, please set a secure password for your
            account.
          </p>
        </div>

        {/* Decorative glass bento element at the bottom */}
        <div className="mt-12 bg-card/40 backdrop-blur-md rounded-xl p-4 border border-card/60 z-10">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono mb-2">
            Security Protocol
          </div>
          <div className="flex space-x-1">
            <div className="h-1 flex-1 bg-info rounded-full" />
            <div className="h-1 flex-1 bg-info rounded-full" />
            <div className="h-1 flex-1 bg-muted-foreground rounded-full" />
            <div className="h-1 flex-1 bg-muted-foreground rounded-full" />
          </div>
        </div>
      </div>

      {/* Right Pane: Form */}
      <div className="w-full md:w-7/12 p-6 md:p-10 lg:p-14">
        <div className="mb-8">
          <div className="text-[10px] uppercase tracking-widest text-info font-mono mb-3">
            Step 02 — Security
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            Create your password.
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* New Password */}
          <div className="space-y-2">
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-mono">
              New Password
            </label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => {setPassword(e.target.value); setError(null);}}
                className="w-full px-4 py-3 bg-muted border border-border rounded-lg text-sm focus:ring-2 focus:ring-ring/20 focus:border-ring outline-none transition-all placeholder:text-muted-foreground font-mono"
                placeholder="••••••••••••"
              />
              <Button variant="ghost"
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground h-auto whitespace-normal"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Strength Meter */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
                Security Strength
              </span>
              <span
                className={`font-medium ${strengthScore >= 3 ? "text-success" : "text-warning"}`}
              >
                {password.length > 0 ? getStrengthLabel().label : ""}
              </span>
            </div>
            <div className="flex space-x-1 h-1">
              {[1, 2, 3, 4].map((step) => (
                <div
                  key={step}
                  className={`flex-1 rounded-full transition-colors duration-300 ${
                    password.length === 0
                      ? "bg-muted"
                      : strengthScore >= step
                        ? getStrengthLabel().color
                        : "bg-muted"
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Confirm Password */}
          <div className="space-y-2 pt-2">
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-mono">
              Confirm Password
            </label>
            <Input
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => {setConfirmPassword(e.target.value); setError(null);}}
              className="w-full px-4 py-3 bg-muted border border-border rounded-lg text-sm focus:ring-2 focus:ring-ring/20 focus:border-ring outline-none transition-all font-mono"
              placeholder="••••••••••••"
            />
          </div>

          {/* Checklist */}
          <div className="grid grid-cols-2 gap-y-3 pt-2">
            <div
              className={`flex items-center text-xs ${validations.length ? "text-info" : "text-muted-foreground"}`}
            >
              <Check
                className={`h-3 w-3 mr-2 ${validations.length ? "opacity-100" : "opacity-40"}`}
              />{" "}
              12+ Characters
            </div>
            <div
              className={`flex items-center text-xs ${validations.special ? "text-info" : "text-muted-foreground"}`}
            >
              <Check
                className={`h-3 w-3 mr-2 ${validations.special ? "opacity-100" : "opacity-40"}`}
              />{" "}
              Special Symbol
            </div>
            <div
              className={`flex items-center text-xs ${validations.mixed ? "text-info" : "text-muted-foreground"}`}
            >
              <Check
                className={`h-3 w-3 mr-2 ${validations.mixed ? "opacity-100" : "opacity-40"}`}
              />{" "}
              Mixed Case
            </div>
            <div
              className={`flex items-center text-xs ${validations.number ? "text-info" : "text-muted-foreground"}`}
            >
              <Check
                className={`h-3 w-3 mr-2 ${validations.number ? "opacity-100" : "opacity-40"}`}
              />{" "}
              Numeric Digits
            </div>
          </div>

          {error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center text-danger text-xs font-medium pt-2">
              <AlertCircle className="h-3.5 w-3.5 mr-1.5" />
              {error}
            </motion.div>
          )}

          <Button variant="ghost"
            type="submit"
            disabled={!canSubmit || loading}
            className="w-full mt-4 bg-info hover:bg-info text-info-foreground py-3.5 rounded-lg text-sm font-medium transition-all shadow-sm disabled:opacity-50 disabled:hover:bg-info flex items-center justify-center group h-auto whitespace-normal"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                Set Password & Continue
                <ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </Button>
        </form>
      </div>
    </motion.div>
  );
}
