import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Role } from "@/types/role";

export { Role };

interface User {
    userId: string;
    name: string;
    email: string | null;
    phone: string;
    organizationId: string | null;
    organizationName: string;
    roleId: string;
    roleLevel: Role;
}

interface AuthState {
    user: User | null;
    accessToken: string | null;
    isAuthenticated: boolean;
    setAuth: (user: User, token: string) => void;
    logout: () => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            user: null,
            accessToken: null,
            isAuthenticated: false,

            setAuth: (user, token) => set({ user, accessToken: token, isAuthenticated: true }),

            logout: () => set({ user: null, accessToken: null, isAuthenticated: false }),
        }),
        {
            name: "geos-auth-storage",
        }
    )
);