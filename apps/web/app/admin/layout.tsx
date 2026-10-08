"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { AuthService } from "@/services/auth.service";
import { Role } from "@/types/role";
import { useSidebarCollapsed } from "@/hooks/useSidebarCollapsed";
import { ModuleSidebar, SIDEBAR_PADDING, type SidebarNavItem } from "@/components/shell/ModuleSidebar";
import {
    LayoutDashboard,
    Building2,
    LogOut,
    Menu,
    Shield,
    Settings,
} from "lucide-react";

const NAV: SidebarNavItem[] = [
    { label: "Readiness",     href: "/admin/readiness",     icon: Shield },
    { label: "Dashboard",     href: "/admin",               icon: LayoutDashboard, exact: true },
    { label: "Organizations", shortLabel: "Orgs", href: "/admin/organizations", icon: Building2 },
    { label: "Settings",      href: "/admin/settings",      icon: Settings },
];

interface AdminSidebarProps {
    open: boolean;
    onClose: () => void;
    collapsed: boolean;
    onToggle: () => void;
}

function AdminSidebar(props: AdminSidebarProps) {
    const router    = useRouter();
    const { user, logout } = useAuthStore();
    const queryClient = useQueryClient();

    const initials = user?.name
        ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
        : "SA";

    const handleLogout = async () => {
        await AuthService.logout();
        logout();
        queryClient.clear();
        router.replace("/login");
    };

    const footer = (collapsed: boolean) =>
        collapsed ? (
            <>
                <span
                    className="mt-1 flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-[11px] font-bold text-white"
                    title={user?.name ?? "Super Admin"}
                >
                    {initials}
                </span>
                <button
                    type="button"
                    onClick={handleLogout}
                    title="Sign out"
                    className="flex w-[72px] flex-col items-center gap-1 rounded-xl px-0.5 py-2 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600"
                >
                    <LogOut className="h-[18px] w-[18px]" strokeWidth={1.6} aria-hidden="true" />
                    <span className="text-[10.5px] font-medium leading-tight">Sign out</span>
                </button>
            </>
        ) : (
            <div className="space-y-1 border-t border-slate-200 px-3 py-3">
                <div className="flex items-center gap-2.5 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-[11px] font-bold text-white">
                        {initials}
                    </span>
                    <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold text-slate-900">{user?.name}</span>
                        <span className="block text-[10px] uppercase tracking-wider text-indigo-600">Super Admin</span>
                    </span>
                </div>
                <button
                    type="button"
                    onClick={handleLogout}
                    className="flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600"
                >
                    <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.6} aria-hidden="true" />
                    Sign out
                </button>
            </div>
        );

    return (
        <ModuleSidebar
            {...props}
            id="admin-sidebar"
            title="Admin Console"
            subtitle="Gemba PMS"
            homeHref="/admin"
            brand={
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600">
                    <Shield className="h-4 w-4 text-white" />
                </span>
            }
            ariaLabel="Admin navigation"
            groups={[{ name: "Platform", items: NAV }]}
            backLink={{ label: "Main App", href: "/" }}
            footer={footer}
        />
    );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const { user, isAuthenticated, _hasHydrated } = useAuthStore();
    const router = useRouter();
    const [ready, setReady] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const { collapsed, toggle } = useSidebarCollapsed();

    useEffect(() => {
        if (!_hasHydrated) return;
        if (!isAuthenticated || !user) {
            router.replace("/login");
            return;
        }
        if (user.roleLevel !== Role.SUPER_ADMIN) {
            router.replace("/");
            return;
        }
        setReady(true);
    }, [_hasHydrated, isAuthenticated, user, router]);

    if (!ready) {
        return (
            <div className="h-screen flex items-center justify-center bg-[#0d0d14]">
                <div className="flex items-center gap-3 text-white/40 text-sm">
                    <div className="h-4 w-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    Verifying access...
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#f4f6f9]">
            <AdminSidebar
                open={sidebarOpen}
                onClose={() => setSidebarOpen(false)}
                collapsed={collapsed}
                onToggle={toggle}
            />

            <div className={`flex flex-col min-h-screen transition-all duration-300 ${collapsed ? SIDEBAR_PADDING.collapsed : SIDEBAR_PADDING.expanded}`}>
                {/* Mobile top bar */}
                <div className="lg:hidden flex items-center gap-3 px-4 h-14 bg-white border-b border-slate-200 sticky top-0 z-30">
                    <button
                        onClick={() => setSidebarOpen(true)}
                        className="p-2 -ml-1 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
                        aria-label="Open menu"
                    >
                        <Menu className="h-5 w-5" />
                    </button>
                    <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded bg-indigo-600 flex items-center justify-center">
                            <Shield className="h-3.5 w-3.5 text-white" />
                        </div>
                        <span className="text-sm font-semibold text-slate-900">Admin Console</span>
                    </div>
                </div>

                <main className="flex-1 px-4 py-5 md:px-8 md:py-7">
                    {children}
                </main>
            </div>
        </div>
    );
}
