"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { PageHeader } from "@/components/patterns/PageHeader";
import { Switch } from "@/components/ui/switch";
import { ErrorState } from "@/components/patterns/ErrorState";

import { useId, useState } from "react";
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
  const labelId = useId();
  const descriptionId = useId();
  return (
    <div className="flex items-center justify-between py-4 border-b border-border last:border-0">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-muted text-muted-foreground">{icon}</div>
        <div>
          <p id={labelId} className="text-sm font-medium text-foreground">{label}</p>
          <p id={descriptionId} className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <Switch aria-labelledby={labelId} aria-describedby={descriptionId} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}

function NotificationPreferencesCard() {
  const { accessToken } = useAuthStore();
  const queryClient = useQueryClient();

  const { data: prefs, isLoading, error: queryError, refetch } = useQuery({
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

  if (queryError) {
    return <ErrorState title="Could not load notification preferences" description={queryError.message} onRetry={() => void refetch()} />;
  }

  if (isLoading || !prefs) {
    return (
      <div className="bg-card rounded-xl border border-border p-6">
        <div className="h-4 w-40 bg-muted rounded animate-pulse mb-6" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-muted rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-muted">
          <Bell className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground">Notification Channels</h2>
          <p className="text-xs text-muted-foreground">Choose how you want to receive notifications</p>
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
        <p role="alert" className="mt-3 text-xs text-danger">
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
  const error = sendMutation.error?.message;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken || sending || !title.trim() || !message.trim()) return;
    sendMutation.mutate();
  }

  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-info-subtle">
          <Send className="h-5 w-5 text-info" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground">Broadcast Notification</h2>
          <p className="text-xs text-muted-foreground">Send a notification to all employees in your organization</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Type</label>
          <div className="grid gap-2 sm:grid-cols-2">
            {TYPES.map((t) => (
              <Button variant="ghost"
                key={t.value} aria-pressed={type === t.value}
                type="button"
                onClick={() => setType(t.value)}
                className={`h-auto flex-col items-start whitespace-normal rounded-lg border p-3 text-left transition-colors ${
                  type === t.value
                    ? "border-info bg-info-subtle"
                    : "border-border hover:border-border"
                }`}
              >
                <p className="text-sm font-medium text-foreground">{t.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
              </Button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="broadcast-title" className="block text-sm font-medium text-foreground mb-1">Title</label>
          <Input
            type="text"
            id="broadcast-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={100}
            placeholder="e.g. System maintenance tonight"
            className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div>
          <label htmlFor="broadcast-message" className="block text-sm font-medium text-foreground mb-1">Message</label>
          <Textarea
            id="broadcast-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
            maxLength={500}
            rows={4}
            placeholder="Write your message here..."
            className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
          <p className="text-xs text-muted-foreground mt-1 text-right">{message.length}/500</p>
        </div>

        <div>
          <label htmlFor="broadcast-actionUrl" className="block text-sm font-medium text-foreground mb-1">
            Link <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <Input
            type="text"
            id="broadcast-actionUrl"
            value={actionUrl}
            onChange={(e) => setActionUrl(e.target.value)}
            placeholder="e.g. /sims or /reports"
            className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger bg-danger-subtle rounded-lg px-3 py-2">{error}</p>
        )}

        <Button
          type="submit"
          disabled={sending || !title.trim() || !message.trim()}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
        </Button>
      </form>
    </div>
  );
}

export default function NotificationsSettingsPage() {
  const { user } = useAuthStore();
  const isAdmin = user && ADMIN_ROLES.includes(user.roleLevel);

  return (
    <div className="max-w-2xl mx-auto py-10 px-4 space-y-6">
      <PageHeader
        title="Notifications"
        description="Manage how you receive notifications."
        breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Notifications" }]}
      />

      <NotificationPreferencesCard />

      {isAdmin && <BroadcastForm />}
    </div>
  );
}
