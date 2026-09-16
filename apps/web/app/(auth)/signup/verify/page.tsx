"use client";
import { useEffect, useState } from "react";
type Access = { id: string; token: string };
export default function VerifySignupPage() {
  const [verification, setVerification] = useState<Access | null>(null);
  const [progress, setProgress] = useState<Access | null>(null);
  const [status, setStatus] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(location.hash.slice(1));
    if (params.get("id") && params.get("token")) {
      const access = { id: params.get("id")!, token: params.get("token")! };
      sessionStorage.removeItem("gemba-signup-progress");
      sessionStorage.setItem(
        "gemba-signup-verification",
        JSON.stringify(access),
      );
      setVerification(access);
      history.replaceState(null, "", location.pathname);
    } else {
      const saved = sessionStorage.getItem("gemba-signup-verification");
      if (saved) setVerification(JSON.parse(saved));
      const existing = sessionStorage.getItem("gemba-signup-progress");
      if (existing) setProgress(JSON.parse(existing));
    }
  }, []);
  useEffect(() => {
    if (!progress) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/onboarding/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(progress),
        });
        const data = await res.json();
        if (!res.ok)
          throw new Error(
            "Unable to load signup progress. Try reloading this page.",
          );
        if (!cancelled) {
          setStatus(data.status);
          setWorkspace(data.workspaceUrl ?? "");
          setError("");
        }
      } catch (error) {
        if (!cancelled)
          setError(
            error instanceof Error ? error.message : "Connection failed",
          );
      }
    };
    void poll();
    const interval = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [progress]);
  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const password = new FormData(event.currentTarget).get("password");
      const res = await fetch("/api/onboarding/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...verification, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Verification failed");
      const access = { id: data.id, token: data.progressToken };
      sessionStorage.setItem("gemba-signup-progress", JSON.stringify(access));
      sessionStorage.removeItem("gemba-signup-verification");
      setVerification(null);
      setProgress(access);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  }
  async function resend() {
    const res = await fetch("/api/onboarding/resend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(progress),
    });
    const data = await res.json();
    setError(data.message || "Please try again");
  }
  async function retry() {
    const res = await fetch("/api/onboarding/retry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(progress),
    });
    const data = await res.json();
    if (!res.ok) setError(data.message || "Unable to retry");
    else setStatus(data.status);
  }
  return (
    <main className="mx-auto max-w-lg p-8">
      <h1 className="text-2xl font-semibold">Verify your company signup</h1>
      {verification && (
        <form onSubmit={verify} className="mt-6 space-y-4">
          <p>
            For a new account, choose a password of 12–72 characters. If you
            already have an account, enter its current password.
          </p>
          <label className="block">
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              minLength={1}
              maxLength={72}
              className="mt-2 w-full rounded border p-2"
            />
          </label>
          <button
            disabled={busy}
            className="rounded bg-blue-600 px-4 py-2 text-white"
          >
            {busy ? "Verifying…" : "Verify and create workspace"}
          </button>
        </form>
      )}
      {progress && (
        <p role="status" className="mt-6">
          {status === "READY"
            ? "Your workspace is ready."
            : status === "FAILED"
              ? "Workspace setup needs attention."
              : status === "EXPIRED"
                ? "This signup expired. Start a new signup."
                : status === "PENDING_VERIFICATION"
                  ? "Check your email to verify this signup."
                  : "Creating your workspace…"}
        </p>
      )}
      {status === "PENDING_VERIFICATION" && (
        <button
          onClick={() =>
            void resend().catch(() => setError("Unable to request email"))
          }
          className="mt-4 text-blue-600"
        >
          Resend verification email
        </button>
      )}
      {status === "FAILED" && (
        <button
          onClick={() =>
            void retry().catch(() =>
              setError("Unable to retry. Check your connection."),
            )
          }
          className="mt-4 text-blue-600"
        >
          Retry setup
        </button>
      )}
      {workspace && (
        <a href={workspace} className="mt-6 block text-blue-600">
          Open company workspace
        </a>
      )}
      {!verification && !progress && (
        <p className="mt-6">Open the verification link from your email.</p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-red-600">
          {error}
        </p>
      )}
    </main>
  );
}
