"use client";

import { useEffect, useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Loader2, Send } from "lucide-react";
import { EmsService, type InvitationSelection, type InvitationSendResult } from "@/services/ems.service";
import { whatsappLink } from "./ems-invitations";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Invite employees: preview who gets what (and who's skipped, with reasons), then send.
 * Email goes out automatically; WhatsApp messages open on HR's own device, one tap each.
 * Every skip is saved on the employee, so nothing here needs to be remembered.
 */
export default function InvitationDialog({ selection, title, accessToken, onClose }: {
  selection: InvitationSelection; title: string; accessToken: string; onClose: () => void;
}) {
  const titleId = useId();
  const queryClient = useQueryClient();
  const [resend, setResend] = useState(!!selection.resend);
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);
  const request = { ...selection, resend };

  const preview = useQuery({
    queryKey: ["ems-invitation-preview", request],
    queryFn: () => EmsService.previewInvitations(request, accessToken),
    gcTime: 0, staleTime: 0,
  });
  const send = useMutation({
    mutationFn: () => EmsService.sendInvitations(request, window.location.origin, accessToken),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ems-employees"] });
      queryClient.invalidateQueries({ queryKey: ["ems-employee-invitation"] });
    },
  });
  const busy = send.isPending;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const data = preview.data, result = send.data;
  const outgoing = data ? data.counts.SETUP + data.counts.ACCESS_NOTICE + data.counts.CONTACT_NOTICE : 0;
  const copy = async (key: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); } catch { setCopied(null); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={() => { if (!busy) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} onMouseDown={event => event.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-2xl bg-white text-sm shadow-xl">
        <div className="border-b border-slate-100 p-5 pb-3">
          <h2 id={titleId} className="text-base font-bold text-slate-900">{title}</h2>
          {data && <p className="mt-1 text-xs text-slate-500">Channel: {data.channel === "EMAIL" ? "Email (sent automatically)" : "WhatsApp (opens on this device, you press send)"}</p>}
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {!result && (preview.isPending ? <p className="flex items-center gap-2 text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Checking who to invite…</p>
            : preview.error ? <p role="alert" className="text-red-600">{(preview.error as Error).message}</p>
            : data && <>
              <p className="text-slate-700"><strong>{plural(data.total, "employee")}</strong> selected</p>
              <ul className="space-y-1 text-xs text-slate-700">
                {data.counts.SETUP > 0 && <li><strong>{data.counts.SETUP}</strong> will get a link to create their password (valid 7 days, single use)</li>}
                {data.counts.ACCESS_NOTICE > 0 && <li><strong>{data.counts.ACCESS_NOTICE}</strong> already have a password: they get a notice to sign in</li>}
                {data.counts.CONTACT_NOTICE > 0 && <li className="text-amber-800"><strong>{data.counts.CONTACT_NOTICE}</strong> share an email or number with someone else: notice only, set up their access in person</li>}
                {data.counts.PENDING > 0 && <li className="text-slate-500"><strong>{data.counts.PENDING}</strong> already have a valid invitation: unchanged</li>}
                {data.counts.ACCEPTED > 0 && <li className="text-slate-500"><strong>{data.counts.ACCEPTED}</strong> already accepted: unchanged</li>}
                {data.counts.SKIPPED > 0 && <li className="text-amber-800"><strong>{data.counts.SKIPPED}</strong> skipped (saved on each profile; filter the list by “Needs attention” later)</li>}
              </ul>
              {data.skipped.length > 0 && <details className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                <summary className="cursor-pointer font-semibold">Who is skipped and why</summary>
                <ul className="mt-1 max-h-32 list-disc overflow-y-auto pl-5">{data.skipped.map(s => <li key={s.employeeId}>{s.name}: {s.reason}</li>)}</ul>
              </details>}
              {data.counts.PENDING > 0 && <label className="flex items-center gap-2 text-xs text-slate-700">
                <input type="checkbox" checked={resend} onChange={event => setResend(event.target.checked)} disabled={busy} />
                Also resend to people with a valid invitation (their old link stops working)
              </label>}
            </>)}

          {result && <ResultView result={result} opened={opened} setOpened={setOpened} copied={copied} copy={copy} />}
          {send.error && <p role="alert" className="text-xs text-red-600">{(send.error as Error).message}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 p-4">
          <button type="button" onClick={onClose} disabled={busy}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">{result ? "Done" : "Cancel"}</button>
          {!result && <button type="button" disabled={!data || outgoing === 0 || busy} onClick={() => send.mutate()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            {data?.channel === "WHATSAPP" ? `Prepare ${plural(outgoing, "message")}` : `Send ${plural(outgoing, "invitation")}`}
          </button>}
        </div>
      </div>
    </div>
  );
}

function ResultView({ result, opened, setOpened, copied, copy }: {
  result: InvitationSendResult; opened: Set<string>; setOpened: (next: Set<string>) => void;
  copied: string | null; copy: (key: string, text: string) => void;
}) {
  return <div className="space-y-3">
    <p role="status" className="text-slate-700">
      {result.channel === "EMAIL"
        ? <>{plural(result.sent, "invitation")} and {plural(result.notices, "notice")} emailed.</>
        : <>{plural(result.share.length, "message")} ready to send from WhatsApp.</>}
      {result.skipped > 0 && <> {result.skipped} skipped.</>}{result.failed > 0 && <span className="text-red-700"> {result.failed} failed.</span>}
    </p>
    {result.failures.length > 0 && <ul className="list-disc rounded-lg border border-red-200 bg-red-50 py-2 pl-7 pr-3 text-xs text-red-800">
      {result.failures.map(f => <li key={f.employeeId}>{f.name}: {f.error}</li>)}</ul>}
    {result.share.length > 0 && <div className="space-y-1">
      <p className="text-xs text-slate-500">Open each one, then press send in WhatsApp. Links only work once and expire after 7 days. Closing this window doesn’t lose anything: you can resend later.</p>
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {result.share.map(item => {
          const link = whatsappLink(item.number, item.message);
          return <li key={item.employeeId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <span className="min-w-0 text-xs"><span className="font-semibold text-slate-800">{item.name}</span> <span className="text-slate-500">· {item.number}{item.kind !== "SETUP" ? " · notice" : ""}</span></span>
            <span className="flex gap-1.5">
              {link && <a href={link} target="_blank" rel="noopener noreferrer" onClick={() => setOpened(new Set(opened).add(item.employeeId))}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${opened.has(item.employeeId) ? "bg-slate-100 text-slate-500" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}>
                <ExternalLink className="h-3 w-3" /> {opened.has(item.employeeId) ? "Opened" : "Open in WhatsApp"}</a>}
              <button type="button" onClick={() => copy(item.employeeId, item.message)}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">
                <Copy className="h-3 w-3" /> {copied === item.employeeId ? "Copied" : "Copy message"}</button>
            </span>
          </li>;
        })}
      </ul>
    </div>}
    {result.inPerson.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
      <p className="font-semibold">Set up in person ({result.inPerson.length})</p>
      <p>Their email or number is shared, so they got a notice without a link. Give each a temporary password in person.</p>
      <ul className="mt-1 list-disc pl-5">{result.inPerson.map(p => <li key={p.employeeId}>{p.name}</li>)}</ul>
    </div>}
  </div>;
}
