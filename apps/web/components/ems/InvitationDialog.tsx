"use client";

import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Loader2, Send } from "lucide-react";
import { EmsService, type InvitationSelection, type InvitationSendResult } from "@/services/ems.service";
import { sharedContactResults, whatsappLink } from "./ems-invitations";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";

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

  const data = preview.data, result = send.data;
  const outgoing = data ? data.counts.SETUP + data.counts.ACCESS_NOTICE + data.counts.CONTACT_NOTICE + (data.counts.ACCOUNT_LINK ?? 0) : 0;
  const copy = async (key: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); } catch { setCopied(null); }
  };

  return (
    <Dialog open onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
      <DialogContent showCloseButton={false} aria-labelledby={titleId}
        className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-2xl bg-card text-sm shadow-xl gap-0 p-0 ring-0 sm:max-w-xl">
        <div className="border-b border-border p-5 pb-3">
          <h2 id={titleId} className="text-base font-bold text-foreground">{title}</h2>
          {data && <p className="mt-1 text-xs text-muted-foreground">Channel: {data.channel === "EMAIL" ? "Email (sent automatically)" : "WhatsApp (opens on this device, you press send)"}</p>}
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {!result && (preview.isPending ? <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Checking who to invite…</p>
            : preview.error ? <p role="alert" className="text-danger">{(preview.error as Error).message}</p>
            : data && <>
              <p className="text-foreground"><strong>{plural(data.total, "employee")}</strong> selected</p>
              <ul className="space-y-1 text-xs text-foreground">
                {(data.counts.ACCOUNT_LINK ?? 0) > 0 && <li><strong>{data.counts.ACCOUNT_LINK}</strong> will receive verification directly at an existing account email, even if the company uses WhatsApp. New login access stays pending until they verify and accept. HR cannot view or copy that link.</li>}
                {data.counts.SETUP > 0 && <li><strong>{data.counts.SETUP}</strong> will get a link to create their password (valid 7 days, single use)</li>}
                {data.counts.ACCESS_NOTICE > 0 && <li><strong>{data.counts.ACCESS_NOTICE}</strong> will receive an account-access notice, without a password-setup link; some accounts require verification</li>}
                {data.counts.CONTACT_NOTICE > 0 && <li className="text-warning"><strong>{data.counts.CONTACT_NOTICE}</strong> share an email or number with someone else: notice only, without a password-setup link. Review their contact details and account access.</li>}
                {data.counts.PENDING > 0 && <li className="text-muted-foreground"><strong>{data.counts.PENDING}</strong> already have a valid invitation: unchanged</li>}
                {data.counts.ACCEPTED > 0 && <li className="text-muted-foreground"><strong>{data.counts.ACCEPTED}</strong> already accepted: unchanged</li>}
                {data.counts.SKIPPED > 0 && <li className="text-warning"><strong>{data.counts.SKIPPED}</strong> skipped (saved on each profile; filter the list by “Needs attention” later)</li>}
              </ul>
              {data.skipped.length > 0 && <details className="rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2 text-xs text-warning">
                <summary className="cursor-pointer font-semibold">Who is skipped and why</summary>
                <ul className="mt-1 max-h-32 list-disc overflow-y-auto pl-5">{data.skipped.map(s => <li key={s.employeeId}>{s.name}: {s.reason}</li>)}</ul>
              </details>}
              {data.counts.PENDING > 0 && <label className="flex items-center gap-2 text-xs text-foreground">
                <Checkbox checked={resend} onCheckedChange={(checked) => setResend(checked)} disabled={busy} />
                Also resend to people with a valid invitation (their old link stops working)
              </label>}
            </>)}

          {result && <ResultView result={result} opened={opened} setOpened={setOpened} copied={copied} copy={copy} />}
          {send.error && <p role="alert" className="text-xs text-danger">{(send.error as Error).message}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-border p-4">
          <Button variant="ghost" type="button" onClick={onClose} disabled={busy}
            className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50 h-auto whitespace-normal">{result ? "Done" : "Cancel"}</Button>
          {!result && <Button variant="ghost" type="button" disabled={!data || outgoing === 0 || busy} onClick={() => send.mutate()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-info px-3 py-2 text-xs font-semibold text-info-foreground hover:bg-info disabled:opacity-40 h-auto whitespace-normal">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            {data?.channel === "WHATSAPP" ? `Send / prepare ${plural(outgoing, "request")}` : `Send ${plural(outgoing, "invitation")}`}
          </Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ResultView({ result, opened, setOpened, copied, copy }: {
  result: InvitationSendResult; opened: Set<string>; setOpened: (next: Set<string>) => void;
  copied: string | null; copy: (key: string, text: string) => void;
}) {
  const sharedContacts = sharedContactResults(result);
  return <div className="space-y-3">
    <p role="status" className="text-foreground">
      {result.channel === "EMAIL"
        ? <>{plural(result.sent, "invitation")} and {plural(result.notices, "notice")} emailed.</>
        : <>{plural(result.share.length, "message")} ready to send from WhatsApp.</>}
      {result.verificationSent > 0 && <> {plural(result.verificationSent, "account-verification email")} sent directly to existing account contacts.</>}
      {result.skipped > 0 && <> {result.skipped} skipped.</>}{result.failed > 0 && <span className="text-danger"> {result.failed} failed.</span>}
    </p>
    {result.failures.length > 0 && <ul className="list-disc rounded-lg border border-danger/30 bg-danger-subtle py-2 pl-7 pr-3 text-xs text-danger">
      {result.failures.map(f => <li key={f.employeeId}>{f.name}: {f.error}</li>)}</ul>}
    {result.share.length > 0 && <div className="space-y-1">
      <p className="text-xs text-muted-foreground">Open each one, then press send in WhatsApp. Links only work once and expire after 7 days. Closing this window doesn’t lose anything: you can resend later.</p>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {result.share.map(item => {
          const link = whatsappLink(item.number, item.message);
          return <li key={item.employeeId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <span className="min-w-0 text-xs"><span className="font-semibold text-foreground">{item.name}</span> <span className="text-muted-foreground">· {item.number}{item.kind !== "SETUP" ? " · notice" : ""}</span></span>
            <span className="flex gap-1.5">
              {link && <a href={link} target="_blank" rel="noopener noreferrer" onClick={() => setOpened(new Set(opened).add(item.employeeId))}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${opened.has(item.employeeId) ? "bg-muted text-muted-foreground" : "bg-success text-success-foreground hover:bg-success"}`}>
                <ExternalLink className="h-3 w-3" /> {opened.has(item.employeeId) ? "Opened" : "Open in WhatsApp"}</a>}
              <Button variant="ghost" type="button" onClick={() => copy(item.employeeId, item.message)}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted h-auto whitespace-normal">
                <Copy className="h-3 w-3" /> {copied === item.employeeId ? "Copied" : "Copy message"}</Button>
            </span>
          </li>;
        })}
      </ul>
    </div>}
    {result.inPerson.length > 0 && <div className="rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2 text-xs text-warning">
      <p className="font-semibold">Shared contacts — review required ({sharedContacts.length})</p>
      <p>No password-setup link was generated for these employees because their email or number is shared. Review their contact details and account access with an authorised administrator.</p>
      <ul className="mt-1 list-disc pl-5">{sharedContacts.map(p => <li key={p.employeeId}>
        {p.name}: <span className={p.failed ? "text-danger" : undefined}>{p.outcome}</span>
      </li>)}</ul>
    </div>}
  </div>;
}
