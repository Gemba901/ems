const API_URL = process.env.NEXT_PUBLIC_API_URL;

function authHeaders(token: string) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || `Request failed with status ${res.status}`);
  }
  return res.json();
}

export type NotificationType = "ACTION_REQUIRED" | "INFO" | "REMINDER" | "ALERT";

export interface Notification {
  id: string;
  employeeId: string;
  type: NotificationType;
  module: string;
  title: string;
  message: string;
  isRead: boolean;
  actionUrl: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface NotificationsResponse {
  notifications: Notification[];
  total: number;
  unreadCount: number;
  page: number;
  limit: number;
}

export interface BroadcastNotificationDto {
  type: NotificationType;
  title: string;
  message: string;
  actionUrl?: string;
}


export async function getNotifications(
  token: string,
  page = 1,
  limit = 20,
): Promise<NotificationsResponse> {
  const res = await fetch(
    `${API_URL}/notifications?page=${page}&limit=${limit}`,
    { headers: authHeaders(token) },
  );
  return handleResponse<NotificationsResponse>(res);
}

export async function markNotificationRead(token: string, id: string): Promise<void> {
  const res = await fetch(`${API_URL}/notifications/${id}/read`, {
    method: "PATCH",
    headers: authHeaders(token),
  });
  return handleResponse<void>(res);
}

export async function markAllNotificationsRead(token: string): Promise<void> {
  const res = await fetch(`${API_URL}/notifications/read-all`, {
    method: "PATCH",
    headers: authHeaders(token),
  });
  return handleResponse<void>(res);
}

export async function broadcastNotification(
  token: string,
  dto: BroadcastNotificationDto,
): Promise<void> {
  const res = await fetch(`${API_URL}/notifications/broadcast`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ ...dto, module: "SYSTEM" }),
  });
  return handleResponse<void>(res);
}
