"use client";

import { useState } from "react";
import { Send, Bell } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { broadcastNotification, NotificationType } from "@/services/notifications.service";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useMutation } from "@tanstack/react-query";

const TYPES: { value: NotificationType; label: string; description: string }[] = [
  { value: "INFO", label: "Info", description: "General update or announcement" },
  { value: "ACTION_REQUIRED", label: "Action Required", description: "Employee needs to do something" },
  { value: "REMINDER", label: "Reminder", description: "Time-sensitive nudge" },
  { value: "ALERT", label: "Alert", description: "Urgent or critical message" },
];

function BroadcastForm() {
  const { accessToken } = useAuthStore();
  const [type, setType] = useState<NotificationType>("INFO");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [actionUrl, setActionUrl] = useState("");
  const [sent, setSent] = useState(false);

  const sendMutation = useMutation({
    mutationFn: () => broadcastNotification(accessToken!, {
      type,
      title,
      message,
      ...(actionUrl && { actionUrl }),
    }),
    onSuccess: () => {
      setSent(true);
      setTitle("");
      setMessage("");
      setActionUrl("");
      setTimeout(() => setSent(false), 3000);
    },
  });

  const sending = sendMutation.isPending;
  const error = sendMutation.error ? (sendMutation.error as any).message : null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    sendMutation.mutate();
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-2 rounded-lg bg-blue-50">
          <Bell className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Broadcast Notification</h1>
          <p className="text-sm text-slate-500">Send a notification to all employees in your organization</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Type</label>
          <div className="grid grid-cols-2 gap-2">
            {TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setType(t.value)}
                className={`p-3 rounded-lg border text-left transition-colors ${
                  type === t.value
                    ? "border-blue-500 bg-blue-50"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <p className="text-sm font-medium text-slate-800">{t.label}</p>
                <p className="text-xs text-slate-500 mt-0.5">{t.description}</p>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={100}
            placeholder="e.g. System maintenance tonight"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Message</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
            maxLength={500}
            rows={4}
            placeholder="Write your message here..."
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
          <p className="text-xs text-slate-400 mt-1 text-right">{message.length}/500</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Link <span className="text-slate-400 font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={actionUrl}
            onChange={(e) => setActionUrl(e.target.value)}
            placeholder="e.g. /sims or /reports"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-slate-400 mt-1">If set, clicking the notification will navigate here</p>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}

        <button
          type="submit"
          disabled={sending || !title || !message}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {sending ? (
            <>Sending...</>
          ) : sent ? (
            <>Sent to all employees!</>
          ) : (
            <><Send className="h-4 w-4" /> Send to all employees</>
          )}
        </button>
      </form>
    </div>
  );
}

export default function NotificationsSettingsPage() {
  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT]}>
      <div className="max-w-7xl mx-auto py-10 px-4">
        <BroadcastForm />
      </div>
    </ProtectedRoute>
  );
}
