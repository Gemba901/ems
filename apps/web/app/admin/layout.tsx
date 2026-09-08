"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useAuthStore } from "@/store/auth.store";
import { AuthService } from "@/services/auth.service";
import { Role } from "@/types/role";
import { useSidebarCollapsed } from "@/hooks/useSidebarCollapsed";
import {
    LayoutDashboard,
    Building2,
    LogOut,
    ChevronRight,
    Menu,
    Shield,
    X,
    Settings,
    Home,
    PanelLeftClose,
    PanelLeftOpen,
} from "lucide-react";

const NAV = [
    { label: "Dashboard",     href: "/admin",               icon: LayoutDashboard },
    { label: "Organizations", href: "/admin/organizations",  icon: Building2 },
    { label: "Settings",      href: "/admin/settings",       icon: Settings },
    { label: "Main App",      href: "/",                     icon: Home },
];

interface AdminSidebarProps {
    open: boolean;
    onClose: () => void;
    collapsed: boolean;
    onToggle: () => void;
}

function AdminSidebar({ open, onClose, collapsed, onToggle }: AdminSidebarProps) {
    const pathname  = usePathname();
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

    return (
        <>
            {/* Mobile backdrop */}
            {open && (
                <div
                    className="fixed inset-0 z-40 bg-black/50 md:hidden"
                    onClick={onClose}
                />
            )}

            <aside className={`
                fixed left-0 top-0 h-screen bg-[#0d0d14] flex flex-col border-r border-white/6 z-50
                transition-all duration-300 ease-in-out overflow-hidden w-64
                ${open ? "translate-x-0" : "-translate-x-full"}
                md:translate-x-0
                ${collapsed ? "md:w-16" : "md:w-64"}
            `}>
                {/* Brand + collapse toggle */}
                <div className={`flex items-center h-14 border-b border-white/6 shrink-0 ${collapsed ? "justify-center" : "px-4 gap-3"}`}>
                    <button
                        onClick={onToggle}
                        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                        className="hidden md:flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/30 hover:bg-white/8 hover:text-white/70 transition-colors"
                    >
                        {collapsed
                            ? <PanelLeftOpen className="h-4 w-4" />
                            : <PanelLeftClose className="h-4 w-4" />
                        }
                    </button>

                    {!collapsed && (
                        <>
                            <div className="h-7 w-7 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
                                <Shield className="h-3.5 w-3.5 text-white" />
                            </div>
                            <div className="min-w-0 flex flex-col">
                                <p className="text-white text-[13px] font-semibold leading-none truncate">Admin Console</p>
                                <p className="text-[10px] text-white/30 uppercase tracking-widest mt-0.5">Gemba PMS</p>
                            </div>
                            <button
                                onClick={onClose}
                                className="md:hidden ml-auto p-1 text-white/30 hover:text-white/60 transition-colors"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </>
                    )}
                </div>

                {/* Nav */}
                <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto overflow-x-hidden">
                    {!collapsed && (
                        <p className="text-[10px] text-white/20 uppercase tracking-widest px-3 pb-2 font-medium">Platform</p>
                    )}
                    {NAV.map(({ label, href, icon: Icon }) => {
                        const isActive =
                            href === "/" || href === "/admin"
                                ? pathname === href
                                : pathname.startsWith(href);
                        return (
                            <Link
                                key={href}
                                href={href}
                                onClick={onClose}
                                title={collapsed ? label : undefined}
                                className={`flex items-center rounded-xl text-[13px] font-medium transition-all ${
                                    isActive
                                        ? "bg-white/8 text-white"
                                        : "text-white/40 hover:text-white/80 hover:bg-white/4"
                                } ${collapsed ? "h-10 justify-center" : "gap-3 px-3 py-2.5"}`}
                            >
                                <Icon className="h-4 w-4 shrink-0" />
                                {!collapsed && (
                                    <>
                                        <span className="flex-1">{label}</span>
                                        {isActive && <ChevronRight className="h-3.5 w-3.5 text-white/30" />}
                                    </>
                                )}
                            </Link>
                        );
                    })}
                </nav>

                {/* User */}
                {collapsed ? (
                    <div className="mx-2 mb-2 flex justify-center py-2">
                        <div
                            className="h-8 w-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center text-[11px] font-bold"
                            title={user?.name ?? "Super Admin"}
                        >
                            {initials}
                        </div>
                    </div>
                ) : (
                    <div className="mx-2 mb-1 rounded-xl border border-white/6 bg-white/4 px-3 py-2.5 flex items-center gap-3">
                        <div className="h-7 w-7 rounded-full bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center text-[11px] font-bold shrink-0">
                            {initials}
                        </div>
                        <div className="min-w-0">
                            <p className="text-white text-[12px] font-medium truncate">{user?.name}</p>
                            <p className="text-[10px] text-indigo-400/70 uppercase tracking-wider">Super Admin</p>
                        </div>
                    </div>
                )}

                {/* Logout */}
                <div className="pb-3 px-2">
                    <button
                        onClick={handleLogout}
                        title={collapsed ? "Sign out" : undefined}
                        className={`w-full flex items-center rounded-xl text-[13px] text-white/30 hover:text-red-400 hover:bg-red-500/8 transition-all ${
                            collapsed ? "h-10 justify-center" : "gap-3 px-3 py-2.5"
                        }`}
                    >
                        <LogOut className="h-4 w-4" />
                        {!collapsed && <span>Sign out</span>}
                    </button>
                </div>
            </aside>
        </>
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

            <div className={`flex flex-col min-h-screen transition-all duration-300 ${collapsed ? "md:pl-16" : "md:pl-64"}`}>
                {/* Mobile top bar */}
                <div className="md:hidden flex items-center gap-3 px-4 h-14 bg-white border-b border-slate-200 sticky top-0 z-30">
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
