"use client";

import { useState } from "react";
import { Send, Bell, Mail, MessageSquare } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import {
  broadcastNotification,
  getNotificationPreferences,
  updateNotificationPreferences,
  NotificationType,
  NotificationPreferences,
} from "@/services/notifications.service";
import { Role } from "@/store/auth.store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const TYPES: { value: NotificationType; label: string; description: string }[] = [
  { value: "INFO", label: "Info", description: "General update or announcement" },
  { value: "ACTION_REQUIRED", label: "Action Required", description: "Employee needs to do something" },
  { value: "REMINDER", label: "Reminder", description: "Time-sensitive nudge" },
  { value: "ALERT", label: "Alert", description: "Urgent or critical message" },
];

const ADMIN_ROLES: Role[] = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT];

function ChannelToggle({
  label,
  description,
  icon,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  icon: React.ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-slate-100 last:border-0">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-slate-50 text-slate-500">{icon}</div>
        <div>
          <p className="text-sm font-medium text-slate-800">{label}</p>
          <p className="text-xs text-slate-500">{description}</p>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed ${
          checked ? "bg-blue-600" : "bg-slate-200"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

function NotificationPreferencesCard() {
  const { accessToken } = useAuthStore();
  const queryClient = useQueryClient();

  const { data: prefs, isLoading } = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: () => getNotificationPreferences(accessToken!),
    enabled: !!accessToken,
  });

  const mutation = useMutation({
    mutationFn: (updated: Partial<NotificationPreferences>) =>
      updateNotificationPreferences(accessToken!, updated),
    onSuccess: (data) => {
      queryClient.setQueryData(["notification-preferences"], data);
    },
  });

  if (isLoading || !prefs) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="h-4 w-40 bg-slate-100 rounded animate-pulse mb-6" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-slate-50 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-slate-50">
          <Bell className="h-5 w-5 text-slate-600" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900">Notification Channels</h2>
          <p className="text-xs text-slate-500">Choose how you want to receive notifications</p>
        </div>
      </div>

      <ChannelToggle
        label="Email"
        description="Receive notifications at your registered email address"
        icon={<Mail className="h-4 w-4" />}
        checked={prefs.email}
        disabled={mutation.isPending}
        onChange={(v) => mutation.mutate({ email: v })}
      />
      <ChannelToggle
        label="SMS"
        description="Text messages to your phone number (coming soon)"
        icon={<MessageSquare className="h-4 w-4" />}
        checked={prefs.sms}
        disabled
        onChange={(v) => mutation.mutate({ sms: v })}
      />
      <ChannelToggle
        label="WhatsApp"
        description="WhatsApp messages to your registered number (coming soon)"
        icon={<MessageSquare className="h-4 w-4" />}
        checked={prefs.whatsapp}
        disabled
        onChange={(v) => mutation.mutate({ whatsapp: v })}
      />

      {mutation.isError && (
        <p className="mt-3 text-xs text-red-600">
          Failed to save preferences. Please try again.
        </p>
      )}
    </div>
  );
}

function BroadcastForm() {
  const { accessToken } = useAuthStore();
  const [type, setType] = useState<NotificationType>("INFO");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [actionUrl, setActionUrl] = useState("");
  const [sent, setSent] = useState(false);

  const sendMutation = useMutation({
    mutationFn: () =>
      broadcastNotification(accessToken!, {
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
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-blue-50">
          <Send className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900">Broadcast Notification</h2>
          <p className="text-xs text-slate-500">Send a notification to all employees in your organization</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
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
            <>
              <Send className="h-4 w-4" /> Send to all employees
            </>
          )}
        </button>
      </form>
    </div>
  );
}

export default function NotificationsSettingsPage() {
  const { user } = useAuthStore();
  const isAdmin = user && ADMIN_ROLES.includes(user.roleLevel);

  return (
    <div className="max-w-2xl mx-auto py-10 px-4 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Notifications</h1>
        <p className="text-sm text-slate-500 mt-1">Manage how you receive notifications</p>
      </div>

      <NotificationPreferencesCard />

      {isAdmin && <BroadcastForm />}
    </div>
  );
}
