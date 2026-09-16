"use client";
import { useEffect, useState } from "react";

export default function SignupPage() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [platform, setPlatform] = useState(false);
  useEffect(() => {
    fetch("/api/workspace")
      .then((res) => res.json())
      .then((data) => setPlatform(data.kind === "platform"))
      .catch(() => setError("Unable to load workspace information."));
  }, []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const fields = Object.fromEntries(new FormData(event.currentTarget));
      const fingerprint = JSON.stringify(fields);
      // Reuse the same key after a lost response; changing details creates a new request.
      const previous = JSON.parse(
        sessionStorage.getItem("gemba-signup-draft") ?? "null",
      );
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
      const res = await fetch("/api/onboarding/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...fields, requestKey }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(
          res.status === 404
            ? "Signup is not available yet. Contact your administrator."
            : data.message || "Unable to start signup",
        );
      sessionStorage.setItem(
        "gemba-signup-progress",
        JSON.stringify({ id: data.id, token: requestKey }),
      );
      setSubmitted(true);
      window.location.assign("/signup/verify");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to start signup",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-lg p-8">
      <h1 className="text-2xl font-semibold">Create your company workspace</h1>
      {submitted ? (
        <p className="mt-6">
          Check your email for a verification link. It expires in 30 minutes. If
          you already have an account, use its current password when verifying.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4">
          {[
            ["companyName", "Company name"],
            ["slug", "Company address"],
            ["firstName", "First name"],
            ["lastName", "Last name"],
            ["email", "Administrator email"],
            ["phone", "Phone number"],
            ["timeZone", "Timezone"],
          ].map(([name, label]) => (
            <label key={name} className="block text-sm">
              {label}
              <input
                className="mt-1 w-full rounded border p-2"
                name={name}
                type={name === "email" ? "email" : "text"}
                defaultValue={name === "timeZone" ? "UTC" : ""}
                required
                maxLength={name === "slug" ? 40 : name === "email" ? 254 : 120}
                placeholder={
                  name === "slug"
                    ? "acme"
                    : name === "phone"
                      ? "+254712345678"
                      : undefined
                }
              />
            </label>
          ))}
          <p className="text-sm text-slate-600">
            Choose 3–40 lowercase letters, numbers or hyphens for your company
            address. Company modules are selected by the platform team.
          </p>
          <button
            disabled={busy || !platform}
            className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
          >
            {busy ? "Submitting…" : "Send verification email"}
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-4 text-red-600">
          {error}
        </p>
      )}
      <a href="/login" className="mt-6 block text-blue-600">
        Back to sign in
      </a>
    </main>
  );
}
