import { create } from "zustand";
import { Role } from "@/types/role";

export { Role };

export interface User {
    userId: string;
    name: string;
    email: string | null;
    phone: string;
    organizationId: string | null;
    organizationName: string;
    organizationUrl: string | null;
    organizationTimeZone: string;
    roleId: number;
    organizationSlug?: string | null;
    roleLevel: Role;
    isAdminOrg: boolean;
    jobTitle: string | null;
    departmentId: string | null;
}

interface AuthState {
    user: User | null;
    accessToken: string | null;
    isAuthenticated: boolean;
    _hasHydrated: boolean;
    setAuth: (user: User, token: string) => void;
    setAccessToken: (token: string) => void;
    logout: () => void;
    setHasHydrated: (value: boolean) => void;
}

// Session credentials remain in memory; the HttpOnly cookie restores a reload.
export const useAuthStore = create<AuthState>()((set) => ({
    user: null,
    accessToken: null,
    isAuthenticated: false,
    _hasHydrated: false,
    setAuth: (user, token) => set({ user, accessToken: token, isAuthenticated: true }),
    setAccessToken: (token) => set({ accessToken: token }),
    logout: () => set({ user: null, accessToken: null, isAuthenticated: false }),
    setHasHydrated: (value) => set({ _hasHydrated: value }),
}));
