"use client";

import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import Image from "next/image";
import { Check, Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const inputClass =
  "w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-gemba-navy focus:ring-3 focus:ring-gemba-navy/10 disabled:bg-muted";
export const buttonClass =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-gemba-navy px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-gemba-navy-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gemba-navy disabled:cursor-not-allowed disabled:opacity-50";
export const secondaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gemba-navy disabled:cursor-not-allowed disabled:opacity-50";

const setupSteps = [
  { label: "Administrator", detail: "Your name and contact details" },
  { label: "Company", detail: "Profile and workspace address" },
  { label: "Verify email", detail: "Open the link and set a password" },
  { label: "Workspace ready", detail: "Sign in and add your logo" },
];

/**
 * Split layout for signup, verification and company sign-in. The navy panel
 * carries the brand, the real setup steps and the workspace address; `step`
 * past the last index marks every step complete.
 */
export function OnboardingShell({
  children,
  step = 0,
  login = false,
  address,
  addressLabel = "Workspace address",
  addressPlaceholder = "Chosen in the company step",
}: {
  children: ReactNode;
  step?: number;
  login?: boolean;
  address?: string;
  addressLabel?: string;
  addressPlaceholder?: string;
}) {
  const current = setupSteps[Math.min(step, setupSteps.length - 1)];
  return (
    <main className="min-h-screen bg-card text-foreground lg:grid lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)]">
      <aside className="bg-gemba-navy px-5 py-4 text-primary-foreground sm:px-8 lg:flex lg:min-h-screen lg:flex-col lg:px-10 lg:py-10">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Image
              src="/gemba-mark-light.png"
              alt=""
              width={40}
              height={40}
              preload
              className="h-9 w-9 lg:h-10 lg:w-10"
            />
            <div className="leading-none">
              <p className="text-xl font-bold tracking-tight">BEES</p>
              <p className="mt-1 text-xs text-muted-foreground">by Gemba PMS</p>
            </div>
          </div>
          <p className="truncate text-xs text-muted-foreground lg:hidden">
            {login
              ? address
              : step >= setupSteps.length
                ? "Setup complete"
                : `Step ${step + 1} of ${setupSteps.length} · ${current.label}`}
          </p>
        </div>

        {!login && (
          <ol aria-label="Setup steps" className="mt-14 hidden lg:block">
            {setupSteps.map(({ label, detail }, i) => {
              const done = i < step;
              const active = i === step;
              return (
                <li
                  key={label}
                  aria-current={active ? "step" : undefined}
                  className="relative flex gap-4 pb-8 last:pb-0"
                >
                  {i < setupSteps.length - 1 && (
                    <span
                      aria-hidden="true"
                      className={`absolute top-8 left-[13px] h-[calc(100%-2.25rem)] w-px ${done ? "bg-gemba-lime" : "bg-card/15"}`}
                    />
                  )}
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                      done
                        ? "bg-gemba-lime text-gemba-navy"
                        : active
                          ? "border-2 border-gemba-lime text-gemba-lime"
                          : "border border-card/25 text-muted-foreground"
                    }`}
                  >
                    {done ? (
                      <Check className="h-4 w-4" strokeWidth={3} />
                    ) : (
                      i + 1
                    )}
                  </span>
                  <div className="pt-0.5">
                    <p
                      className={`text-sm font-medium ${done || active ? "text-primary-foreground" : "text-muted-foreground"}`}
                    >
                      {label}
                      {done && <span className="sr-only"> (complete)</span>}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {(address || !login) && (
          <div className="mt-auto hidden border-t border-card/10 pt-6 lg:block">
            <p className="text-xs text-muted-foreground">{addressLabel}</p>
            <p
              className={`mt-1.5 font-mono text-sm break-all ${address ? "text-primary-foreground" : "text-muted-foreground"}`}
            >
              {address || addressPlaceholder}
            </p>
          </div>
        )}
      </aside>
      <section className="flex min-w-0 justify-center px-5 py-10 sm:px-10 lg:items-center lg:py-16">
        <div className="w-full max-w-lg">{children}</div>
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
    <label className="block space-y-1.5 text-sm font-medium text-foreground">
      <span>{label}</span>
      <Input {...props} className={`${inputClass} ${props.className ?? ""}`} />
      {hint && (
        <span className="block text-xs font-normal leading-relaxed text-muted-foreground">
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
    <label className="block space-y-1.5 text-sm font-medium text-foreground">
      <span>{label}</span>
      <span className="relative block">
        <Input
          {...props}
          type={visible ? "text" : "password"}
          className={`${inputClass} pr-11`}
        />
        <Button variant="ghost"
          type="button"
          aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
          className="absolute inset-y-0 right-0 px-3 text-muted-foreground hover:text-gemba-navy h-auto whitespace-normal"
        >
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </Button>
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
      className={`rounded-lg border-l-3 px-4 py-3 text-sm leading-relaxed ${error ? "border-gemba-red bg-danger-subtle text-gemba-red-ink" : "border-gemba-navy/40 bg-muted text-foreground"}`}
    >
      {children}
    </div>
  );
}

/** Page heading and one line of plain context under it. */
export function StepHeading({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-8">
      <h1
        tabIndex={-1}
        className="text-2xl font-semibold tracking-tight text-foreground"
      >
        {title}
      </h1>
      {children && (
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {children}
        </p>
      )}
    </div>
  );
}
