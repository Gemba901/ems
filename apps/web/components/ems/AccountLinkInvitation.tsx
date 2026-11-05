"use client";

import { useEffect, useState } from "react";

type Lookup = { valid: false; message: string } | {
  valid: true; organizationName: string; name: string; employeeCode: string | null;
  verified: boolean; hasPassword: boolean;
};
async function post<T>(action: string, body: unknown): Promise<T> {
  const response = await fetch(`/api/ems/invitations/account/${action}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(" ") : data.message || "The request could not be completed. Try again.");
  return data;
}

/** Existing-account verification and explicit company acceptance, separate from normal setup. */
export default function AccountLinkInvitation({ token }: { token: string }) {
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState<"accepted" | "declined" | null>(null);
  useEffect(() => {
    let live = true;
    post<Lookup>("lookup", { token }).then(value => { if (live) setLookup(value); }).catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [token]);
  const run = async (action: "verify" | "accept" | "decline") => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      if (action === "verify") setLookup(await post<Lookup>(action, { token }));
      else {
        await post(action, { token, ...(action === "accept" ? { consent, password } : {}) });
        setDone(action === "accept" ? "accepted" : "declined");
        setPassword(""); setConfirm("");
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to continue."); }
    finally { setBusy(false); }
  };
  const strong = password.length >= 12 && password.length <= 200 && [/[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(rule => rule.test(password)).length >= 3;
  const canAccept = lookup?.valid && lookup.verified && consent && (lookup.hasPassword ? !!password : strong && password === confirm);
  const button = "rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50";
  return <main className="flex min-h-screen items-center justify-center bg-slate-900 px-4 py-8">
    <section className="w-full max-w-md space-y-5 rounded-2xl border border-slate-200 bg-white p-7 shadow-lg" aria-labelledby="account-link-heading">
      <p className="text-xs font-semibold uppercase tracking-widest text-amber-700">BEES · Account access</p>
      <h1 id="account-link-heading" className="text-2xl font-semibold text-slate-900">{done === "accepted" ? "Company access accepted" : done === "declined" ? "Request declined" : "Review company access"}</h1>
      {done ? <>
        <p className="text-sm text-slate-600">{done === "accepted" ? "Your employee record is now linked to your account. Sign in to this company to continue." : "This request has not added company access or linked the employee record. HR can see that you declined."}</p>
        {done === "accepted" && <a href="/login" className={`${button} block text-center`}>Continue to sign in</a>}
      </> : lookup?.valid ? <>
        <dl className="space-y-2 rounded-lg bg-slate-50 p-4 text-sm text-slate-800">
          <div><dt className="text-xs text-slate-500">Company requesting access</dt><dd className="font-semibold">{lookup.organizationName}</dd></div>
          <div><dt className="text-xs text-slate-500">Employee record to link</dt><dd>{lookup.name}{lookup.employeeCode ? ` · ${lookup.employeeCode}` : ""}</dd></div>
        </dl>
        <p className="text-sm text-slate-600">This request was sent directly to an existing account email. Checking the request does not grant new company access. If the employee record is not yours, decline.</p>
        {!lookup.verified ? <button className={`${button} w-full`} disabled={busy} onClick={() => void run("verify")}>{busy ? "Checking…" : "Verify this email"}</button> : <form className="space-y-4" onSubmit={e => { e.preventDefault(); if (canAccept) void run("accept"); }}>
          <p role="status" className="text-sm font-medium text-emerald-700">Email control verified. Company access still awaits your acceptance.</p>
          <label className="block text-sm font-medium text-slate-700">{lookup.hasPassword ? "Existing BEES password" : "Create your BEES password"}
            <input className="mt-2 w-full rounded-lg border border-slate-300 p-3" type="password" maxLength={200} required value={password}
              autoComplete={lookup.hasPassword ? "current-password" : "new-password"} onChange={e => setPassword(e.target.value)} />
          </label>
          {!lookup.hasPassword && <>
            <p className="text-xs text-slate-500">Use at least 12 characters and three of: capital letters, small letters, numbers and symbols. This password is for your shared BEES login.</p>
            <label className="block text-sm font-medium text-slate-700">Confirm password
              <input className="mt-2 w-full rounded-lg border border-slate-300 p-3" type="password" autoComplete="new-password" maxLength={200} required value={confirm} onChange={e => setConfirm(e.target.value)} />
            </label>
            {confirm && password !== confirm && <p className="text-xs text-amber-800">The passwords do not match.</p>}
          </>}
          <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
            <input type="checkbox" className="mt-1" checked={consent} onChange={e => setConsent(e.target.checked)} />
            <span>This employee record is mine. I agree to link my BEES account and accept access to <strong>{lookup.organizationName}</strong>.</span>
          </label>
          <button className={`${button} w-full`} type="submit" disabled={busy || !canAccept}>{busy ? "Confirming…" : "Accept company access"}</button>
        </form>}
        <button type="button" className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-700 disabled:opacity-50" disabled={busy} onClick={() => void run("decline")}>This is not me / Decline</button>
      </> : lookup ? <p role="alert" className="text-sm text-slate-700">{lookup.message}</p> : !error ? <p role="status" className="text-sm text-slate-600">Checking request…</p> : null}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </section>
  </main>;
}
