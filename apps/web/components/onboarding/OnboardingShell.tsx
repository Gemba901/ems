"use client";

import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Check, Eye, EyeOff, Hexagon, ShieldCheck } from "lucide-react";

export const inputClass =
  "w-full min-h-11 sm:min-h-10 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 disabled:bg-slate-50";
export const buttonClass =
  "inline-flex items-center justify-center gap-2 min-h-11 sm:min-h-10 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50";

export function OnboardingShell({
  children,
  step = 0,
  login = false,
  wide = false,
  framed = true,
}: {
  children: ReactNode;
  step?: number;
  login?: boolean;
  wide?: boolean;
  framed?: boolean;
}) {
  const steps = ["Your details", "Your company", "Verify & secure", "Welcome"];
  return (
    <main className="min-h-svh bg-slate-50 text-slate-900">
      <header className="border-b border-slate-800 bg-slate-950 text-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <Hexagon aria-hidden="true" className="h-6 w-6 text-blue-400" />
            <span className="text-lg font-semibold tracking-tight">BEES</span>
            <span className="border-l border-slate-700 pl-2.5 text-xs text-slate-400">
              by GembaPMS
            </span>
          </div>
          <span className="hidden text-xs text-slate-400 sm:block">
            {login ? "Company workspace" : "Workspace setup"}
          </span>
        </div>
      </header>
      <div
        className={`mx-auto px-4 py-5 sm:px-6 sm:py-6 ${wide ? "max-w-4xl" : login ? "max-w-lg" : "max-w-2xl"}`}
      >
        {!login && (
          <nav aria-label="Setup progress" className="mb-4">
            <ol className="grid grid-cols-4 gap-2">
              {steps.map((label, i) => (
                <li
                  key={label}
                  aria-current={i === step ? "step" : undefined}
                  className={`border-t-2 pt-2 ${i <= step ? "border-blue-600" : "border-slate-200"}`}
                >
                  <div
                    className={`flex items-center gap-1.5 text-xs font-medium ${i === step ? "text-blue-700" : "text-slate-500"}`}
                  >
                    {i < step ? (
                      <Check aria-hidden="true" size={14} />
                    ) : (
                      <span className="font-mono text-[11px]">0{i + 1}</span>
                    )}
                    <span className="hidden sm:inline">{label}</span>
                    <span className="sm:hidden">
                      {["Details", "Company", "Verify", "Welcome"][i]}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </nav>
        )}
        <section
          aria-label={login ? "Company sign-in" : steps[step]}
          className={
            framed
              ? "rounded-lg border border-slate-200 bg-white p-5 sm:p-6"
              : ""
          }
        >
          {children}
        </section>
        <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
          <ShieldCheck aria-hidden="true" size={13} /> Secure company workspace
        </p>
      </div>
    </main>
  );
}

export function Field({
  label,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block space-y-1 text-xs font-medium text-slate-700">
      <span>{label}</span>
      <input {...props} className={`${inputClass} ${props.className ?? ""}`} />
      {hint && (
        <span className="block text-xs font-normal leading-relaxed text-slate-500">
          {hint}
        </span>
      )}
    </label>
  );
}

export function PasswordField({
  label = "Password",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="block space-y-1 text-xs font-medium text-slate-700">
      <span>{label}</span>
      <span className="relative block">
        <input
          {...props}
          type={visible ? "text" : "password"}
          className={`${inputClass} pr-12`}
        />
        <button
          type="button"
          aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
          className="absolute inset-y-0 right-0 px-4 text-slate-500 hover:text-blue-600"
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </span>
    </label>
  );
}

export function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      role={error ? "alert" : "status"}
      className={`rounded-md border p-3 text-sm leading-relaxed ${error ? "border-red-200 bg-red-50 text-red-700" : "border-blue-100 bg-blue-50 text-blue-800"}`}
    >
      {children}
    </div>
  );
}
