"use client";

import AccountLinkInvitation from "@/components/auth/AccountLinkInvitation";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Check, ArrowRight, Loader2, AlertCircle, CheckCircle2, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Lookup = { valid: true; organizationName: string; name: string; employeeCode: string | null } | { valid: false; message: string };

/** Calls the public invitation routes on this company address (the web proxy adds the company context). */
async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`/api/ems/invitations/${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(Array.isArray(data?.message) ? data.message.join(" ") : data?.message || "Something went wrong. Try again.");
  return data as T;
}

/** Accept an account invitation: confirm it's you (name, code, company), then create a password. */
function InviteForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") || "";
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | { alreadyHadPassword: boolean }>(null);

  useEffect(() => {
    if (!token) { setLookup({ valid: false, message: "This invitation link is missing or incomplete." }); return; }
    post<Lookup>("lookup", { token }).then(setLookup).catch(e => setLookupError(e.message));
  }, [token]);

  // Same rules as password reset: 12+ characters and three of four kinds.
  const checks = {
    length: password.length >= 12,
    mixed: /[A-Z]/.test(password) && /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };
  const kinds = [/[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(rule => rule.test(password)).length;
  const canSubmit = password.length >= 12 && kinds >= 3 && password === confirmPassword;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || loading) return;
    setLoading(true); setError(null);
    try { setDone(await post<{ alreadyHadPassword: boolean }>("accept", { token, newPassword: password })); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not create your password."); }
    finally { setLoading(false); }
  };

  const card = "w-full sm:w-105 mx-auto p-8 bg-card rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-border";
  const input = "w-full px-4 py-3 bg-muted border border-border rounded-lg text-sm focus:ring-2 focus:ring-ring/20 focus:border-ring outline-none font-mono";
  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-8 sm:p-6 font-sans bg-auth-backdrop">
      <div className={card}>
        {done ? (
          <div className="flex flex-col items-center text-center">
            <div className="h-12 w-12 bg-success-subtle text-success rounded-full flex items-center justify-center mb-6"><CheckCircle2 className="h-6 w-6" /></div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-2">{done.alreadyHadPassword ? "You already have a password" : "Password created"}</h1>
            <p className="text-sm text-muted-foreground leading-relaxed mb-8">{done.alreadyHadPassword
              ? "Your account already had a password, so it wasn't changed. Sign in with it, or use Forgot password."
              : "You can now sign in with your phone number, email or employee code and this password."}</p>
            <Button variant="ghost" onClick={() => router.push("/login")} className="w-full bg-info hover:bg-info text-info-foreground py-3.5 rounded-lg text-sm font-medium h-auto whitespace-normal">Continue to sign in</Button>
          </div>
        ) : lookupError ? (
          <p role="alert" className="flex items-center gap-2 text-sm text-danger"><AlertCircle className="h-4 w-4" /> {lookupError}</p>
        ) : !lookup ? (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Checking your invitation…</p>
        ) : !lookup.valid ? (
          <div className="flex flex-col items-center text-center">
            <div className="h-12 w-12 bg-danger-subtle text-danger rounded-full flex items-center justify-center mb-6"><AlertCircle className="h-6 w-6" /></div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-2">Link not valid</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">{lookup.message}</p>
          </div>
        ) : (
          <>
            <div className="flex flex-col items-center mb-6 text-center">
              <div className="h-12 w-12 bg-primary rounded-xl flex items-center justify-center mb-5"><UserCheck className="h-5 w-5 text-warning" /></div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">Set up your account</h1>
              <p className="mt-1 text-sm text-muted-foreground">{lookup.organizationName}</p>
            </div>
            {/* Confirm it's really you before creating a password. */}
            <dl className="mb-6 grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted p-3 text-sm">
              <div><dt className="text-[11px] uppercase tracking-wider text-muted-foreground">Name</dt><dd className="font-medium text-foreground">{lookup.name}</dd></div>
              <div><dt className="text-[11px] uppercase tracking-wider text-muted-foreground">Employee code</dt><dd className="font-mono font-medium text-foreground">{lookup.employeeCode ?? "—"}</dd></div>
            </dl>
            <p className="mb-5 text-xs text-muted-foreground">Not you? Don't continue: tell your HR team this link reached the wrong person.</p>
            <form onSubmit={submit} className="space-y-5">
              <label className="block space-y-2">
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-mono">New password</span>
                <span className="relative block">
                  <Input type={show ? "text" : "password"} value={password} autoComplete="new-password"
                    onChange={e => { setPassword(e.target.value); setError(null); }} className={input} />
                  <Button variant="ghost" type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground h-auto whitespace-normal">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
                </span>
              </label>
              <label className="block space-y-2">
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-mono">Confirm password</span>
                <Input type={show ? "text" : "password"} value={confirmPassword} autoComplete="new-password"
                  onChange={e => { setConfirmPassword(e.target.value); setError(null); }} className={input} />
              </label>
              <ul className="grid grid-cols-2 gap-y-2 text-xs">
                {([["length", "12+ characters"], ["special", "Special symbol"], ["mixed", "Mixed case"], ["number", "Numbers"]] as const).map(([key, label]) =>
                  <li key={key} className={`flex items-center ${checks[key] ? "text-info" : "text-muted-foreground"}`}><Check className="h-3 w-3 mr-2" />{label}</li>)}
              </ul>
              <p className="text-xs text-muted-foreground">Use 12+ characters with at least three of: capitals, small letters, numbers, symbols.</p>
              {confirmPassword && password !== confirmPassword && <p className="text-xs text-warning">The passwords don't match yet.</p>}
              {error && <p role="alert" className="flex items-center text-danger text-xs font-medium"><AlertCircle className="h-3.5 w-3.5 mr-1.5" />{error}</p>}
              <Button variant="ghost" type="submit" disabled={!canSubmit || loading}
                className="w-full bg-info hover:bg-info text-info-foreground py-3.5 rounded-lg text-sm font-medium disabled:opacity-50 flex items-center justify-center h-auto whitespace-normal">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Create password <ArrowRight className="h-4 w-4 ml-2" /></>}
              </Button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}

function InvitationEntry() {
  const [accountToken, setAccountToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("account-link");
    if (token) {
      setAccountToken(token);
      // Keep the secret in memory, out of referrers and subsequent browser history entries.
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    setReady(true);
  }, []);
  if (!ready) return <p role="status">Loading invitation…</p>;
  return accountToken ? <AccountLinkInvitation token={accountToken} /> : <InviteForm />;
}

export default function InvitePage() {
  return <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-primary text-sm text-muted-foreground">Loading…</div>}><InvitationEntry /></Suspense>;
}
