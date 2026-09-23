"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Globe2,
  Loader2,
  MailCheck,
  ShieldCheck,
  Users,
} from "lucide-react";
import {
  Notice,
  OnboardingShell,
  PasswordField,
  buttonClass,
} from "@/components/onboarding/OnboardingShell";
import { onboardingRequest } from "@/lib/onboarding";

type Access = { id: string; token: string };
type Progress = {
  status: string;
  workspaceUrl?: string;
  companyName?: string;
  provisioningStage?: string;
  retryScheduled?: boolean;
  canRetry?: boolean;
};
const stages = [
  {
    key: "REGISTERING_DOMAIN",
    title: "Connect your company address",
    description:
      "Registering the subdomain and checking its connection to your workspace.",
    icon: Globe2,
  },
  {
    key: "CHECKING_HTTPS",
    title: "Check secure access",
    description:
      "Checking that your workspace sign-in page is available over HTTPS.",
    icon: ShieldCheck,
  },
  {
    key: "CREATING_WORKSPACE",
    title: "Prepare your team workspace",
    description:
      "Saving your company profile, creating the initial administrator and enabling your assigned modules.",
    icon: Users,
  },
];
function savedAccess(key: string): Access | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? "null");
    return value &&
      /^[a-f0-9-]{36}$/.test(value.id) &&
      /^[a-f0-9]{64}$/.test(value.token)
      ? value
      : null;
  } catch {
    return null;
  }
}
export default function VerifySignupPage() {
  const [verification, setVerification] = useState<Access | null>(null);
  const [progress, setProgress] = useState<Access | null>(null);
  const [data, setData] = useState<Progress>({ status: "" });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [existingAccount, setExistingAccount] = useState(false);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const restore = () => {
      const params = new URLSearchParams(location.hash.slice(1));
      try {
        if (params.get("id") && params.get("token")) {
          setData({ status: "" });
          setError("");
          sessionStorage.removeItem("gemba-signup-progress");
          sessionStorage.setItem(
            "gemba-signup-verification",
            JSON.stringify({
              id: params.get("id"),
              token: params.get("token"),
            }),
          );
          history.replaceState(null, "", location.pathname);
        }
        setVerification(savedAccess("gemba-signup-verification"));
        setProgress(savedAccess("gemba-signup-progress"));
      } catch {
        setError(
          "Allow session storage in your browser, then reopen your email verification link.",
        );
      }
      setLoaded(true);
    };
    restore();
    window.addEventListener("hashchange", restore);
    return () => window.removeEventListener("hashchange", restore);
  }, []);
  useEffect(() => {
    if (!progress) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      let terminal = false;
      try {
        const next = await onboardingRequest<Progress>(
          "status",
          progress,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setData(next);
        setError("");
        terminal = ["READY", "EXPIRED", "FAILED"].includes(next.status);
        if (next.status === "READY")
          sessionStorage.removeItem("gemba-signup-draft");
      } catch (err) {
        if (!controller.signal.aborted)
          setError(
            err instanceof Error
              ? err.message
              : "Connection interrupted. We'll keep checking your progress.",
          );
      }
      if (!terminal && !controller.signal.aborted)
        timer = setTimeout(poll, 5000);
    };
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [progress]);
  useEffect(() => {
    if (data.status !== "PROVISIONING") {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), 60_000);
    return () => clearTimeout(timer);
  }, [data.status]);
  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    if (password !== form.get("confirmPassword")) {
      setError("Your passwords don't match. Please check both fields.");
      return;
    }
    if (new TextEncoder().encode(password).length > 72) {
      setError(
        "Your password must fit within 72 UTF-8 bytes. Try fewer characters or symbols.",
      );
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await onboardingRequest<{
        id: string;
        progressToken: string;
        status: string;
      }>("verify", { ...verification, password });
      const access = { id: response.id, token: response.progressToken };
      sessionStorage.setItem("gemba-signup-progress", JSON.stringify(access));
      sessionStorage.removeItem("gemba-signup-verification");
      setVerification(null);
      setData({ status: response.status });
      setProgress(access);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Verification failed. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function action(action: "resend" | "retry") {
    if (!progress) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await onboardingRequest<Progress>(action, progress);
      if (action === "retry") {
        setData(response);
        setProgress({ ...progress });
      } else
        setMessage(
          "Another verification email is queued. Check your inbox and spam folder.",
        );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  const ready = data.status === "READY";
  const stageIndex = stages.findIndex(
    (stage) => stage.key === data.provisioningStage,
  );
  const continueUrl = data.workspaceUrl ? `${data.workspaceUrl}?welcome=1` : "";
  return (
    <OnboardingShell step={ready ? 3 : 2}>
      {(!loaded || (progress && !data.status)) && (
        <div className="flex items-center gap-3 text-slate-500" role="status">
          <Loader2 className="animate-spin" /> Loading your signup…
        </div>
      )}
      {verification && (
        <>
          <span className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-blue-600">
            <ShieldCheck size={28} />
          </span>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-blue-600">
            Verify & secure
          </p>
          <h2 className="text-3xl font-semibold tracking-tight">
            One last step to make it yours.
          </h2>
          <p className="mt-3 mb-7 leading-relaxed text-slate-500">
            Secure your administrator account to confirm your email and start
            creating your company workspace.
          </p>
          <form onSubmit={verify} className="space-y-5">
            <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={existingAccount}
                onChange={(e) => {
                  setExistingAccount(e.target.checked);
                  setError("");
                }}
                className="h-4 w-4 accent-blue-600"
              />{" "}
              I already have a GembaPMS account
            </label>
            <PasswordField
              key={String(existingAccount)}
              label={
                existingAccount
                  ? "Existing account password"
                  : "Create password"
              }
              name="password"
              autoComplete={
                existingAccount ? "current-password" : "new-password"
              }
              minLength={existingAccount ? 1 : 12}
              maxLength={72}
              required
            />
            <PasswordField
              label="Confirm password"
              name="confirmPassword"
              autoComplete={
                existingAccount ? "current-password" : "new-password"
              }
              minLength={existingAccount ? 1 : 12}
              maxLength={72}
              required
            />
            <p className="text-xs leading-relaxed text-slate-500">
              {existingAccount
                ? "Use your current GembaPMS password to link this workspace to your existing account. Your password won't be changed."
                : "Use at least 12 characters. A longer phrase with a mix of characters is easier to remember and harder to guess."}
            </p>
            <button disabled={busy} className={`${buttonClass} w-full`}>
              {busy ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <ArrowRight size={18} />
              )}
              {busy ? "Verifying your account…" : "Verify & create workspace"}
            </button>
          </form>
        </>
      )}
      {data.status === "PENDING_VERIFICATION" && (
        <>
          <span className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-100 text-blue-600">
            <MailCheck size={32} />
          </span>
          <h2 className="text-3xl font-semibold tracking-tight">
            Check your inbox.
          </h2>
          <p className="mt-4 leading-relaxed text-slate-500">
            We’ve queued a verification link for your administrator email. Open
            it to secure your account and finish setting up{" "}
            {data.companyName || "your company"}.
          </p>
          <div className="my-7 rounded-2xl border border-slate-200 bg-white p-5 text-sm leading-relaxed text-slate-600">
            The link expires after 30 minutes. If it hasn’t arrived, check your
            spam folder. Keep this page open to follow your progress.
          </div>
          <button
            disabled={busy}
            onClick={() => void action("resend")}
            className={buttonClass}
          >
            {busy ? "Requesting email…" : "Resend verification email"}
          </button>
          <Link
            href="/signup"
            className="mt-5 block text-sm text-slate-500 hover:text-blue-600"
          >
            Entered the wrong details? Start again
          </Link>
        </>
      )}
      {data.status === "PROVISIONING" && (
        <>
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-100 text-blue-600">
            <Loader2 size={30} className="motion-safe:animate-spin" />
          </div>
          <h2 className="text-3xl font-semibold tracking-tight">
            Making room for your team.
          </h2>
          <p className="mt-3 text-slate-500">
            {data.companyName || "Your company"} is on its way. We’ll let you
            know when everything is ready.
          </p>
          <ol className="my-8 space-y-3" aria-label="Workspace setup progress">
            {stages.map(({ key, title, description, icon: Icon }, index) => {
              const complete = stageIndex > index;
              const active = stageIndex === index;
              return (
                <li
                  key={key}
                  aria-current={active ? "step" : undefined}
                  className={`flex gap-4 rounded-2xl border p-5 ${active ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white"}`}
                >
                  <span
                    className={`mt-0.5 ${complete ? "text-emerald-600" : active ? "text-blue-600" : "text-slate-400"}`}
                  >
                    {complete ? <Check size={22} /> : <Icon size={22} />}
                  </span>
                  <div>
                    <p className="text-sm font-semibold">
                      {title}
                      <span className="ml-2 text-xs font-normal text-slate-500">
                        {complete
                          ? "Complete"
                          : active
                            ? "In progress"
                            : "Waiting"}
                      </span>
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-slate-500">
                      {description}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
          <p role="status" className="text-sm leading-relaxed text-slate-500">
            {data.retryScheduled
              ? "Your company address is still being prepared. An automatic retry is scheduled; you don't need to submit again."
              : stageIndex < 0
                ? "Your email is verified. Waiting for workspace setup to begin…"
                : slow
                  ? "This is taking a little longer. We're still checking readiness; your setup is saved."
                  : "Setup continues safely if you leave this page. We’ll also email you when it's ready."}
          </p>
        </>
      )}
      {ready && (
        <>
          <span className="mb-7 flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-100 text-emerald-600">
            <CheckCircle2 size={42} />
          </span>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-blue-600">
            Your next chapter starts here
          </p>
          <h2 className="text-4xl font-semibold tracking-tight">
            Welcome to BEES<span className="text-blue-600">.</span>
          </h2>
          <p className="mt-2 text-sm font-medium text-slate-400">by GembaPMS</p>
          <p className="mt-5 text-lg leading-relaxed text-slate-600">
            {data.companyName || "Your company"} now has a space to work,
            improve and grow together.
          </p>
          <div className="my-7 rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-xs uppercase tracking-wider text-slate-400">
              Your workspace
            </p>
            <p className="mt-2 break-all text-sm font-medium text-blue-700">
              {data.workspaceUrl
                ?.replace(/^https?:\/\//, "")
                .replace(/\/login$/, "")}
            </p>
            <p className="mt-4 text-sm leading-relaxed text-slate-500">
              Sign in with your administrator credentials. Then add your company
              logo and make yourself at home.
            </p>
          </div>
          {continueUrl && (
            <a href={continueUrl} className={`${buttonClass} w-full`}>
              Continue to your workspace <ArrowRight size={18} />
            </a>
          )}
        </>
      )}
      {data.status === "FAILED" && (
        <>
          <h2 className="text-3xl font-semibold">
            Setup needs a little attention.
          </h2>
          <p className="my-5 leading-relaxed text-slate-500">
            {data.canRetry
              ? "We couldn't finish preparing your workspace. Your details are saved. Wait a minute, then retry."
              : "We couldn't complete setup with these details. Contact your administrator for help resolving the signup."}
          </p>
          {data.canRetry && (
            <button
              disabled={busy}
              onClick={() => void action("retry")}
              className={buttonClass}
            >
              {busy ? "Retrying…" : "Retry workspace setup"}
            </button>
          )}
          <p className="mt-4 break-all text-xs text-slate-500">
            Support reference: {progress?.id}
          </p>
        </>
      )}
      {data.status === "EXPIRED" && (
        <>
          <h2 className="text-3xl font-semibold">
            Your verification link expired.
          </h2>
          <p className="my-5 text-slate-500">
            Start a new signup to receive a fresh link.
          </p>
          <Link href="/signup" className={buttonClass}>
            Start again <ArrowRight size={18} />
          </Link>
        </>
      )}
      {loaded && !verification && !progress && (
        <>
          <h2 className="text-3xl font-semibold">Let’s verify your email.</h2>
          <p className="my-5 text-slate-500">
            Open the verification link from your email to continue, or start a
            new company signup.
          </p>
          <Link href="/signup" className={buttonClass}>
            Create a workspace
          </Link>
        </>
      )}
      {error && (
        <div className="mt-5">
          <Notice error>{error}</Notice>
        </div>
      )}
      {message && (
        <div className="mt-5">
          <Notice>{message}</Notice>
        </div>
      )}
    </OnboardingShell>
  );
}
