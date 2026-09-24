"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import {
  Notice,
  OnboardingShell,
  PasswordField,
  StepHeading,
  buttonClass,
  secondaryButtonClass,
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
  { key: "REGISTERING_DOMAIN", title: "Register workspace address" },
  { key: "CHECKING_HTTPS", title: "Check secure (HTTPS) access" },
  { key: "CREATING_WORKSPACE", title: "Create workspace and administrator" },
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
  const host = data.workspaceUrl
    ?.replace(/^https?:\/\//, "")
    .replace(/\/login$/, "");
  const company = data.companyName || "your company";
  return (
    <OnboardingShell
      step={ready ? 4 : 2}
      address={host}
      addressPlaceholder={
        data.companyName ? `Being prepared for ${data.companyName}` : undefined
      }
    >
      {(!loaded || (progress && !data.status)) && (
        <div
          className="flex items-center gap-3 text-sm text-slate-500"
          role="status"
        >
          <Loader2 size={18} className="animate-spin" /> Loading your signup…
        </div>
      )}
      {verification && (
        <>
          <StepHeading title="Set your password">
            This confirms your email and starts creating your workspace.
          </StepHeading>
          <form onSubmit={verify} className="space-y-5">
            <label className="flex items-start gap-3 rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={existingAccount}
                onChange={(e) => {
                  setExistingAccount(e.target.checked);
                  setError("");
                }}
                className="mt-0.5 h-4 w-4 accent-gemba-navy"
              />
              <span>
                I already have a GembaPMS account
                <span className="block text-xs text-slate-500">
                  Link this workspace to it instead of creating a new password.
                </span>
              </span>
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
                ? "Your current password stays the same."
                : "At least 12 characters. A short phrase is easier to remember and harder to guess."}
            </p>
            <button disabled={busy} className={`${buttonClass} w-full`}>
              {busy && <Loader2 size={17} className="animate-spin" />}
              {busy ? "Verifying…" : "Verify and create workspace"}
            </button>
          </form>
        </>
      )}
      {data.status === "PENDING_VERIFICATION" && (
        <>
          <StepHeading title="Verify your email">
            We sent a verification link to your administrator email. Open it to
            finish setting up {company}.
          </StepHeading>
          <ul className="mb-8 space-y-2 text-sm text-slate-600">
            <li>The link expires after 30 minutes.</li>
            <li>If it hasn&apos;t arrived, check your spam folder.</li>
            <li>You can keep this page open to follow progress.</li>
          </ul>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-slate-200 pt-6">
            <button
              disabled={busy}
              onClick={() => void action("resend")}
              className={secondaryButtonClass}
            >
              {busy ? "Sending…" : "Resend email"}
            </button>
            <Link
              href="/signup"
              className="text-sm text-slate-500 underline-offset-4 hover:text-gemba-navy hover:underline"
            >
              Wrong details? Start again
            </Link>
          </div>
        </>
      )}
      {data.status === "PROVISIONING" && (
        <>
          <StepHeading title={`Setting up ${host || company}`}>
            Your email is verified. This usually takes a few minutes.
          </StepHeading>
          <ol
            className="mb-8 divide-y divide-slate-200 border-y border-slate-200"
            aria-label="Workspace setup progress"
          >
            {stages.map(({ key, title }, index) => {
              const complete = stageIndex > index;
              const active = stageIndex === index;
              return (
                <li
                  key={key}
                  aria-current={active ? "step" : undefined}
                  className="flex items-center gap-3 py-3.5 text-sm"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                    {complete ? (
                      <Check
                        size={17}
                        strokeWidth={3}
                        className="text-gemba-lime-ink"
                      />
                    ) : active ? (
                      <Loader2
                        size={17}
                        className="text-gemba-navy motion-safe:animate-spin"
                      />
                    ) : (
                      <span className="h-2 w-2 rounded-full bg-slate-300" />
                    )}
                  </span>
                  <span
                    className={`flex-1 ${complete || active ? "text-slate-900" : "text-slate-400"}`}
                  >
                    {title}
                  </span>
                  <span className="text-xs text-slate-500">
                    {complete ? "Done" : active ? "In progress" : "Waiting"}
                  </span>
                </li>
              );
            })}
          </ol>
          <p role="status" className="text-sm leading-relaxed text-slate-500">
            {data.retryScheduled
              ? "The address isn't reachable yet. An automatic retry is scheduled; you don't need to submit again."
              : stageIndex < 0
                ? "Waiting for setup to start…"
                : slow
                  ? "This is taking longer than usual. Your setup is saved and we're still checking."
                  : "You can leave this page. We'll email you when it's ready."}
          </p>
        </>
      )}
      {ready && (
        <>
          <StepHeading title="Your workspace is ready">
            Sign in with your administrator email and password. You&apos;ll be
            offered a logo upload on the first sign-in.
          </StepHeading>
          <div className="mb-8 rounded-lg border border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500">
              {data.companyName || "Workspace"}
            </p>
            <p className="mt-1 flex items-center gap-2 font-mono text-sm break-all text-slate-900">
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 rounded-full bg-gemba-lime"
              />
              {host}
            </p>
          </div>
          {continueUrl && (
            <a href={continueUrl} className={`${buttonClass} w-full`}>
              Go to sign in <ArrowRight size={17} />
            </a>
          )}
        </>
      )}
      {data.status === "FAILED" && (
        <>
          <StepHeading title="Workspace setup didn't finish">
            {data.canRetry
              ? "Your details are saved. Wait a minute, then retry."
              : "We couldn't complete setup with these details. Contact Gemba PMS support and quote the reference below."}
          </StepHeading>
          {data.canRetry && (
            <button
              disabled={busy}
              onClick={() => void action("retry")}
              className={buttonClass}
            >
              {busy ? "Retrying…" : "Retry setup"}
            </button>
          )}
          <p className="mt-6 font-mono text-xs break-all text-slate-500">
            Reference: {progress?.id}
          </p>
        </>
      )}
      {data.status === "EXPIRED" && (
        <>
          <StepHeading title="Verification link expired">
            Start a new signup to get a fresh link.
          </StepHeading>
          <Link href="/signup" className={buttonClass}>
            Start again <ArrowRight size={17} />
          </Link>
        </>
      )}
      {loaded && !verification && !progress && (
        <>
          <StepHeading title="Verify your email">
            Open the verification link from your email to continue, or start a
            new company signup.
          </StepHeading>
          <Link href="/signup" className={buttonClass}>
            Create a workspace
          </Link>
        </>
      )}
      {error && (
        <div className="mt-6">
          <Notice error>{error}</Notice>
        </div>
      )}
      {message && (
        <div className="mt-6">
          <Notice>{message}</Notice>
        </div>
      )}
    </OnboardingShell>
  );
}
