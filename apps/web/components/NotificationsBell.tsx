"use client";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { useEffect, useState } from "react";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";
import { useNotificationsStore } from "@/store/notifications.store";
import { Notification } from "@/services/notifications.service";

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const token = useAuthStore((s) => s.accessToken);
  const { notifications, unreadCount, isLoading, fetch, markRead, markAllRead } =
    useNotificationsStore();

  // fetch on mount and every 60s
  useEffect(() => {
    if (!token) return;
    fetch(token);
    const interval = setInterval(() => fetch(token), 60_000);
    return () => clearInterval(interval);
  }, [fetch, token]);

  async function handleNotificationClick(n: Notification) {
    if (!token) return;
    if (!n.isRead) await markRead(token, n.id);
    setOpen(false);
    if (n.actionUrl) router.push(n.actionUrl);
  }

  async function handleMarkAllRead() {
    if (!token) return;
    await markAllRead(token);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button variant="ghost" size="icon-lg" className="relative text-muted-foreground" />}
        aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}
      >
        <Bell className="size-5" />
        {unreadCount > 0 && (
          <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-0.5 text-[10px] font-bold text-primary-foreground">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </PopoverTrigger>

      <PopoverContent aria-label="Notifications" className="w-80 max-w-[calc(100vw-1rem)] p-0">
        {/* header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-semibold text-foreground">Notifications</span>
          {unreadCount > 0 && (
            <Button variant="ghost"
              onClick={handleMarkAllRead}
              className="flex items-center gap-1 text-xs text-info hover:text-info"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </Button>
          )}
        </div>

        {/* list */}
        <div className="max-h-[60vh] overflow-y-auto sm:max-h-96">
          {isLoading ? (
            <div role="status" aria-label="Loading notifications" className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : notifications.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No notifications yet</p>
          ) : (
            notifications.map((n) => (
              <Button variant="ghost"
                key={n.id}
                onClick={() => handleNotificationClick(n)}
                className={`h-auto w-full min-w-0 justify-start whitespace-normal rounded-none px-4 py-3 text-left transition-colors hover:bg-muted border-b border-border last:border-0 ${
                  !n.isRead ? "bg-info-subtle/50" : ""
                }`}
              >
                <div className="flex items-start gap-2">
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      n.type === "ACTION_REQUIRED"
                        ? "bg-warning"
                        : n.type === "ALERT"
                        ? "bg-danger"
                        : "bg-info"
                    } ${n.isRead ? "opacity-0" : ""}`}
                  />
                  <div className="min-w-0 w-full">
                    <p className="text-xs font-semibold text-foreground">{n.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 break-words">{n.message}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {new Date(n.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              </Button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
