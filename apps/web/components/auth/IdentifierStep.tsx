"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, ChevronDown, Hash, Loader2, Mail, Phone } from "lucide-react";
import { AuthService } from "@/services/auth.service";
import { COUNTRY_CODES } from "@/lib/countries";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface IdentifierStepProps {
  onSuccess: (data: {
    identifier: string;
    identifierType: "phoneOrEmail" | "employeeCode";
    hasPassword: boolean;
    name?: string;
    orgName?: string;
    logoUrl?: string | null;
    organizations?: { id: string; name: string; organizationUrl: string | null }[];
    setupToken?: string;
  }) => void;
}

type Mode = "phone" | "email" | "code";

function sanitizePhoneInput(raw: string): string {
  return raw.replace(/^\+/, "").replace(/[\s\-()]/g, "");
}

function buildPhoneIdentifier(raw: string, countryCode: string): string {
  const digits = sanitizePhoneInput(raw).replace(/^0/, "");
  if (digits.startsWith(countryCode)) return digits;
  return `${countryCode}${digits}`;
}

function validatePhone(value: string): string | null {
  const digits = sanitizePhoneInput(value.trim()).replace(/^0/, "");
  if (!digits) return "Enter your phone number.";
  if (!/^\d+$/.test(digits)) return "Phone number should contain digits only.";
  if (digits.length < 9) return "Enter a complete phone number (at least 9 digits).";
  return null;
}

function validateEmail(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Enter your email address.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return "Enter a valid email address (e.g. jane@company.com).";
  return null;
}

function validateEmployeeCode(value: string): string | null {
  if (!value.trim()) return "Enter your employee code.";
  return null;
}

export function IdentifierStep({ onSuccess }: IdentifierStepProps) {
  const [mode, setMode]           = useState<Mode>("code");
  const [identifier, setIdentifier] = useState("");
  const [countryCode, setCountryCode] = useState("254");
  const [showCodes, setShowCodes] = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const selected = COUNTRY_CODES.find(c => c.code === countryCode) ?? COUNTRY_CODES[0];

  function switchMode(next: Mode) {
    setMode(next);
    setIdentifier("");
    setError(null);
    setShowCodes(false);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationError =
      mode === "phone" ? validatePhone(identifier) :
      mode === "email" ? validateEmail(identifier) :
      validateEmployeeCode(identifier);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(null);

    const isCode = mode === "code";
    const resolved = mode === "phone"
      ? buildPhoneIdentifier(identifier, countryCode)
      : identifier.trim();
    const identifierType = isCode ? "employeeCode" : "phoneOrEmail";

    try {
      const response = await AuthService.verifyIdentifier(resolved, identifierType);
      const orgs: { id: string; name: string; organizationUrl: string | null }[] = response.organizations ?? [];
      if (response.verificationRequired) {
        setError("Verify your email using Forgot password to set up this account.");
        return;
      }
      onSuccess({
        identifier: resolved,
        identifierType,
        hasPassword: response.hasPassword,
        name: response.name,
        orgName: orgs.length === 1 ? orgs[0].name : orgs.length > 1 ? "Multiple Organizations" : undefined,
        logoUrl: orgs.length === 1 ? orgs[0].organizationUrl : null,
        organizations: orgs,
        setupToken: response.setupToken,
      });
    } catch (err: any) {
      setError(err.message || "Unable to verify account.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="w-full sm:w-[420px] mx-auto p-8 bg-card rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-border"
    >
      <div className="flex flex-col items-center mb-8">
        <Image src="/logo.png" alt="GEMBA PMS" width={96} height={96} />
        <p className="text-sm text-muted-foreground text-center">Sign in to your account.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Mode toggle */}
        <div className="flex rounded-lg border border-border p-1 gap-1 bg-muted">
          <Button variant="ghost"
            type="button"
            onClick={() => switchMode("code")}
            className={`h-auto whitespace-normal flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${
              mode === "code"
                ? "bg-card text-info shadow-sm border border-border"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Hash className="h-3.5 w-3.5" />
            Emp Code
          </Button>
          <Button variant="ghost"
            type="button"
            onClick={() => switchMode("phone")}
            className={`h-auto whitespace-normal flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${
              mode === "phone"
                ? "bg-card text-info shadow-sm border border-border"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Phone className="h-3.5 w-3.5" />
            Phone
          </Button>
          <Button variant="ghost"
            type="button"
            onClick={() => switchMode("email")}
            className={`h-auto whitespace-normal flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${
              mode === "email"
                ? "bg-card text-info shadow-sm border border-border"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Mail className="h-3.5 w-3.5" />
            Email
          </Button>
        </div>

        {/* Input */}
        <div className="space-y-1.5">
          <div className={`flex rounded-lg border transition-all focus-within:ring-2 ${
            error
              ? "border-danger/50 focus-within:ring-danger/20 focus-within:border-danger"
              : "border-border focus-within:ring-ring/20 focus-within:border-ring"
          }`}>

            {mode === "phone" && (
              <div className="relative shrink-0">
                <Button variant="ghost"
                  type="button"
                  onClick={() => setShowCodes(v => !v)}
                  className="flex items-center gap-1 px-2.5 py-3 bg-muted rounded-l-lg border-r border-border text-sm font-medium text-foreground hover:bg-muted transition-colors h-full whitespace-nowrap"
                >
                  <span className="text-base leading-none">{selected.flag}</span>
                  <span className="text-muted-foreground text-xs">+{selected.code}</span>
                  <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform shrink-0 ${showCodes ? "rotate-180" : ""}`} />
                </Button>

                {showCodes && (
                  <div className="absolute top-full left-0 z-20 mt-1 w-44 bg-card border border-border rounded-lg shadow-lg overflow-hidden">
                    {COUNTRY_CODES.map(c => (
                      <Button variant="ghost"
                        key={c.code}
                        type="button"
                        onClick={() => { setCountryCode(c.code); setShowCodes(false); }}
                        className={`h-auto whitespace-normal w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors ${
                          c.code === countryCode ? "bg-info-subtle text-info font-semibold" : "text-foreground"
                        }`}
                      >
                        <span>{c.flag}</span>
                        <span>+{c.code}</span>
                        <span className="text-muted-foreground ml-auto">{c.name}</span>
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <Input
              key={mode}
              autoFocus
              type={mode === "email" ? "email" : mode === "code" ? "text" : "tel"}
              autoComplete={mode === "email" ? "email" : mode === "code" ? "off" : "tel"}
              value={identifier}
              onChange={e => {
                let val = mode === "phone"
                  ? e.target.value.replace(/^\+/, "")
                  : e.target.value;
                // Strip auto-pasted country code (e.g. browser fills +254712345678)
                if (mode === "phone" && val.startsWith(countryCode) && val.length - countryCode.length >= 6) {
                  val = val.slice(countryCode.length);
                }
                setIdentifier(val);
                if (error) setError(null);
                if (showCodes) setShowCodes(false);
              }}
              placeholder={
                mode === "phone" ? "e.g. 712 345 678" :
                mode === "email" ? "e.g. jane@company.com" :
                "e.g. EMP-0042"
              }
              className="flex-1 min-w-0 px-3 py-3 bg-card text-sm outline-none placeholder:text-muted-foreground font-mono rounded-lg"
            />
          </div>

          {mode === "phone" && identifier.trim().length > 0 && (
            <p className="text-[11px] text-muted-foreground pl-1">
              Will sign in as{" "}
              <span className="font-medium text-muted-foreground">
                {buildPhoneIdentifier(identifier, countryCode)}
              </span>
            </p>
          )}
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
          disabled={loading || !identifier.trim()}
          className="w-full bg-info hover:bg-info text-info-foreground py-3 rounded-lg text-sm font-medium transition-all shadow-sm disabled:opacity-70 flex items-center justify-center h-auto whitespace-normal"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue"}
        </Button>
      </form>
      <a href="/forgot-password" className="mt-4 block text-center text-sm text-info">Forgot password / Set up account</a>

      <div className="mt-8 pt-6 border-t border-border flex items-center justify-center text-[10px] text-muted-foreground font-mono space-x-2 tracking-widest uppercase">
        <span>Gemba PMS</span>
        <span className="text-primary-foreground">|</span>
        <span>Enterprise Management</span>
      </div>
    </motion.div>
  );
}
