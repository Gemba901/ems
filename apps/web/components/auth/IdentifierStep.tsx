"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, ChevronDown, Hash, Loader2, Mail, Phone } from "lucide-react";
import { AuthService } from "@/services/auth.service";
import { COUNTRY_CODES } from "@/lib/countries";
import Image from "next/image";

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
      className="w-full sm:w-[420px] mx-auto p-8 bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100"
    >
      <div className="flex flex-col items-center mb-8">
        <Image src="/logo.png" alt="GEMBA PMS" width={96} height={96} />
        <p className="text-sm text-slate-500 text-center">Sign in to your account.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Mode toggle */}
        <div className="flex rounded-lg border border-slate-200 p-1 gap-1 bg-slate-50">
          <button
            type="button"
            onClick={() => switchMode("code")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${
              mode === "code"
                ? "bg-white text-blue-600 shadow-sm border border-slate-200"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Hash className="h-3.5 w-3.5" />
            Emp Code
          </button>
          <button
            type="button"
            onClick={() => switchMode("phone")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${
              mode === "phone"
                ? "bg-white text-blue-600 shadow-sm border border-slate-200"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Phone className="h-3.5 w-3.5" />
            Phone
          </button>
          <button
            type="button"
            onClick={() => switchMode("email")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${
              mode === "email"
                ? "bg-white text-blue-600 shadow-sm border border-slate-200"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Mail className="h-3.5 w-3.5" />
            Email
          </button>
        </div>

        {/* Input */}
        <div className="space-y-1.5">
          <div className={`flex rounded-lg border transition-all focus-within:ring-2 ${
            error
              ? "border-red-500/50 focus-within:ring-red-500/20 focus-within:border-red-500"
              : "border-slate-200 focus-within:ring-blue-600/20 focus-within:border-blue-600"
          }`}>

            {mode === "phone" && (
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setShowCodes(v => !v)}
                  className="flex items-center gap-1 px-2.5 py-3 bg-slate-50 rounded-l-lg border-r border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors h-full whitespace-nowrap"
                >
                  <span className="text-base leading-none">{selected.flag}</span>
                  <span className="text-slate-500 text-xs">+{selected.code}</span>
                  <ChevronDown className={`h-3 w-3 text-slate-400 transition-transform shrink-0 ${showCodes ? "rotate-180" : ""}`} />
                </button>

                {showCodes && (
                  <div className="absolute top-full left-0 z-20 mt-1 w-44 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
                    {COUNTRY_CODES.map(c => (
                      <button
                        key={c.code}
                        type="button"
                        onClick={() => { setCountryCode(c.code); setShowCodes(false); }}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-slate-50 transition-colors ${
                          c.code === countryCode ? "bg-blue-50 text-blue-700 font-semibold" : "text-slate-700"
                        }`}
                      >
                        <span>{c.flag}</span>
                        <span>+{c.code}</span>
                        <span className="text-slate-400 ml-auto">{c.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <input
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
              className="flex-1 min-w-0 px-3 py-3 bg-white text-sm outline-none placeholder:text-slate-400 font-mono rounded-lg"
            />
          </div>

          {mode === "phone" && identifier.trim().length > 0 && (
            <p className="text-[11px] text-slate-400 pl-1">
              Will sign in as{" "}
              <span className="font-medium text-slate-600">
                {buildPhoneIdentifier(identifier, countryCode)}
              </span>
            </p>
          )}
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="flex items-center text-red-500 text-xs font-medium"
          >
            <AlertCircle className="h-3.5 w-3.5 mr-1.5 shrink-0" />
            {error}
          </motion.div>
        )}

        <button
          type="submit"
          disabled={loading || !identifier.trim()}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg text-sm font-medium transition-all shadow-sm disabled:opacity-70 flex items-center justify-center"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue"}
        </button>
      </form>

      <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-center text-[10px] text-slate-400 font-mono space-x-2 tracking-widest uppercase">
        <span>Gemba PMS</span>
        <span className="text-slate-200">|</span>
        <span>Enterprise Management</span>
      </div>
    </motion.div>
  );
}
