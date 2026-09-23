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
    <OnboardingShell step={step}>
      <div className="mb-8 flex items-center justify-between text-xs font-medium text-slate-500">
        <span>STEP {step + 1} OF 4</span>
        <span>
          Already a member?{" "}
          <Link href="/login" className="ml-1 text-blue-600 hover:underline">
            Sign in
          </Link>
        </span>
      </div>
      <h2 tabIndex={-1} className="text-3xl font-semibold tracking-tight">
        {step === 0 ? "Let's start with you." : "Make it your company's space."}
      </h2>
      <p className="mt-3 mb-8 leading-relaxed text-slate-500">
        {step === 0
          ? "You'll be the first administrator. Use your own email to verify and secure your account."
          : "Tell us about your company and choose the address your team will use to sign in."}
      </p>
      <form onSubmit={submit} className="space-y-5">
        {step === 0 ? (
          <>
            <div className="grid gap-5 sm:grid-cols-2">
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
              hint="We'll send your verification link here."
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
            <Notice>
              Your account will administer this workspace. You can invite your
              team after setup.
            </Notice>
          </>
        ) : (
          <>
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
                  ...(!slugEdited ? { slug: companySlug(e.target.value) } : {}),
                }))
              }
            />
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
              hint="3–40 lowercase letters, numbers or hyphens. You can edit the suggested address."
            />
            <div className="-mt-2 flex items-start gap-2 rounded-xl bg-blue-50 p-3 text-sm text-blue-800">
              <Building2 className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-blue-600">Your company address</p>
                <p className="mt-1 break-all font-medium">
                  {form.slug || "your-company"}.{workspace?.baseDomain || "…"}
                  {workspace?.port ? `:${workspace.port}` : ""}
                </p>
              </div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                label="Company short name"
                {...field("shortName")}
                maxLength={20}
                placeholder="e.g. SFL"
                pattern=".*\S.*"
              />
              <label className="block space-y-2 text-sm font-medium text-slate-700">
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
            </div>
            {form.industry === "Other" && (
              <Field
                label="Tell us your industry"
                {...field("otherIndustry")}
                minLength={2}
                maxLength={120}
                pattern=".*\S.*"
              />
            )}
            <div className="grid gap-5 sm:grid-cols-2">
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
            </div>
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
              hint="Used for company schedules and reports, e.g. Africa/Nairobi."
            />
            <div className="flex gap-3 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
              <ImagePlus className="h-5 w-5 shrink-0 text-blue-600" />
              <p>
                <span className="font-medium text-slate-800">
                  Add your logo after sign-in.
                </span>
                <br />
                We’ll offer a secure upload once your workspace is ready.
              </p>
            </div>
          </>
        )}
        {error && <Notice error>{error}</Notice>}
        {workspace && workspace.kind !== "platform" && (
          <Notice error>
            Open the main BEES website to create a company workspace.
          </Notice>
        )}
        <div className="flex items-center gap-3 pt-2">
          {step === 1 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setStep(0);
                setError("");
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm"
            >
              <ArrowLeft size={16} /> Back
            </button>
          )}
          <button
            disabled={busy || workspace?.kind !== "platform"}
            className={`${buttonClass} flex-1`}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {busy
              ? "Sending verification…"
              : step === 0
                ? "Continue to company details"
                : "Send verification email"}
            {!busy && <ArrowRight size={16} />}
          </button>
        </div>
      </form>
    </OnboardingShell>
  );
}
