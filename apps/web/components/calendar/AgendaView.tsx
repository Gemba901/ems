"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { useState } from "react";
import { CalendarService } from "@/services/calendar.service";

export function RequestActions({
  requestId, token, onDone,
}: {
  requestId: string;
  token: string;
  onDone: () => void;
}) {
  const [note,   setNote]   = useState("");
  const [saving, setSaving] = useState(false);

  const respond = async (status: "APPROVED" | "REJECTED") => {
    setSaving(true);
    try {
      await CalendarService.respondToRequest(requestId, { status, responseNote: note || undefined }, token);
      onDone();
    } catch { /* ignore */ } finally { setSaving(false); }
  };

  return (
    <div className="border-t border-primary/20 pt-2 space-y-1.5">
      <Input
        className="w-full text-xs border border-border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
        placeholder="Optional response note…"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex gap-2">
        <Button variant="ghost" onClick={() => respond("APPROVED")} disabled={saving}
          className="flex-1 text-xs font-semibold bg-success hover:bg-success text-success-foreground py-1.5 rounded-lg transition-colors disabled:opacity-50">
          Approve
        </Button>
        <Button variant="ghost" onClick={() => respond("REJECTED")} disabled={saving}
          className="flex-1 text-xs font-semibold bg-danger hover:bg-danger text-danger-foreground py-1.5 rounded-lg transition-colors disabled:opacity-50">
          Reject
        </Button>
      </div>
    </div>
  );
}
