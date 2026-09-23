"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  ImagePlus,
  Loader2,
} from "lucide-react";
import {
  Field,
  Notice,
  OnboardingShell,
  buttonClass,
  inputClass,
} from "@/components/onboarding/OnboardingShell";
import {
  companySlug,
  industries,
  onboardingRequest,
  slugError,
} from "@/lib/onboarding";

const empty = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  companyName: "",
  slug: "",
  shortName: "",
  industry: "",
  otherIndustry: "",
  companyEmail: "",
  companyPhone: "",
  companyAddress: "",
  timeZone: "UTC",
};
export default function SignupPage() {
  const [form, setForm] = useState(empty);
  const [step, setStep] = useState(0);
  const [slugEdited, setSlugEdited] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [workspace, setWorkspace] = useState<{
    kind: string;
    baseDomain: string;
    port?: string;
  } | null>(null);
  useEffect(() => {
    setForm((f) => ({
      ...f,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    }));
    const controller = new AbortController();
    fetch("/api/workspace", { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error();
        setWorkspace(await res.json());
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError(
            "Unable to load workspace information. Please reload to try again.",
          );
      });
    return () => controller.abort();
  }, []);
  function field(name: keyof typeof empty) {
    return {
      name,
      value: form[name],
      onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
        setForm((f) => ({ ...f, [name]: event.target.value })),
      required: true,
    };
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (step === 0) {
      setStep(1);
      return;
    }
    const invalid = slugError(form.slug);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    try {
      const { otherIndustry, ...profile } = form;
      const fields = {
        ...profile,
        industry:
          form.industry === "Other" ? otherIndustry.trim() : form.industry,
      };
      const fingerprint = JSON.stringify(fields);
      let previous: { fingerprint: string; requestKey: string } | null = null;
      try {
        previous = JSON.parse(
          sessionStorage.getItem("gemba-signup-draft") ?? "null",
        );
      } catch {
        /* Ignore an obsolete draft. */
      }
      const requestKey =
        previous?.fingerprint === fingerprint
          ? previous.requestKey
          : Array.from(crypto.getRandomValues(new Uint8Array(32)), (x) =>
              x.toString(16).padStart(2, "0"),
            ).join("");
      sessionStorage.setItem(
        "gemba-signup-draft",
        JSON.stringify({ fingerprint, requestKey }),
      );
      const data = await onboardingRequest<{ id: string }>("signup", {
        ...fields,
        requestKey,
      });
      sessionStorage.removeItem("gemba-signup-verification");
      sessionStorage.setItem(
        "gemba-signup-progress",
        JSON.stringify({ id: data.id, token: requestKey }),
      );
      window.location.assign("/signup/verify");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to start signup. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <OnboardingShell step={step} wide={step === 1}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {step === 0 ? "Administrator details" : "Company details"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {step === 0
              ? "Create the first administrator account for your workspace."
              : "Set up your company profile and workspace address."}
          </p>
        </div>
        <Link
          href="/login"
          className="py-1 text-xs font-medium text-blue-600 hover:underline"
        >
          Sign in instead
        </Link>
      </div>
      <form onSubmit={submit} className="space-y-3">
        {step === 0 ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="First name"
                {...field("firstName")}
                autoComplete="given-name"
                maxLength={80}
                pattern=".*\S.*"
              />
              <Field
                label="Last name"
                {...field("lastName")}
                autoComplete="family-name"
                maxLength={80}
                pattern=".*\S.*"
              />
            </div>
            <Field
              label="Your work email"
              {...field("email")}
              type="email"
              autoComplete="email"
              maxLength={254}
              hint="Your verification link will be sent here."
            />
            <Field
              label="Your phone number"
              {...field("phone")}
              type="tel"
              autoComplete="tel"
              maxLength={16}
              pattern="\+?[0-9]{7,15}"
              placeholder="+254712345678"
              hint="Include your country code, with no spaces."
            />
            <p className="text-xs text-slate-500">
              You can invite your team once the workspace is ready.
            </p>
          </>
        ) : (
          <>
            <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
              <Field
                label="Organization name"
                {...field("companyName")}
                minLength={2}
                maxLength={120}
                autoComplete="organization"
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    companyName: e.target.value,
                    ...(!slugEdited
                      ? { slug: companySlug(e.target.value) }
                      : {}),
                  }))
                }
              />
              <Field
                label="Company short name"
                {...field("shortName")}
                maxLength={20}
                placeholder="e.g. SFL"
                pattern=".*\S.*"
              />
              <div className="min-w-0 space-y-1.5">
                <Field
                  label="Organization slug"
                  {...field("slug")}
                  maxLength={40}
                  minLength={3}
                  autoCapitalize="none"
                  spellCheck={false}
                  onChange={(e) => {
                    setSlugEdited(true);
                    setForm((f) => ({
                      ...f,
                      slug: e.target.value
                        .toLowerCase()
                        .replace(/\s/g, "-")
                        .replace(/[^a-z0-9-]/g, ""),
                    }));
                  }}
                />
                <p className="text-[11px] text-slate-500">
                  3–40 lowercase letters, numbers or hyphens.
                </p>
                <p
                  className="flex items-start gap-1.5 text-xs text-blue-700"
                  aria-live="polite"
                >
                  <Building2
                    aria-hidden="true"
                    size={14}
                    className="mt-0.5 shrink-0"
                  />
                  <span className="min-w-0 break-all font-mono">
                    {form.slug || "your-company"}.{workspace?.baseDomain || "…"}
                    {workspace?.port ? `:${workspace.port}` : ""}
                  </span>
                </p>
              </div>
              <div className="space-y-2">
                <label className="block space-y-1 text-xs font-medium text-slate-700">
                  <span>Industry</span>
                  <select
                    required
                    name="industry"
                    value={form.industry}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, industry: e.target.value }))
                    }
                    className={inputClass}
                  >
                    <option value="">Select industry…</option>
                    {industries.map((industry) => (
                      <option key={industry}>{industry}</option>
                    ))}
                  </select>
                </label>
                {form.industry === "Other" && (
                  <Field
                    label="Industry type"
                    {...field("otherIndustry")}
                    minLength={2}
                    maxLength={120}
                    pattern=".*\S.*"
                  />
                )}
              </div>
              <Field
                label="Company email"
                {...field("companyEmail")}
                type="email"
                maxLength={254}
              />
              <Field
                label="Company phone"
                {...field("companyPhone")}
                type="tel"
                maxLength={16}
                pattern="\+?[0-9]{7,15}"
                placeholder="+254712345678"
              />
              <Field
                label="Company address"
                {...field("companyAddress")}
                autoComplete="street-address"
                minLength={2}
                maxLength={500}
                pattern=".*\S.*"
              />
              <Field
                label="Company timezone"
                {...field("timeZone")}
                maxLength={80}
                placeholder="Africa/Nairobi"
              />
            </div>
            <p className="flex items-center gap-2 pt-1 text-xs text-slate-500">
              <ImagePlus aria-hidden="true" size={15} className="shrink-0" />
              Add your company logo after sign-in.
            </p>
          </>
        )}
        {error && <Notice error>{error}</Notice>}
        {workspace && workspace.kind !== "platform" && (
          <Notice error>
            Open the main BEES website to create a company workspace.
          </Notice>
        )}
        <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-3">
          {step === 1 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setStep(0);
                setError("");
              }}
              className="mr-auto inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm text-slate-600 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-600"
            >
              <ArrowLeft size={16} /> Back
            </button>
          )}
          <button
            disabled={busy || workspace?.kind !== "platform"}
            className={buttonClass}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {busy
              ? "Sending verification…"
              : step === 0
                ? "Company details"
                : "Send verification email"}
            {!busy && <ArrowRight size={16} />}
          </button>
        </div>
      </form>
    </OnboardingShell>
  );
}
