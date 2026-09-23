"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Building2, Loader2 } from "lucide-react";
import { AuthService } from "@/services/auth.service";
import { useAuthStore } from "@/store/auth.store";
import {
  Field,
  Notice,
  OnboardingShell,
  PasswordField,
  buttonClass,
} from "@/components/onboarding/OnboardingShell";
import { CompanyLogoSetup } from "@/components/onboarding/CompanyLogoSetup";

type Mode = "email" | "phone" | "employeeCode";
export function CompanyLogin({ hostname }: { hostname: string }) {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [mode, setMode] = useState<Mode>("email");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [logoSetup, setLogoSetup] = useState(false);
  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const value =
        mode === "phone"
          ? identifier.replace(/[\s()-]/g, "")
          : identifier.trim();
      const response = await AuthService.login(
        value,
        password,
        mode === "employeeCode" ? "employeeCode" : "phoneOrEmail",
      );
      setPassword("");
      setAuth(response.user, response.accessToken);
      if (
        new URLSearchParams(window.location.search).get("welcome") === "1" &&
        ["ADMIN", "SUPER_ADMIN"].includes(response.user.roleLevel)
      ) {
        window.history.replaceState(null, "", "/login");
        setLogoSetup(true);
      } else
        router.replace(
          response.user.isAdminOrg && response.user.roleLevel === "SUPER_ADMIN"
            ? "/admin"
            : "/",
        );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to sign in. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <OnboardingShell login>
      {logoSetup ? (
        <CompanyLogoSetup onContinue={() => router.replace("/")} />
      ) : (
        <>
          <div className="mb-4 inline-flex max-w-full items-center gap-2 border-l-2 border-blue-600 pl-2 py-1 text-xs font-medium text-blue-700">
            <Building2 size={15} className="shrink-0" />
            <span className="break-all font-mono">{hostname}</span>
          </div>
          <h2 className="text-xl font-semibold tracking-tight">Sign in</h2>
          <p className="mt-1 mb-4 text-slate-500">
            Sign in to your company workspace.
          </p>
          <div
            className="mb-4 grid grid-cols-3 gap-1 rounded-md bg-slate-100 p-1"
            aria-label="Sign-in method"
          >
            {(["email", "phone", "employeeCode"] as const).map((value) => (
              <button
                type="button"
                key={value}
                aria-pressed={mode === value}
                onClick={() => {
                  setMode(value);
                  setIdentifier("");
                  setError("");
                }}
                className={`rounded-lg px-2 py-2.5 text-xs font-semibold transition ${mode === value ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
              >
                {value === "email"
                  ? "Email"
                  : value === "phone"
                    ? "Phone"
                    : "Employee code"}
              </button>
            ))}
          </div>
          <form onSubmit={login} className="space-y-3">
            <Field
              label={
                mode === "email"
                  ? "Email address"
                  : mode === "phone"
                    ? "Phone number"
                    : "Employee code"
              }
              type={
                mode === "email" ? "email" : mode === "phone" ? "tel" : "text"
              }
              autoComplete="username"
              name="identifier"
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              maxLength={254}
              placeholder={
                mode === "phone"
                  ? "+254712345678"
                  : mode === "email"
                    ? "you@company.com"
                    : "Your employee code"
              }
              hint={
                mode === "phone"
                  ? "Include the country code for your registered number."
                  : undefined
              }
            />
            <PasswordField
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className="text-right">
              <Link
                href="/forgot-password"
                className="text-sm font-medium text-blue-600 hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            {error && <Notice error>{error}</Notice>}
            <button
              disabled={busy || !identifier.trim() || !password}
              className={`${buttonClass} w-full`}
            >
              {busy ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <ArrowRight size={18} />
              )}
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
          <p className="mt-3 border-t border-slate-200 pt-3 text-xs leading-relaxed text-slate-500">
            New team member? Use your account invitation to set a password, or
            choose Forgot password to verify your email.
          </p>
        </>
      )}
    </OnboardingShell>
  );
}
