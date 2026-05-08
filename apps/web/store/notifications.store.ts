import { create } from "zustand";
import {
    Notification,
    getNotifications,
    markNotificationRead,
    markAllNotificationsRead,
} from "../services/notifications.service";

interface NotificationsState {
    notifications: Notification[];
    unreadCount: number;
    total: number;
    page: number;
    isLoading: boolean;

    fetch: (token: string, page?: number) => Promise<void>;
    markRead: (token: string, id: string) => Promise<void>;
    markAllRead: (token: string) => Promise<void>;
    reset: () => void;
}

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
    notifications: [],
    unreadCount: 0,
    total: 0,
    page: 1,
    isLoading: false,

    fetch: async (token, page = 1) => {
        set({ isLoading: true });
        try {
            const data = await getNotifications(token, page);
            set({
                notifications: data.notifications,
                unreadCount: data.unreadCount,
                total: data.total,
                page: data.page,
            });
        } finally {
            set({ isLoading: false });
        }
    },

    markRead: async (token, id) => {
        await markNotificationRead(token, id);
        set((state) => ({
            notifications: state.notifications.map((n) =>
                n.id === id ? { ...n, isRead: true } : n
            ),
            unreadCount: state.unreadCount - 1,
        }));
    },

    markAllRead: async (token) => {
        await markAllNotificationsRead(token);
        set((state) => ({
            notifications: state.notifications.map((n) => ({ ...n, isRead: true })),
            unreadCount: 0,
        }));
    },

    reset: () => set({
        notifications: [],
        unreadCount: 0,
        total: 0,
        page: 1,
            })
    }
));