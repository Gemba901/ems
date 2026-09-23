"use client";

import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Check, Eye, EyeOff, Hexagon, ShieldCheck } from "lucide-react";

export const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:bg-slate-50";
export const buttonClass =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50";

export function OnboardingShell({
  children,
  step = 0,
  login = false,
}: {
  children: ReactNode;
  step?: number;
  login?: boolean;
}) {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 lg:grid lg:grid-cols-[minmax(300px,0.85fr)_minmax(0,1.4fr)]">
      <aside className="relative overflow-hidden bg-slate-950 px-6 py-8 text-white sm:px-10 lg:flex lg:min-h-screen lg:flex-col lg:justify-between lg:px-12 lg:py-12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-40 top-1/3 h-96 w-96 rounded-full bg-blue-600/20 blur-3xl"
        />
        <div className="relative flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600">
            <Hexagon className="h-7 w-7" />
          </span>
          <div>
            <p className="text-2xl font-bold tracking-tight">BEES</p>
            <p className="text-xs text-slate-400">by GembaPMS</p>
          </div>
        </div>
        <div className="relative mt-8 max-w-md lg:my-16">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-blue-300">
            Better work. Together.
          </p>
          <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
            A shared space.
            <br />
            <span className="text-blue-400">A stronger team.</span>
          </h1>
          <p className="mt-5 hidden leading-relaxed text-slate-400 sm:block">
            Bring your people, daily work and continuous improvement together in
            your company workspace.
          </p>
          {!login && (
            <ol
              aria-label="Setup steps"
              className="mt-10 hidden space-y-5 lg:block"
            >
              {[
                "Your details",
                "Your company",
                "Verify & secure",
                "Welcome aboard",
              ].map((label, i) => (
                <li
                  key={label}
                  aria-current={i === step ? "step" : undefined}
                  className={`flex items-center gap-3 text-sm ${i === step ? "text-white" : "text-slate-400"}`}
                >
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs ${i < step ? "border-blue-500 bg-blue-600 text-white" : i === step ? "border-blue-400 bg-blue-500/15 text-blue-300" : "border-slate-700"}`}
                  >
                    {i < step ? <Check className="h-4 w-4" /> : `0${i + 1}`}
                  </span>
                  {label}
                </li>
              ))}
            </ol>
          )}
        </div>
        <p className="relative mt-8 hidden items-center gap-2 text-xs text-slate-400 lg:flex">
          <ShieldCheck className="h-4 w-4 text-blue-400" /> Your company. Your
          dedicated workspace.
        </p>
      </aside>
      <section className="flex min-w-0 items-center justify-center px-5 py-10 sm:px-10 lg:py-14">
        <div className="w-full max-w-xl">{children}</div>
      </section>
    </main>
  );
}

export function Field({
  label,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block space-y-2 text-sm font-medium text-slate-700">
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
    <label className="block space-y-2 text-sm font-medium text-slate-700">
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
      className={`rounded-xl border p-4 text-sm leading-relaxed ${error ? "border-red-200 bg-red-50 text-red-700" : "border-blue-100 bg-blue-50 text-blue-800"}`}
    >
      {children}
    </div>
  );
}
